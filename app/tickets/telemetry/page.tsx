'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Info,
  AlertOctagon,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Zap,
  TrendingUp,
  Clock,
  Search,
} from 'lucide-react';

interface SystemEvent {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  severity: string;
  actorId: string | null;
  actorName: string | null;
  metadata: any;
  createdAt: string;
}

interface Anomaly {
  type: string;
  severity: string;
  message: string;
  detail?: string;
  entityId?: string;
  count?: number;
  avg?: number;
}

const severityConfig: Record<string, { color: string; icon: any; label: string }> = {
  info: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Info, label: 'Info' },
  warning: { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', icon: AlertTriangle, label: 'Aviso' },
  error: { color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', icon: AlertOctagon, label: 'Erro' },
  critical: { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: AlertOctagon, label: 'Crítico' },
};

const typeLabels: Record<string, string> = {
  ticket_created: 'Chamado criado',
  status_change: 'Mudança de status',
  ticket_closed: 'Chamado fechado',
  ticket_deleted: 'Chamado excluído',
  ticket_transferred: 'Chamado transferido',
  assignee_change: 'Chamado movido/reatribuído',
  client_reply: 'Resposta do cliente',
  internal_note: 'Nota interna',
  sla_warning: 'Alerta SLA',
  sla_breached: 'SLA violado',
  security_alert: 'Alerta de segurança',
};

export default function TelemetryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: '',
    severity: '',
    entityType: '',
    search: '',
  });
  const pageSize = 30;

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    else if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      router.push('/tickets');
    }
  }, [status, session, router]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (filters.type) params.set('type', filters.type);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.entityType) params.set('entityType', filters.entityType);

      const res = await fetch(`/api/events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Erro ao carregar eventos:', err);
    }
    setLoading(false);
  }, [page, filters]);

  const loadAnomalies = useCallback(async () => {
    try {
      const res = await fetch('/api/events/anomalies');
      if (res.ok) {
        const data = await res.json();
        setAnomalies(data.anomalies || []);
      }
    } catch (err) {
      console.error('Erro ao carregar anomalias:', err);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      loadEvents();
      loadAnomalies();
    }
  }, [status, loadEvents, loadAnomalies]);

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (status === 'loading' || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tm-text flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-400" />
            Telemetria &amp; Eventos
          </h1>
          <p className="text-sm tm-text-secondary mt-1">Monitoramento em tempo real de atividades do sistema</p>
        </div>
        <button
          onClick={() => { loadEvents(); loadAnomalies(); }}
          className="flex items-center gap-2 px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-yellow-400 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Anomalias Detectadas ({anomalies.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {anomalies.map((a, i) => (
              <div
                key={i}
                className={`p-4 rounded-xl border ${
                  a.severity === 'critical'
                    ? 'bg-red-500/10 border-red-500/30'
                    : a.severity === 'warning'
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-orange-500/10 border-orange-500/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      a.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium tm-text">{a.message}</p>
                    {a.detail && <p className="text-xs tm-text-secondary mt-1">{a.detail}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 tm-bg-card border tm-border rounded-xl">
        <Filter className="w-4 h-4 tm-text-secondary" />
        <select
          value={filters.type}
          onChange={(e) => { setFilters({ ...filters, type: e.target.value }); setPage(1); }}
          className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(typeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filters.severity}
          onChange={(e) => { setFilters({ ...filters, severity: e.target.value }); setPage(1); }}
          className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <option value="">Todas as severidades</option>
          <option value="info">Info</option>
          <option value="warning">Aviso</option>
          <option value="error">Erro</option>
          <option value="critical">Crítico</option>
        </select>
        <select
          value={filters.entityType}
          onChange={(e) => { setFilters({ ...filters, entityType: e.target.value }); setPage(1); }}
          className="tm-bg-card border tm-border rounded-lg px-3 py-1.5 text-sm tm-text focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <option value="">Todas as entidades</option>
          <option value="ticket">Chamado</option>
          <option value="machine">Máquina</option>
          <option value="user">Usuário</option>
        </select>
      </div>

      {/* Events Timeline */}
      <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b tm-border flex items-center justify-between">
          <h2 className="text-sm font-semibold tm-text">Linha do Tempo</h2>
          <span className="text-xs tm-text-muted">{total} evento(s)</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 tm-text-muted">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Nenhum evento encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {events.map((evt) => {
              const sev = severityConfig[evt.severity] || severityConfig.info;
              const SevIcon = sev.icon;
              return (
                <div key={evt.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition flex items-start gap-4">
                  <div className={`p-2 rounded-lg border ${sev.color} flex-shrink-0`}>
                    <SevIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium tm-text">
                        {typeLabels[evt.type] || evt.type}
                      </span>
                      <span className="text-xs tm-text-muted">#{evt.entityId.slice(-6)}</span>
                      {evt.actorName && (
                        <span className="text-xs tm-text-secondary">por {evt.actorName}</span>
                      )}
                    </div>
                    {evt.metadata && (
                      <p className="text-xs tm-text-muted mt-0.5 truncate">
                        {typeof evt.metadata === 'object'
                          ? Object.entries(evt.metadata)
                              .filter(([k]) => k !== 'ticketNumber')
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' | ')
                          : String(evt.metadata)}
                      </p>
                    )}
                  </div>
                  <div className="text-xs tm-text-muted whitespace-nowrap flex-shrink-0">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {formatDate(evt.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t tm-border flex items-center justify-between">
            <span className="text-xs tm-text-muted">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1.5 rounded tm-bg-card border tm-border tm-text-secondary hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1.5 rounded tm-bg-card border tm-border tm-text-secondary hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
