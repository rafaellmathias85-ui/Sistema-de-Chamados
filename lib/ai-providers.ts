/**
 * Gerenciador de Provedores de IA com Circuit Breaker, Retry e Routing Strategy.
 *
 * Estratégias suportadas (configurável via env AI_ROUTING_STRATEGY ou AppSetting `ai.strategy`):
 *   - failover       : prioridade fixa, P1 → P2 → P3 (default, mais conservador)
 *   - round_robin    : alterna sequencialmente entre provedores ativos
 *   - weighted       : seleção probabilística baseada em pesos (vide AI_WEIGHTS)
 *   - task_based     : escolhe por tipo de tarefa (fast/creative/complex)
 *   - least_latency  : escolhe o provedor com menor latência média recente
 *
 * Em qualquer estratégia, falha de um provedor cai automaticamente para o próximo (failover de segurança).
 */

import { prisma } from './db';

export interface AIProvider {
  name: string;
  endpoint: string;
  apiKeyEnv: string;
  model: string;
  priority: number;
  weight: number;
  enabled: boolean;
  // Características para roteamento por tipo de tarefa
  bestFor: ('fast' | 'creative' | 'complex' | 'general')[];
}

export type AIStrategy = 'failover' | 'round_robin' | 'weighted' | 'task_based' | 'least_latency';
export type AITaskType = 'fast' | 'creative' | 'complex' | 'general';

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  halfOpenAt: number;
  /**
   * Quando true, indica que o circuit breaker abriu devido a erro de
   * crédito/autenticação (402, 401, 403 ou mensagem específica) e está
   * em pausa longa (5min) para evitar desperdício.
   */
  creditExhausted: boolean;
  lastCreditError?: string;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30000;
const CIRCUIT_BREAKER_CREDIT_RESET_MS = 300000; // 5 minutos para erros de crédito/auth
const CIRCUIT_BREAKER_MAX_OPEN_MS = 600000;     // 10 minutos máximo
const RETRY_DELAYS = [1000, 3000, 5000];
const REQUEST_TIMEOUT = 45000;
const HEALTH_CHECK_TIMEOUT = 10000;

const circuitBreakers = new Map<string, CircuitBreakerState>();
const providerStats = new Map<string, {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  failoverCount: number;
  totalLatencyMs: number;
  lastUsed: number;
  // Janela móvel das últimas 20 latências para least_latency
  recentLatencies: number[];
}>();

// Round-robin counter
let rrCounter = 0;

/**
 * Cache de strategy lida do banco (TTL 30s para evitar query a cada chamada).
 */
let cachedStrategy: { value: AIStrategy; expiresAt: number } | null = null;

async function getStrategy(): Promise<AIStrategy> {
  // 1) Cache em memória
  if (cachedStrategy && cachedStrategy.expiresAt > Date.now()) {
    return cachedStrategy.value;
  }

  // 2) Tenta ler do banco (AppSetting `ai.strategy`)
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: 'ai.strategy' } });
    if (setting?.value) {
      const v = setting.value as AIStrategy;
      if (['failover', 'round_robin', 'weighted', 'task_based', 'least_latency'].includes(v)) {
        cachedStrategy = { value: v, expiresAt: Date.now() + 30000 };
        return v;
      }
    }
  } catch {
    // Banco indisponível → cai no env / default
  }

  // 3) Env var
  const envStrategy = process.env.AI_ROUTING_STRATEGY as AIStrategy | undefined;
  if (envStrategy && ['failover', 'round_robin', 'weighted', 'task_based', 'least_latency'].includes(envStrategy)) {
    cachedStrategy = { value: envStrategy, expiresAt: Date.now() + 30000 };
    return envStrategy;
  }

  // 4) Default seguro
  cachedStrategy = { value: 'failover', expiresAt: Date.now() + 30000 };
  return 'failover';
}

