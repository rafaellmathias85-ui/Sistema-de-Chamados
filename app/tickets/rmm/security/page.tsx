'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, ShieldAlert, AlertTriangle, Eye, Ban, Check,
  RefreshCw, Filter, ChevronLeft, Search, Loader2, Trash2, Building2,
} from 'lucide-react';

interface SecurityEvent {
  id: string;
  machineId: string;
  eventId: number;
  username: string | null;
  ipAddress: string | null;
  message: string | null;
  timestamp: string;
  machine: { hostname: string; ipAddress: string | null; company: { name: string } };
}

interface SecurityAlert {
  id: string;
  machineId: string;
  type: string;
  severity: string;
  description: string | null;
  ipAddress: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  machine: { hostname: string; ipAddress: string | null; company: { name: string } };
}

const eventLabels: Record<number, { label: string; color: string }> = {
  4625: { label: 'Login Falho', color: 'text-red-400' },
  4624: { label: 'Login OK', color: 'text-green-400' },
  4672: { label: 'Privilégio Elevado', color: 'text-yellow-400' },
  4688: { label: 'Novo Processo', color: 'text-blue-400' },
};

export default function SecurityPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<'events' | 'alerts'>('alerts');
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState('pending');
  const [companyFilter, setCompanyFilter] = useState('');
  const [blocking, setBlocking] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadEvents = useCallback(async () => {
    const params = new URLSearchParams();
    if (eventFilter) params.append('eventId', eventFilter);
    const res = await fetch(`/api/rmm/security/events?${params}`);
    if (res.ok) setEvents(await res.json());
  }, [eventFilter]);

  const loadAlerts = useCallback(async () => {
    const params = new URLSearchParams();
    if (alertFilter === 'pending') params.append('resolved', 'false');
    else if (alertFilter === 'resolved') params.append('resolved', 'true');
    const res = await fetch(`/api/rmm/security/alerts?${params}`);
    if (res.ok) setAlerts(await res.json());
  }, [alertFilter]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;
    if (!['ADMIN', 'SUPPORT'].includes(session?.user?.role || '')) { router.push('/tickets'); return; }
    setLoading(true);
    Promise.all([loadEvents(), loadAlerts()]).finally(() => setLoading(false));
  }, [status, session, router, loadEvents, loadAlerts]);

  const handleResolve = async (id: string) => {
    await fetch('/api/rmm/security/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadAlerts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este alerta permanentemente?')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/rmm/security/alerts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== id));
      } else {
        const d = await res.json();
        window.alert(d.error || 'Erro ao excluir');
      }
    } finally { setDeletingId(null); }
  };

  const handleBlockIP = async (alert: SecurityAlert) => {
    if (!alert.ipAddress) return;
    if (!confirm(`Bloquear IP ${alert.ipAddress} na máquina ${alert.machine.hostname}?`)) return;
    setBlocking(alert.id);
    try {
      const res = await fetch('/api/rmm/security/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: alert.machineId, ipAddress: alert.ipAddress, alertId: alert.id }),
      });
      const data = await res.json();
      if (res.ok) { loadAlerts(); }
      else window.alert(data.error || 'Erro ao bloquear');
    } finally { setBlocking(null); }
  };

  const refresh = () => { loadEvents(); loadAlerts(); };

  const fmt = (d: string) => new Date(d).toLocaleString('pt-BR');

  const alertCompanies = useMemo(() => {
    const names = [...new Set(alerts.map(a => a.machine.company?.name).filter(Boolean))];
    return names.sort();
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (companyFilter && a.machine.company?.name !== companyFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (a.machine.hostname.toLowerCase().includes(s) || a.ipAddress?.toLowerCase().includes(s) || a.description?.toLowerCase().includes(s));
    });
  }, [alerts, companyFilter, search]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (companyFilter && e.machine.company?.name !== companyFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (e.machine.hostname.toLowerCase().includes(s) || e.username?.toLowerCase().includes(s) || e.ipAddress?.toLowerCase().includes(s));
    });
  }, [events, companyFilter, search]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-400" size={32} /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/tickets/rmm')} className="p-2 hover:bg-white/10 rounded-lg"><ChevronLeft size={20} /></button>
        <Shield className="text-red-400" size={28} />
        <div>
          <h1 className="text-xl font-bold tm-text">Monitoramento de Segurança</h1>
          <p className="tm-text-secondary text-sm">Mini-SIEM — Eventos e alertas de segurança</p>
        </div>
        <button onClick={refresh} className="ml-auto p-2 hover:bg-white/10 rounded-lg tm-text-secondary"><RefreshCw size={18} /></button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: 'Eventos Totais', val: events.length, icon: Eye, color: 'text-blue-400' },
          { label: 'Logins Falhos', val: events.filter(e => e.eventId === 4625).length, icon: ShieldAlert, color: 'text-red-400' },
          { label: 'Alertas Ativos', val: alerts.filter(a => !a.resolved).length, icon: AlertTriangle, color: 'text-yellow-400' },
          { label: 'IPs Bloqueados', val: alerts.filter(a => a.resolved && a.type === 'BRUTE_FORCE').length, icon: Ban, color: 'text-green-400' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="tm-bg-card border tm-border rounded-xl p-4">
            <s.icon className={`${s.color} mb-2`} size={20} />
            <div className="text-2xl font-bold tm-text">{s.val}</div>
            <div className="text-xs tm-text-secondary">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Tabs + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex tm-bg-card rounded-lg p-1">
          {(['alerts', 'events'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-blue-600 tm-text' : 'tm-text-secondary hover:text-white'}`}>
              {t === 'alerts' ? 'Alertas' : 'Eventos'}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm focus:outline-none focus:border-blue-500" placeholder="Buscar..." />
        </div>

        {/* Company filter */}
        <div className="flex items-center gap-1.5">
          <Building2 size={15} className="tm-text-secondary" />
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
            className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
            <option value="">Todos os clientes</option>
            {alertCompanies.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {tab === 'events' && (
          <select value={eventFilter} onChange={e => setEventFilter(e.target.value)}
            className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
            <option value="">Todos eventos</option>
            <option value="4625">4625 - Login Falho</option>
            <option value="4624">4624 - Login OK</option>
            <option value="4672">4672 - Privilégio</option>
            <option value="4688">4688 - Processo</option>
          </select>
        )}
        {tab === 'alerts' && (
          <select value={alertFilter} onChange={e => setAlertFilter(e.target.value)}
            className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">
            <option value="pending">Ativos</option>
            <option value="resolved">Resolvidos</option>
            <option value="all">Todos</option>
          </select>
        )}
      </div>

      {/* Alerts Tab */}
      {tab === 'alerts' && (
        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12 tm-text-muted"><Shield size={40} className="mx-auto mb-3 opacity-30" /><p>Nenhum alerta encontrado</p></div>
          ) : filteredAlerts.map(a => (
            <motion.div key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`tm-bg-card border rounded-xl p-4 ${a.resolved ? 'tm-border opacity-60' : a.severity === 'HIGH' ? 'border-red-500/50' : 'border-yellow-500/50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      a.severity === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                      a.severity === 'CRITICAL' ? 'bg-red-600/30 text-red-300' :
                      a.severity === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>{a.severity}</span>
                    <span className="tm-text font-medium text-sm">{a.type.replace('_', ' ')}</span>
                    <span className="tm-text-muted text-xs">• {a.machine.hostname}</span>
                    <span className="tm-text-secondary text-xs font-medium">• {a.machine.company?.name}</span>
                  </div>
                  <p className="tm-text text-sm">{a.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs tm-text-muted">
                    {a.ipAddress && <span>IP: <span className="tm-text">{a.ipAddress}</span></span>}
                    <span>{fmt(a.createdAt)}</span>
                    {a.resolved && <span className="text-green-400">Resolvido por {a.resolvedBy} em {fmt(a.resolvedAt!)}</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!a.resolved && (
                    <>
                      {a.ipAddress && (
                        <button onClick={() => handleBlockIP(a)} disabled={blocking === a.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
                          {blocking === a.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} Bloquear IP
                        </button>
                      )}
                      <button onClick={() => handleResolve(a.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors">
                        <Check size={14} /> Resolver
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-lg border border-red-500/20 transition-colors disabled:opacity-50"
                  >
                    {deletingId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Excluir
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b tm-border">
                <th className="text-left px-3 py-2 text-xs tm-text-secondary uppercase">Timestamp</th>
                <th className="text-left px-3 py-2 text-xs tm-text-secondary uppercase">Máquina</th>
                <th className="text-left px-3 py-2 text-xs tm-text-secondary uppercase">Cliente</th>
                <th className="text-left px-3 py-2 text-xs tm-text-secondary uppercase">Evento</th>
                <th className="text-left px-3 py-2 text-xs tm-text-secondary uppercase">Usuário</th>
                <th className="text-left px-3 py-2 text-xs tm-text-secondary uppercase">IP</th>
                <th className="text-left px-3 py-2 text-xs tm-text-secondary uppercase">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 tm-text-muted">Nenhum evento registrado</td></tr>
              ) : filteredEvents.map(e => {
                const info = eventLabels[e.eventId] || { label: `Event ${e.eventId}`, color: 'tm-text-secondary' };
                return (
                  <tr key={e.id} className="border-b tm-border hover:tm-bg-card">
                    <td className="px-3 py-2 text-xs tm-text-secondary whitespace-nowrap">{fmt(e.timestamp)}</td>
                    <td className="px-3 py-2 text-sm tm-text">{e.machine.hostname}</td>
                    <td className="px-3 py-2 text-sm tm-text-secondary">{e.machine.company?.name}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-medium ${info.color}`}>{info.label}</span></td>
                    <td className="px-3 py-2 text-sm tm-text">{e.username || '-'}</td>
                    <td className="px-3 py-2 text-sm tm-text font-mono">{e.ipAddress || '-'}</td>
                    <td className="px-3 py-2 text-xs tm-text-secondary max-w-xs truncate">{e.message || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
