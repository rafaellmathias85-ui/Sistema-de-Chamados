'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Activity, Heart, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Cpu, Mail, Ticket, ArrowLeftRight, Bell,
  Shield, Clock, Zap, Database, Server,
} from 'lucide-react';
import AIStrategySelector from '@/components/ai-strategy-selector';
import AIHealthTest from '@/components/ai-health-test';
import AIProvidersManager from '@/components/ai-providers-manager';

interface MonitoringData {
  status: string;
  timestamp: string;
  health: Record<string, string>;
  tickets: { total: number; open: number; inProgress: number; createdLast24h: number; slaBreaching: number };
  transfers: { pending: number };
  rmm: { activeAlerts: number };
  email: { processedLast24h: number; errorsLast24h: number };
  ai: {
    configuredProviders: number;
    providers: Array<{
      name: string;
      model: string;
      priority: number;
      enabled: boolean;
      circuitBreaker: { isOpen: boolean; failures: number; halfOpenAt: string | null; creditExhausted?: boolean; lastCreditError?: string | null };
      stats: { totalRequests: number; successCount: number; failureCount: number; failoverCount: number; avgLatencyMs: number; lastUsed: string | null; availability: string };
    }>;
  };
  recentCriticalEvents: Array<{
    id: string; type: string; severity: string; entityType: string;
    actorName: string | null; createdAt: string; metadata: any;
  }>;
}

const healthIcon = (status: string) => {
  switch (status) {
    case 'ok': return <CheckCircle className="w-5 h-5 text-green-400" />;
    case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    case 'critical': return <XCircle className="w-5 h-5 text-red-400" />;
    default: return <Activity className="w-5 h-5 text-gray-400" />;
  }
};

const healthColor = (status: string) => {
  switch (status) {
    case 'ok': return 'border-green-500/30 bg-green-500/5';
    case 'warning': return 'border-yellow-500/30 bg-yellow-500/5';
    case 'critical': return 'border-red-500/30 bg-red-500/5';
    default: return 'border-gray-500/30 bg-gray-500/5';
  }
};

const healthLabels: Record<string, string> = {
  database: 'Banco de Dados',
  aiProviders: 'Provedores IA',
  email: 'Pipeline E-mail',
  sla: 'SLA',
  transfers: 'Transferências',
};

const healthIcons: Record<string, React.ReactNode> = {
  database: <Database className="w-4 h-4" />,
  aiProviders: <Cpu className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  sla: <Clock className="w-4 h-4" />,
  transfers: <ArrowLeftRight className="w-4 h-4" />,
};