export async function setStrategy(strategy: AIStrategy): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: 'ai.strategy' },
    update: { value: strategy },
    create: { key: 'ai.strategy', value: strategy },
  });
  cachedStrategy = { value: strategy, expiresAt: Date.now() + 30000 };
  console.log(`[AI Provider] Estratégia alterada para: ${strategy}`);
}

export async function getCurrentStrategy(): Promise<AIStrategy> {
  return await getStrategy();
}

/**
 * Defaults dos 3 provedores built-in (Abacus, OpenAI, Gemini).
 * Estes sempre existem; admin pode editar priority/weight/enabled
 * mas não pode remover.
 */
const BUILTIN_DEFAULTS: Array<Omit<AIProvider, 'enabled'>> = [
  {
    name: 'AbacusAI',
    endpoint: 'https://apps.abacus.ai/v1/chat/completions',
    apiKeyEnv: 'ABACUSAI_API_KEY',
    model: 'gpt-4.1-mini',
    priority: 1,
    weight: 2,
    bestFor: ['general', 'complex'],
  },
  {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    priority: 2,
    weight: 2,
    bestFor: ['fast', 'general'],
  },
  {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    apiKeyEnv: 'GEMINI_API_KEY',
    model: 'gemini-2.0-flash',
    priority: 3,
    weight: 1,
    bestFor: ['creative', 'fast'],
  },
];

const BUILTIN_NAMES = new Set(BUILTIN_DEFAULTS.map(p => p.name));

export function isBuiltinProvider(name: string): boolean {
  return BUILTIN_NAMES.has(name);
}

/**
 * Cache de provedores (TTL 30s) para evitar query a cada chamada.
 */
let cachedProviders: { value: AIProvider[]; expiresAt: number } | null = null;

export function invalidateProvidersCache() {
  cachedProviders = null;
}

/**
 * Lista de provedores configurados, fundidos a partir de:
 *  1) Defaults built-in (Abacus, OpenAI, Gemini) - hardcoded
 *  2) Overrides do banco (AIProviderConfig com isCustom=false) - sobrescreve priority/weight/enabled/model
 *  3) Custom providers do banco (AIProviderConfig com isCustom=true) - apiKey decifrado a quente
 *
 * Pesos default também podem ser sobrescritos via env AI_WEIGHT_<NAME> para os built-in.
 */
