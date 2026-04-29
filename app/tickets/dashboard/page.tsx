'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Building2,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Timer,
  ShieldAlert,
  RotateCcw,
  Zap,
  Filter,
  Ticket,
  XCircle,
} from 'lucide-react';

interface DashboardData {
  totalOpen: number;
  byStatus: { status: string; _count: { id: number } }[];
  byPriority: { priority: string; _count: { id: number } }[];
  slaAtRisk: number;
  slaBreached: number;
  closedInPeriod: number;
  reopenedInPeriod: number;
  avgResponseMinutes: number;
  avgResolutionHours: number;
  ranking: { id: string; name: string; total: number; resolved: number; open: number }[];
  clientRanking: { companyId: string; companyName: string; total: number; open: number }[];
  oldestOpen: { id: string; number: number; subject: string; createdAt: string; priority: string; company: { name: string } }[];
}

interface Anomaly {
  type: string;
  severity: string;
  message: string;
  detail?: string;
}

const statusLabels: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em Andamento',
  IN_PARTNER: 'Parceiro',
  PAUSED: 'Pausado',
  AWAITING_CLIENT: 'Aguard. Cliente',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-500',
  IN_PROGRESS: 'bg-cyan-500',
  IN_PARTNER: 'bg-purple-500',
  PAUSED: 'bg-gray-400',
  AWAITING_CLIENT: 'bg-yellow-500',
  RESOLVED: 'bg-green-500',
  CLOSED: 'bg-gray-500',
};

const priorityLabels: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-green-500',
  MEDIUM: 'bg-yellow-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
};

/**
 * Tocar beep para chamar atenção de um novo chamado.
 * Usa Web Audio API (funciona em todos os browsers modernos).
 */
