import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/mfa';
import {
  invalidateProvidersCache,
  isBuiltinProvider,
  getAllProvidersForAdmin,
} from '@/lib/ai-providers';

export const dynamic = 'force-dynamic';

/**
 * Mascara uma chave para exibição segura.
 * Ex.: "sk-abcd1234efgh5678" -> "sk-***...5678"
 */
function maskKey(key: string): string {
  if (!key) return '';
  const last = key.slice(-4);
  const prefix = key.startsWith('sk-') ? 'sk-' : (key.startsWith('AI') ? key.slice(0, 4) : '');
  return `${prefix}***...${last}`;
}

/**
 * GET /api/admin/ai-providers
 * Lista todos os provedores (built-in + custom), incluindo desabilitados.
 * Mascara as chaves antes de retornar (NUNCA expor em texto plano).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    // Busca direto do DB para metadados completos (isCustom, apiKeyEnc presente, etc.)
    const dbConfigs = await prisma.aIProviderConfig.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    const dbByName = new Map(dbConfigs.map(c => [c.name, c]));

    // Lista mesclada via getAllProvidersForAdmin (já merged com built-ins)
    const merged = await getAllProvidersForAdmin();

    const providers = merged.map(p => {
      const dbRow = dbByName.get(p.name);
      const builtin = isBuiltinProvider(p.name);

      // Determinar se há chave configurada e mascará-la
      let hasKey = false;
      let keyPreview = '';

      if (builtin) {
        const envVal = process.env[p.apiKeyEnv];
        hasKey = !!envVal;
        if (envVal) keyPreview = maskKey(envVal);
      } else if (dbRow?.apiKeyEnc) {
        hasKey = true;
        // Não decifrar para mascarar — usar apiKeyHint salvo separadamente, ou genérico
        keyPreview = '***...****';
      }

      return {
        id: dbRow?.id || `builtin:${p.name}`,
        name: p.name,
        endpoint: p.endpoint,
        model: p.model,
        priority: p.priority,
        weight: p.weight,
        enabled: p.enabled,
        bestFor: p.bestFor,
        isBuiltin: builtin,
        isCustom: !builtin,
        hasKey,
        keyPreview,
        apiFormat: dbRow?.apiFormat || 'openai_compatible',
        apiKeyEnv: builtin ? p.apiKeyEnv : null,
      };
    });

    return NextResponse.json({ providers });
  } catch (err) {
    console.error('[AI Providers GET]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/admin/ai-providers
 * Cria um provedor custom (built-ins não podem ser duplicados).
 * Body: {
 *   name, endpoint, model, apiKey,
 *   priority?, weight?, enabled?, bestFor?, apiFormat?
 * }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      name,
      endpoint,
      model,
      apiKey,
      priority,
      weight,
      enabled,
      bestFor,
      apiFormat,
    } = body || {};

    // Validações
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }
    if (name.length > 50) {
      return NextResponse.json({ error: 'Nome muito longo (máx. 50)' }, { status: 400 });
    }
    if (isBuiltinProvider(name)) {
      return NextResponse.json(
        { error: `'${name}' é um provedor reservado (built-in)` },
        { status: 400 }
      );
    }
    if (!endpoint || typeof endpoint !== 'string' || !/^https?:\/\//.test(endpoint)) {
      return NextResponse.json({ error: 'Endpoint deve ser uma URL http(s) válida' }, { status: 400 });
    }
    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'Modelo é obrigatório' }, { status: 400 });
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return NextResponse.json({ error: 'API Key inválida (mín. 10 caracteres)' }, { status: 400 });
    }

    // Verifica duplicata
    const exists = await prisma.aIProviderConfig.findUnique({ where: { name } });
    if (exists) {
      return NextResponse.json({ error: `Provedor '${name}' já existe` }, { status: 400 });
    }

    // Criptografa chave
    let apiKeyEnc: string;
    try {
      apiKeyEnc = encryptSecret(apiKey.trim());
    } catch (err) {
      console.error('[AI Providers POST] Erro ao criptografar:', err);
      return NextResponse.json(
        { error: 'Erro ao criptografar API key (verifique MFA_ENCRYPTION_KEY)' },
        { status: 500 }
      );
    }

    // bestFor sanitization
    const validBestFor = ['fast', 'creative', 'complex', 'general'];
    const bestForCsv = Array.isArray(bestFor)
      ? bestFor.filter((v: string) => validBestFor.includes(v)).join(',')
      : 'general';

    const created = await prisma.aIProviderConfig.create({
      data: {
        name: name.trim(),
        endpoint: endpoint.trim(),
        model: model.trim(),
        apiKeyEnc,
        priority: typeof priority === 'number' ? Math.max(1, Math.min(99, priority)) : 99,
        weight: typeof weight === 'number' ? Math.max(1, Math.min(100, weight)) : 1,
        enabled: enabled !== false,
        bestFor: bestForCsv || 'general',
        isCustom: true,
        apiFormat: apiFormat === 'anthropic' ? 'anthropic' : 'openai_compatible',
      },
    });

    invalidateProvidersCache();

    console.log(`[AI Providers] Provedor custom '${name}' criado por ${session.user.email}`);

    return NextResponse.json({
      success: true,
      provider: {
        id: created.id,
        name: created.name,
        endpoint: created.endpoint,
        model: created.model,
        priority: created.priority,
        weight: created.weight,
        enabled: created.enabled,
        bestFor: created.bestFor.split(',').filter(Boolean),
        isCustom: true,
        hasKey: true,
        apiFormat: created.apiFormat,
      },
    });
  } catch (err) {
    console.error('[AI Providers POST]', err);
    return NextResponse.json({ error: 'Erro interno ao criar provedor' }, { status: 500 });
  }
}