async function getConfiguredProviders(): Promise<AIProvider[]> {
  if (cachedProviders && cachedProviders.expiresAt > Date.now()) {
    return cachedProviders.value;
  }

  // 1) Lê todos os configs do DB
  let dbConfigs: Array<{
    name: string;
    endpoint: string;
    model: string;
    apiKeyEnv: string | null;
    apiKeyEnc: string | null;
    priority: number;
    weight: number;
    enabled: boolean;
    bestFor: string;
    isCustom: boolean;
  }> = [];
  try {
    dbConfigs = await prisma.aIProviderConfig.findMany();
  } catch (err) {
    console.warn('[AI Provider] Falha ao ler AIProviderConfig do DB, usando apenas defaults:', err);
  }

  const dbByName = new Map(dbConfigs.map(c => [c.name, c]));

  const result: AIProvider[] = [];

  // 2) Built-in com merge de overrides do DB
  for (const def of BUILTIN_DEFAULTS) {
    const override = dbByName.get(def.name);
    const apiKeyEnv = def.apiKeyEnv;
    const hasKey = !!process.env[apiKeyEnv];

    const provider: AIProvider = {
      name: def.name,
      endpoint: override?.endpoint || def.endpoint,
      apiKeyEnv,
      model: override?.model || def.model,
      priority: override?.priority ?? def.priority,
      weight: override?.weight ?? parseInt(process.env[`AI_WEIGHT_${def.name.toUpperCase().replace(/\s+/g, '_')}`] || String(def.weight), 10),
      enabled: (override?.enabled ?? true) && hasKey,
      bestFor: override?.bestFor
        ? (override.bestFor.split(',').map(s => s.trim()).filter(Boolean) as ('fast' | 'creative' | 'complex' | 'general')[])
        : def.bestFor,
    };
    result.push(provider);
  }

  // 3) Custom providers (apiKey decifrado a quente, mantido em memória)
  for (const cfg of dbConfigs) {
    if (!cfg.isCustom) continue;
    if (!cfg.enabled) {
      // Mesmo desabilitado, incluir para que metrics mostre (mas não para callAI).
      result.push({
        name: cfg.name,
        endpoint: cfg.endpoint,
        apiKeyEnv: `__CUSTOM_${cfg.name}__`, // sentinel; não usado
        model: cfg.model,
        priority: cfg.priority,
        weight: cfg.weight,
        enabled: false,
        bestFor: (cfg.bestFor.split(',').map(s => s.trim()).filter(Boolean) as ('fast' | 'creative' | 'complex' | 'general')[]),
      });
      continue;
    }
    if (!cfg.apiKeyEnc) continue; // sem chave -> ignorar
    try {
      // Decifra na hora — chave fica apenas em memória
      // (require dinâmico para evitar dep cíclica)
      const { decryptSecret } = await import('./mfa');
      const apiKey = decryptSecret(cfg.apiKeyEnc);

      // Sentinel name para que tryProviderWithRetry use a chave em memória via map abaixo
      const sentinelEnv = `__CUSTOM_${cfg.name}__`;
      // armazena na env temporariamente
      process.env[sentinelEnv] = apiKey;

      result.push({
        name: cfg.name,
        endpoint: cfg.endpoint,
        apiKeyEnv: sentinelEnv,
        model: cfg.model,
        priority: cfg.priority,
        weight: cfg.weight,
        enabled: true,
        bestFor: (cfg.bestFor.split(',').map(s => s.trim()).filter(Boolean) as ('fast' | 'creative' | 'complex' | 'general')[]),
      });
    } catch (err) {
      console.error(`[AI Provider] Falha ao decifrar chave do provedor custom ${cfg.name}:`, err);
    }
  }

  // Filtra enabled e ordena por priority
  const filtered = result
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  cachedProviders = { value: filtered, expiresAt: Date.now() + 30000 };
  return filtered;
}

/**
 * Variante que retorna TODOS (incluindo desabilitados) — usado pelo painel admin.
 */
export async function getAllProvidersForAdmin(): Promise<AIProvider[]> {
  // Sempre fresh (sem cache) para painel admin
  const oldCache = cachedProviders;
  cachedProviders = null;
  await getConfiguredProviders(); // popula cache + sentinel envs
  cachedProviders = oldCache;

  let dbConfigs: Array<{ name: string; endpoint: string; model: string; apiKeyEnv: string | null; priority: number; weight: number; enabled: boolean; bestFor: string; isCustom: boolean }> = [];
  try {
    dbConfigs = await prisma.aIProviderConfig.findMany();
  } catch {}
  const dbByName = new Map(dbConfigs.map(c => [c.name, c]));

  const result: AIProvider[] = [];
  for (const def of BUILTIN_DEFAULTS) {
    const override = dbByName.get(def.name);
    const hasKey = !!process.env[def.apiKeyEnv];
    result.push({
      name: def.name,
      endpoint: override?.endpoint || def.endpoint,
      apiKeyEnv: def.apiKeyEnv,
      model: override?.model || def.model,
      priority: override?.priority ?? def.priority,
      weight: override?.weight ?? def.weight,
      enabled: (override?.enabled ?? true) && hasKey,
      bestFor: override?.bestFor
        ? (override.bestFor.split(',').map(s => s.trim()).filter(Boolean) as ('fast' | 'creative' | 'complex' | 'general')[])
        : def.bestFor,
    });
  }
  for (const cfg of dbConfigs) {
    if (!cfg.isCustom) continue;
    result.push({
      name: cfg.name,
      endpoint: cfg.endpoint,
      apiKeyEnv: `__CUSTOM_${cfg.name}__`,
      model: cfg.model,
      priority: cfg.priority,
      weight: cfg.weight,
      enabled: cfg.enabled,
      bestFor: (cfg.bestFor.split(',').map(s => s.trim()).filter(Boolean) as ('fast' | 'creative' | 'complex' | 'general')[]),
    });
  }
  return result.sort((a, b) => a.priority - b.priority);
}