function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    // 2o beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = 1320;
    gain2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.45);
    gain2.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.47);
    gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.85);
    osc2.start(ctx.currentTime + 0.45);
    osc2.stop(ctx.currentTime + 0.85);
  } catch (e) {
    console.warn('[Dashboard] Erro ao tocar beep:', e);
  }
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState({ companyId: '', assigneeId: '', status: '', priority: '' });
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevTotalOpenRef = useRef<number>(-1);
  const prevSlaAtRiskRef = useRef<number>(-1);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    else if (status === 'authenticated') {
      if (!['ADMIN', 'SUPPORT', 'FINANCE'].includes(session?.user?.role || '')) {
        router.push('/tickets');
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch('/api/companies?limit=500'),
          fetch('/api/users?role=SUPPORT,ADMIN&limit=100'),
        ]);
        if (cRes.ok) { const d = await cRes.json(); setCompanies(Array.isArray(d) ? d : d.companies || []); }
        if (sRes.ok) { const d = await sRes.json(); setStaff(Array.isArray(d) ? d : d.users || []); }
      } catch {}
    })();
  }, [status]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      if (filters.companyId) params.set('companyId', filters.companyId);
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      const [dashRes, anomRes] = await Promise.all([
        fetch(`/api/dashboard?${params}`, { cache: 'no-store' }),
        fetch('/api/events/anomalies', { cache: 'no-store' }),
      ]);
      if (dashRes.ok) {
        const newData: DashboardData = await dashRes.json();
        // Toca som se aumentar chamados abertos (novo ticket) ou SLA em risco
        if (silent && soundEnabled && prevTotalOpenRef.current >= 0) {
          const newTickets = newData.totalOpen - prevTotalOpenRef.current;
          const newSlaAtRisk = newData.slaAtRisk - prevSlaAtRiskRef.current;
          if (newTickets > 0 || newSlaAtRisk > 0) {
            playAlertBeep();
          }
        }
        prevTotalOpenRef.current = newData.totalOpen;
        prevSlaAtRiskRef.current = newData.slaAtRisk;
        setData(newData);
      }
      if (anomRes.ok) {
        const anomData = await anomRes.json();
        setAnomalies(anomData.anomalies || []);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
    if (!silent) setLoading(false);
  }, [dateRange, filters, soundEnabled]);

  useEffect(() => {
    if (status === 'authenticated') loadData(false);
  }, [status, loadData]);

  // Auto-refresh a cada 2 minutos (ideal para painel operacional em TV 24h)
  useEffect(() => {
    if (status !== 'authenticated' || !autoRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 120000); // 2 min
    return () => clearInterval(interval);
  }, [status, autoRefresh, loadData]);

  if (status === 'loading' || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const maxPriority = data ? Math.max(...data.byPriority.map((p) => p._count.id), 1) : 1;
  const totalTickets = data ? data.byStatus.reduce((s, b) => s + b._count.id, 0) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tm-text flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-cyan-400" />
            Painel Operacional
          </h1>
          <p className="text-sm tm-text-secondary mt-1">Visão em tempo real da operação</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <span className="tm-text-muted">a</span>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <button
            onClick={() => loadData(false)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <label className="flex items-center gap-2 text-xs tm-text-secondary cursor-pointer select-none px-3 py-1.5 border tm-border rounded-lg hover:border-cyan-500 transition" title="Atualiza automaticamente a cada 2 minutos (ideal para TV 24h)">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-cyan-500"
            />
            Auto 2min
          </label>
          <label className="flex items-center gap-2 text-xs tm-text-secondary cursor-pointer select-none px-3 py-1.5 border tm-border rounded-lg hover:border-cyan-500 transition" title="Som ao detectar novos chamados ou SLA em risco">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="accent-cyan-500"
            />
            🔊 Som
          </label>
          <span className="text-xs tm-text-muted" title={`Última atualização: ${lastRefresh.toLocaleString('pt-BR')}`}>
            {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-3 tm-bg-card border tm-border rounded-xl">
        <Filter className="w-4 h-4 tm-text-secondary shrink-0" />
        <select
          value={filters.companyId}
          onChange={(e) => setFilters({ ...filters, companyId: e.target.value })}
          className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500 min-w-[160px]"
        >
          <option value="">Todas Empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filters.assigneeId}
          onChange={(e) => setFilters({ ...filters, assigneeId: e.target.value })}
          className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500 min-w-[160px]"
        >
          <option value="">Todos Responsáveis</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500 min-w-[140px]"
        >
          <option value="">Todos Status</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500 min-w-[130px]"
        >
          <option value="">Todas Prioridades</option>
          {Object.entries(priorityLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(filters.companyId || filters.assigneeId || filters.status || filters.priority) && (
          <button
            onClick={() => setFilters({ companyId: '', assigneeId: '', status: '', priority: '' })}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg transition"
          >
            <XCircle className="w-3 h-3" /> Limpar
          </button>
        )}
      </div>

      {/* Anomaly Bar */}
      {anomalies.length > 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">
              {anomalies.length} anomalia(s) detectada(s)
            </span>
          </div>
          <div className="space-y-1">
            {anomalies.slice(0, 3).map((a, i) => (
              <p key={i} className="text-xs text-yellow-300/80">
                • {a.message}{a.detail ? ` — ${a.detail}` : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* KPI Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
            <KpiCard
              label="Abertos"
              value={data.totalOpen}
              icon={Ticket}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
            />
            <KpiCard
              label="SLA em Risco"
              value={data.slaAtRisk}
              icon={ShieldAlert}
              color="text-yellow-400"
              bgColor="bg-yellow-500/10"
            />
            <KpiCard
              label="SLA Violado"
              value={data.slaBreached}
              icon={XCircle}
              color="text-red-400"
              bgColor="bg-red-500/10"
            />
            <KpiCard
              label="Fechados"
              value={data.closedInPeriod}
              icon={CheckCircle2}
              color="text-green-400"
              bgColor="bg-green-500/10"
            />
            <KpiCard
              label="Reabertos"
              value={data.reopenedInPeriod}
              icon={RotateCcw}
              color="text-orange-400"
              bgColor="bg-orange-500/10"
            />
            <KpiCard
              label="Resp. Média"
              value={data.avgResponseMinutes > 0 ? `${Math.round(data.avgResponseMinutes)}min` : '--'}
              icon={Timer}
              color="text-cyan-400"
              bgColor="bg-cyan-500/10"
            />
          </div>

          {/* Status + Priority Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Distribution */}
            <div className="tm-bg-card border tm-border rounded-xl p-5">
              <h3 className="text-sm font-semibold tm-text mb-4">Distribuição por Status</h3>
              <div className="space-y-3">
                {data.byStatus.map((s) => {
                  const pct = totalTickets > 0 ? (s._count.id / totalTickets) * 100 : 0;
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="tm-text">{statusLabels[s.status] || s.status}</span>
                        <span className="tm-text font-medium">{s._count.id}</span>
                      </div>
                      <div className="h-2 tm-bg-card rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${statusColors[s.status] || 'bg-gray-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Priority Distribution */}
            <div className="tm-bg-card border tm-border rounded-xl p-5">
              <h3 className="text-sm font-semibold tm-text mb-4">Distribuição por Prioridade</h3>
              <div className="flex items-end gap-3 h-40">
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => {
                  const item = data.byPriority.find((x) => x.priority === p);
                  const count = item?._count.id || 0;
                  const pct = (count / maxPriority) * 100;
                  return (
                    <div key={p} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-xs tm-text font-medium">{count}</span>
                      <div className="w-full tm-bg-card rounded-t-lg overflow-hidden" style={{ height: '120px' }}>
                        <div
                          className={`w-full rounded-t-lg transition-all ${priorityColors[p]}`}
                          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                        />
                      </div>
                      <span className="text-xs tm-text-secondary">{priorityLabels[p]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rankings Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tech Ranking */}
            <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b tm-border">
                <h3 className="text-sm font-semibold tm-text flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Ranking de Técnicos
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {data.ranking.length === 0 ? (
                  <p className="text-sm tm-text-muted p-5">Sem dados</p>
                ) : (
                  data.ranking.slice(0, 8).map((t, i) => (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 tm-text' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'tm-bg-card text-white-muted'
                        }`}>
                          {i + 1}
                        </span>
                        <span className="text-sm tm-text">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="tm-text-muted">{t.total} total</span>
                        <span className="text-green-400">{t.resolved} res.</span>
                        <span className="text-blue-400">{t.open} abertos</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Client Ranking */}
            <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b tm-border">
                <h3 className="text-sm font-semibold tm-text flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  Ranking de Clientes
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {data.clientRanking.length === 0 ? (
                  <p className="text-sm tm-text-muted p-5">Sem dados</p>
                ) : (
                  data.clientRanking.slice(0, 8).map((c, i) => (
                    <div key={c.companyId} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full tm-bg-card flex items-center justify-center text-xs tm-text-muted font-bold">
                          {i + 1}
                        </span>
                        <span className="text-sm tm-text">{c.companyName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="tm-text-muted">{c.total} total</span>
                        <span className="text-blue-400">{c.open} abertos</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Oldest Open Tickets */}
          {data.oldestOpen.length > 0 && (
            <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b tm-border">
                <h3 className="text-sm font-semibold tm-text flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  Chamados Abertos Mais Antigos
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {data.oldestOpen.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/tickets/${t.id}`)}
                    className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[t.priority]}`} />
                      <span className="text-xs tm-text-muted">#{t.number}</span>
                      <span className="text-sm tm-text truncate">{t.subject}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs tm-text-muted flex-shrink-0">
                      <span>{t.company?.name}</span>
                      <span>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="tm-text-muted text-center py-20">Erro ao carregar dados</p>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="tm-bg-card border tm-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${bgColor}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-bold tm-text">{value}</p>
      <p className="text-xs tm-text-secondary mt-0.5">{label}</p>
    </div>
  );
}