export default function MonitoringPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdate(new Date().toLocaleTimeString('pt-BR'));
      }
    } catch (err) {
      console.error('Erro ao buscar métricas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 30000); // 30s
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const handleResetCB = async (providerName: string) => {
    await fetch('/api/monitoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_circuit_breaker', providerName }),
    });
    fetchMetrics();
  };

  if ((session?.user as any)?.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="tm-text-secondary">Acesso restrito a administradores.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!data) return <p className="p-6 tm-text">Erro ao carregar métricas.</p>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold tm-text">Monitoramento do Sistema</h1>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            data.status === 'ok' ? 'bg-green-500/20 text-green-400' :
            data.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {data.status === 'ok' ? 'Saudável' : data.status === 'warning' ? 'Atenção' : 'Crítico'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tm-text-muted">Atualizado: {lastUpdate}</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 tm-text-secondary'
            }`}
          >
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button onClick={fetchMetrics} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <RefreshCw className="w-4 h-4 tm-text" />
          </button>
        </div>
      </div>

      {/* Health Checks */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(data.health).map(([key, status]) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border ${healthColor(status)} flex items-center gap-3`}
          >
            <span className="tm-text-secondary">{healthIcons[key]}</span>
            {healthIcon(status)}
            <div>
              <p className="text-xs font-medium tm-text">{healthLabels[key] || key}</p>
              <p className={`text-xs ${status === 'ok' ? 'text-green-400' : status === 'warning' ? 'text-yellow-400' : 'text-red-400'}`}>
                {status === 'ok' ? 'Normal' : status === 'warning' ? 'Atenção' : 'Crítico'}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          { label: 'Tickets Abertos', value: data.tickets.open, icon: <Ticket className="w-5 h-5" />, color: 'text-blue-400' },
          { label: 'Em Andamento', value: data.tickets.inProgress, icon: <Zap className="w-5 h-5" />, color: 'text-yellow-400' },
          { label: 'Criados (24h)', value: data.tickets.createdLast24h, icon: <Clock className="w-5 h-5" />, color: 'text-purple-400' },
          { label: 'SLA Excedido', value: data.tickets.slaBreaching, icon: <AlertTriangle className="w-5 h-5" />, color: data.tickets.slaBreaching > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Alertas RMM', value: data.rmm.activeAlerts, icon: <Bell className="w-5 h-5" />, color: data.rmm.activeAlerts > 0 ? 'text-orange-400' : 'text-green-400' },
          { label: 'Transferências', value: data.transfers.pending, icon: <ArrowLeftRight className="w-5 h-5" />, color: data.transfers.pending > 0 ? 'text-orange-400' : 'text-green-400' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white/5 rounded-xl p-4 border border-white/10"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={kpi.color}>{kpi.icon}</span>
              <p className="text-xs tm-text-secondary">{kpi.label}</p>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Health Check Manual */}
      <AIHealthTest />

      {/* Provedores de IA */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold tm-text">Provedores de IA</h2>
            <span className="text-xs tm-text-muted">({data.ai.configuredProviders} configurado{data.ai.configuredProviders !== 1 ? 's' : ''})</span>
          </div>
          <AIStrategySelector />
        </div>
        
        {data.ai.providers.length === 0 ? (
          <p className="text-sm tm-text-muted">Nenhum provedor configurado.</p>
        ) : (
          <div className="space-y-3">
            {data.ai.providers.map((p) => (
              <div key={p.name} className={`p-4 rounded-lg border ${
                p.circuitBreaker.isOpen ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-white/5'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-400" />
                    <span className="font-medium tm-text">{p.name}</span>
                    <span className="text-xs tm-text-muted">({p.model})</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">P{p.priority}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.circuitBreaker.isOpen ? (
                      <>
                        <span className={`text-xs font-medium ${p.circuitBreaker.creditExhausted ? 'text-orange-400' : 'text-red-400'}`}>
                          {p.circuitBreaker.creditExhausted ? 'Crédito/Auth (5min)' : 'Circuit Breaker ABERTO'}
                        </span>
                        <button
                          onClick={() => handleResetCB(p.name)}
                          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          Resetar
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <Heart className="w-3 h-3" /> Online
                      </span>
                    )}
                  </div>
                </div>
                {p.circuitBreaker.creditExhausted && p.circuitBreaker.lastCreditError && (
                  <div className="mb-3 p-2 rounded bg-orange-500/10 border border-orange-500/30 text-xs text-orange-300 break-words font-mono">
                    🔑 {p.circuitBreaker.lastCreditError}
                  </div>
                )}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                  <div>
                    <p className="tm-text-muted">Requisições</p>
                    <p className="tm-text font-medium">{p.stats.totalRequests}</p>
                  </div>
                  <div>
                    <p className="tm-text-muted">Sucesso</p>
                    <p className="text-green-400 font-medium">{p.stats.successCount}</p>
                  </div>
                  <div>
                    <p className="tm-text-muted">Falhas</p>
                    <p className={`font-medium ${p.stats.failureCount > 0 ? 'text-red-400' : 'tm-text'}`}>{p.stats.failureCount}</p>
                  </div>
                  <div>
                    <p className="tm-text-muted">Failovers</p>
                    <p className={`font-medium ${p.stats.failoverCount > 0 ? 'text-yellow-400' : 'tm-text'}`}>{p.stats.failoverCount}</p>
                  </div>
                  <div>
                    <p className="tm-text-muted">Latência Média</p>
                    <p className="tm-text font-medium">{p.stats.avgLatencyMs}ms</p>
                  </div>
                  <div>
                    <p className="tm-text-muted">Disponibilidade</p>
                    <p className="tm-text font-medium">{p.stats.availability}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gerenciamento de Provedores de IA (CRUD) */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold tm-text">Gerenciar Provedores de IA</h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ADMIN</span>
        </div>
        <AIProvidersManager />
      </div>

      {/* E-mail Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold tm-text">Pipeline de E-mail (24h)</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs tm-text-muted">Processados</p>
              <p className="text-2xl font-bold text-green-400">{data.email.processedLast24h}</p>
            </div>
            <div>
              <p className="text-xs tm-text-muted">Erros</p>
              <p className={`text-2xl font-bold ${data.email.errorsLast24h > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {data.email.errorsLast24h}
              </p>
            </div>
          </div>
        </div>

        {/* Segurança */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold tm-text">Eventos Críticos (última hora)</h2>
          </div>
          {data.recentCriticalEvents.length === 0 ? (
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <p className="text-sm">Nenhum evento crítico</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {data.recentCriticalEvents.map((evt) => (
                <div key={evt.id} className={`flex items-center gap-2 text-xs p-2 rounded ${
                  evt.severity === 'critical' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {evt.severity === 'critical' ? <XCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  <span className="font-medium">{evt.type}</span>
                  <span className="tm-text-muted">{evt.entityType}</span>
                  {evt.actorName && <span className="tm-text-muted">por {evt.actorName}</span>}
                  <span className="ml-auto tm-text-muted">
                    {new Date(evt.createdAt).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