function getCircuitBreaker(providerName: string): CircuitBreakerState {
  if (!circuitBreakers.has(providerName)) {
    circuitBreakers.set(providerName, {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
      halfOpenAt: 0,
      creditExhausted: false,
      lastCreditError: undefined,
    });
  }
  return circuitBreakers.get(providerName)!;
}

/**
 * Detecta se o erro retornado pelo provedor sugere problema de crédito/auth
 * (402, 401, 403 ou mensagens específicas). Estes erros NÃO se resolvem com
 * retry imediato — recuperar pode levar horas ou dias.
 */
function isCreditOrAuthError(status: number, body: string): boolean {
  if (status === 402 || status === 401 || status === 403) return true;
  // Padrões textuais conhecidos
  const patterns = /\b(insufficient|insufficient_quota|quota[_ ]exceeded|out of credits|no credits|payment required|billing|subscription|api key|invalid_key|unauthorized|exceeded.*credit)\b/i;
  return patterns.test(body);
}

function isProviderAvailable(providerName: string): boolean {
  const cb = getCircuitBreaker(providerName);
  if (!cb.isOpen) return true;
  if (Date.now() >= cb.halfOpenAt) return true;
  if (cb.lastFailure > 0 && (Date.now() - cb.lastFailure) > CIRCUIT_BREAKER_MAX_OPEN_MS) {
    console.log(`[AI Provider] Forcing circuit breaker RESET for ${providerName} (open too long)`);
    cb.failures = 0;
    cb.isOpen = false;
    cb.halfOpenAt = 0;
    return true;
  }
  return false;
}

function recordSuccess(providerName: string, latency: number) {
  const cb = getCircuitBreaker(providerName);
  cb.failures = 0;
  cb.isOpen = false;
  cb.halfOpenAt = 0;
  cb.creditExhausted = false;
  cb.lastCreditError = undefined;

  const stats = getProviderStats(providerName);
  stats.successCount++;
  stats.recentLatencies.push(latency);
  if (stats.recentLatencies.length > 20) stats.recentLatencies.shift();
}

function recordFailure(providerName: string) {
  const cb = getCircuitBreaker(providerName);
  cb.failures++;
  cb.lastFailure = Date.now();

  if (cb.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    cb.isOpen = true;
    cb.halfOpenAt = Date.now() + CIRCUIT_BREAKER_RESET_MS;
    console.warn(`[AI Provider] Circuit breaker ABERTO para ${providerName}. Próxima tentativa em ${CIRCUIT_BREAKER_RESET_MS / 1000}s`);
  }

  const stats = getProviderStats(providerName);
  stats.failureCount++;
}

/**
 * Marca falha por crédito/auth: abre o circuit breaker IMEDIATAMENTE
 * por 5 minutos, evitando desperdício de tentativas em provedor
 * que está com créditos zerados ou chave inválida.
 */
function recordCreditFailure(providerName: string, status: number, errorBody: string) {
  const cb = getCircuitBreaker(providerName);
  cb.failures = CIRCUIT_BREAKER_THRESHOLD; // força contagem ao máximo
  cb.lastFailure = Date.now();
  cb.isOpen = true;
  cb.halfOpenAt = Date.now() + CIRCUIT_BREAKER_CREDIT_RESET_MS;
  cb.creditExhausted = true;
  cb.lastCreditError = `[${status}] ${errorBody.substring(0, 200)}`;

  console.error(
    `[AI Provider] ${providerName} CRÉDITO/AUTH ERROR (${status}). ` +
    `Pausado por ${CIRCUIT_BREAKER_CREDIT_RESET_MS / 1000}s. ` +
    `Erro: ${errorBody.substring(0, 200)}`
  );

  const stats = getProviderStats(providerName);
  stats.failureCount++;
}

function getProviderStats(providerName: string) {
  if (!providerStats.has(providerName)) {
    providerStats.set(providerName, {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      failoverCount: 0,
      totalLatencyMs: 0,
      lastUsed: 0,
      recentLatencies: [],
    });
  }
  return providerStats.get(providerName)!;
}

function getRecentAvgLatency(providerName: string): number {
  const stats = getProviderStats(providerName);
  if (stats.recentLatencies.length === 0) return Infinity;
  return stats.recentLatencies.reduce((a, b) => a + b, 0) / stats.recentLatencies.length;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Aplica a estratégia escolhida e retorna a ORDEM em que os provedores serão tentados.
 * O primeiro é o "primário" da request; os demais ficam como fallback se ele falhar.
 */
function applyStrategy(
  providers: AIProvider[],
  strategy: AIStrategy,
  taskType: AITaskType = 'general',
): AIProvider[] {
  if (providers.length <= 1) return providers;

  switch (strategy) {
    case 'failover':
      // Ordem fixa por priority (já vem ordenado)
      return [...providers];

    case 'round_robin': {
      // Rotaciona o array com base em um contador global
      const idx = rrCounter % providers.length;
      rrCounter = (rrCounter + 1) % Number.MAX_SAFE_INTEGER;
      return [...providers.slice(idx), ...providers.slice(0, idx)];
    }

    case 'weighted': {
      // Seleção ponderada (sem reposição) - escolhe o primário por peso, demais como fallback ordenado
      const totalWeight = providers.reduce((s, p) => s + Math.max(p.weight, 0.1), 0);
      let r = Math.random() * totalWeight;
      let chosenIdx = 0;
      for (let i = 0; i < providers.length; i++) {
        r -= Math.max(providers[i].weight, 0.1);
        if (r <= 0) { chosenIdx = i; break; }
      }
      const chosen = providers[chosenIdx];
      const rest = providers.filter((_, i) => i !== chosenIdx);
      return [chosen, ...rest];
    }

    case 'task_based': {
      // Promove os que têm o taskType na lista bestFor
      const matching = providers.filter(p => p.bestFor.includes(taskType));
      const others = providers.filter(p => !p.bestFor.includes(taskType));
      return [...matching, ...others];
    }

    case 'least_latency': {
      // Ordena por menor latência média recente; quem não tem histórico fica por último
      const sorted = [...providers].sort((a, b) => {
        const la = getRecentAvgLatency(a.name);
        const lb = getRecentAvgLatency(b.name);
        return la - lb;
      });
      return sorted;
    }

    default:
      return [...providers];
  }
}

/**
 * Tenta uma request num provedor com retries.
 */
async function tryProviderWithRetry(
  provider: AIProvider,
  messages: Array<{ role: string; content: string | null; tool_calls?: any; tool_call_id?: string }>,
  options: { stream: boolean; maxTokens: number; temperature: number; tools?: any[] },
): Promise<{ response: Response; provider: AIProvider } | null> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) return null;

  const maxRetries = provider.name === 'AbacusAI' ? RETRY_DELAYS.length : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 5000;
      console.log(`[AI Provider] Retry #${attempt} para ${provider.name} em ${delay}ms...`);
      await sleep(delay);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const startTime = Date.now();

    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          stream: options.stream,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      if (response.ok) {
        recordSuccess(provider.name, latency);
        const stats = getProviderStats(provider.name);
        stats.totalRequests++;
        stats.totalLatencyMs += latency;
        stats.lastUsed = Date.now();
        console.log(`[AI Provider] ${provider.name} OK (${latency}ms, tentativa ${attempt + 1})`);
        return { response, provider };
      }

      const status = response.status;
      const errBody = await response.text().catch(() => 'N/A');

      // Detecção de crédito/auth — pausa LONGA (5min)
      if (isCreditOrAuthError(status, errBody)) {
        recordCreditFailure(provider.name, status, errBody);
        return null; // failover imediato para próximo provedor
      }

      if (status === 429 || status >= 500) {
        console.warn(`[AI Provider] ${provider.name} retornou ${status} (tentativa ${attempt + 1}/${maxRetries}): ${errBody.substring(0, 100)}`);
        recordFailure(provider.name);
        continue;
      }

      console.error(`[AI Provider] ${provider.name} erro ${status}: ${errBody.substring(0, 200)}`);
      recordFailure(provider.name);
      return null;
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      console.warn(`[AI Provider] ${provider.name} ${isAbort ? 'timeout' : 'erro'} (tentativa ${attempt + 1}/${maxRetries}):`, isAbort ? 'Timeout 45s' : (err instanceof Error ? err.message : err));
      recordFailure(provider.name);
    }
  }

  return null;
}

/**
 * Função principal: aplica a estratégia configurada e dispara para o(s) provedor(es).
 */
export async function callAIWithResilience(
  messages: Array<{ role: string; content: string | null; tool_calls?: any; tool_call_id?: string }>,
  options: { stream?: boolean; maxTokens?: number; temperature?: number; tools?: any[]; taskType?: AITaskType } = {},
): Promise<{ response: Response; providerName: string } | { error: string; status: number }> {
  const allProviders = await getConfiguredProviders();

  if (allProviders.length === 0) {
    console.error('[AI Provider] Nenhum provedor configurado!');
    return { error: 'Nenhum provedor de IA configurado', status: 503 };
  }

  const opts = {
    stream: options.stream ?? true,
    maxTokens: options.maxTokens ?? 2000,
    temperature: options.temperature ?? 0.5,
    tools: options.tools,
    taskType: options.taskType ?? 'general',
  };

  const strategy = await getStrategy();
  const ordered = applyStrategy(allProviders, strategy, opts.taskType);

  console.log(`[AI Provider] Estratégia: ${strategy} | Ordem: ${ordered.map(p => p.name).join(' → ')}`);

  let failoverOccurred = false;

  for (const provider of ordered) {
    if (!isProviderAvailable(provider.name)) {
      console.log(`[AI Provider] ${provider.name} indisponível (circuit breaker aberto), pulando...`);
      failoverOccurred = true;
      continue;
    }

    const result = await tryProviderWithRetry(provider, messages, opts);
    if (result) {
      if (failoverOccurred) {
        const stats = getProviderStats(result.provider.name);
        stats.failoverCount++;
        console.log(`[AI Provider] Failover: usando ${result.provider.name} (provedor de backup)`);
      }
      return { response: result.response, providerName: result.provider.name };
    }

    failoverOccurred = true;
  }

  // Recovery: reset forçado e última tentativa em ordem de prioridade
  console.warn('[AI Provider] Todos os provedores falharam. Reset forçado e tentativa final...');
  for (const p of allProviders) {
    const cb = getCircuitBreaker(p.name);
    cb.failures = 0;
    cb.isOpen = false;
    cb.halfOpenAt = 0;
  }

  for (const provider of allProviders) {
    const result = await tryProviderWithRetry(provider, messages, opts);
    if (result) {
      const stats = getProviderStats(result.provider.name);
      stats.failoverCount++;
      console.log(`[AI Provider] Recovery: usando ${result.provider.name} (após reset forçado)`);
      return { response: result.response, providerName: result.provider.name };
    }
  }

  console.error('[AI Provider] Todos os provedores falharam (mesmo após reset)!');
  return { error: 'Todos os provedores de IA estão indisponíveis. Tente novamente em alguns instantes.', status: 503 };
}

/**
 * Métricas dos provedores para a UI de monitoramento.
 */
export async function getAIProviderMetrics() {
  const providers = await getAllProvidersForAdmin();
  const metrics = providers.map(p => {
    const stats = getProviderStats(p.name);
    const cb = getCircuitBreaker(p.name);
    return {
      name: p.name,
      model: p.model,
      priority: p.priority,
      weight: p.weight,
      enabled: p.enabled,
      bestFor: p.bestFor,
      circuitBreaker: {
        isOpen: cb.isOpen,
        failures: cb.failures,
        halfOpenAt: cb.halfOpenAt > 0 ? new Date(cb.halfOpenAt).toISOString() : null,
        creditExhausted: cb.creditExhausted,
        lastCreditError: cb.lastCreditError || null,
      },
      stats: {
        totalRequests: stats.totalRequests,
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        failoverCount: stats.failoverCount,
        avgLatencyMs: stats.totalRequests > 0 ? Math.round(stats.totalLatencyMs / stats.totalRequests) : 0,
        recentAvgLatencyMs: stats.recentLatencies.length > 0 ? Math.round(getRecentAvgLatency(p.name)) : 0,
        lastUsed: stats.lastUsed > 0 ? new Date(stats.lastUsed).toISOString() : null,
        availability: stats.totalRequests > 0
          ? `${((stats.successCount / stats.totalRequests) * 100).toFixed(1)}%`
          : 'N/A',
      },
    };
  });

  return {
    configuredProviders: providers.length,
    providers: metrics,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reseta o circuit breaker de um provedor (para admin).
 */
export function resetCircuitBreaker(providerName: string) {
  const cb = getCircuitBreaker(providerName);
  cb.failures = 0;
  cb.isOpen = false;
  cb.halfOpenAt = 0;
  cb.creditExhausted = false;
  cb.lastCreditError = undefined;
  console.log(`[AI Provider] Circuit breaker resetado para ${providerName}`);
}

/**
 * Executa um health check em um único provedor enviando uma mensagem mínima.
 * Retorna sucesso/erro + latência. Não atualiza o circuit breaker para evitar
 * que testes repetidos prejudiquem o tráfego real.
 */
async function checkSingleProvider(provider: AIProvider): Promise<{
  name: string;
  model: string;
  status: 'ok' | 'credit_error' | 'error' | 'timeout' | 'no_key';
  httpStatus?: number;
  latencyMs: number;
  error?: string;
}> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) {
    return {
      name: provider.name,
      model: provider.model,
      status: 'no_key',
      latencyMs: 0,
      error: `API key ausente (${provider.apiKeyEnv})`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
  const startTime = Date.now();

  try {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        temperature: 0,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        name: provider.name,
        model: provider.model,
        status: 'ok',
        httpStatus: response.status,
        latencyMs: latency,
      };
    }

    const body = await response.text().catch(() => 'N/A');
    const isCredit = isCreditOrAuthError(response.status, body);

    return {
      name: provider.name,
      model: provider.model,
      status: isCredit ? 'credit_error' : 'error',
      httpStatus: response.status,
      latencyMs: latency,
      error: body.substring(0, 250),
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const latency = Date.now() - startTime;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      name: provider.name,
      model: provider.model,
      status: isAbort ? 'timeout' : 'error',
      latencyMs: latency,
      error: isAbort ? `Timeout ${HEALTH_CHECK_TIMEOUT}ms` : (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Health check em todos os provedores configurados, em paralelo.
 * Usado pelo endpoint /api/admin/ai-health para validação manual.
 */
export async function runHealthCheck() {
  const providers = await getConfiguredProviders();
  const results = await Promise.all(providers.map(p => checkSingleProvider(p)));

  const okCount = results.filter(r => r.status === 'ok').length;
  const totalProviders = results.length;

  return {
    overall: okCount > 0 ? (okCount === totalProviders ? 'all_ok' : 'partial') : 'all_down',
    okCount,
    totalProviders,
    results,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Lista enxuta de provedores configurados (para uso externo, sem expor estados internos).
 */
export async function listConfiguredProviders() {
  const providers = await getConfiguredProviders();
  return providers.map(p => ({
    name: p.name,
    model: p.model,
    priority: p.priority,
    enabled: p.enabled,
  }));
}
