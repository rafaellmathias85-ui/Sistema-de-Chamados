'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  Monitor,
  Network,
  Filter,
  Bell,
  BellOff,
  X,
  Ticket,
  Trash2,
} from 'lucide-react';

interface Alert {
  id: string;
  machineId: string;
  machine: { hostname: string; company: { name: string } };
  policyId: string | null;
  alertType: string;
  message: string;
  severity: string;
  thresholdValue: number | null;
  actualValue: number | null;
  acknowledged: boolean;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  actionTaken: string | null;
  ticketId: string | null;
  createdAt: string;
}

export default function AlertsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'acked'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<Alert | null>(null);

  const fetchAlerts = async () => {
    try {
      const acked = filter === 'pending' ? 'false' : filter === 'acked' ? 'true' : '';
      const url = `/api/rmm/alerts?limit=100${acked ? `&acknowledged=${acked}` : ''}`;
      const res = await fetch(url);
      if (res.ok) setAlerts(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); fetchAlerts(); }, [filter]);
  useEffect(() => {
    const interval = setInterval(() => { fetchAlerts(); }, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const handleAction = async (alertId: string, action: 'close' | 'create_ticket') => {
    setProcessingId(alertId);
    try {
      const res = await fetch('/api/rmm/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action }),
      });
      if (res.ok) {
        const data = await res.json();
        setActionModal(null);
        fetchAlerts();
        if (data.ticketId) {
          router.push(`/tickets/${data.ticketId}`);
        }
      }
    } catch { /* ignore */ }
    finally { setProcessingId(null); }
  };

  const severityColors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  const typeLabels: Record<string, string> = {
    cpu_high: 'CPU Alta',
    ram_high: 'RAM Alta',
    disk_high: 'Disco Alto',
    offline: 'Offline',
    long_offline: 'Offline 30+ dias',
    snmp_offline: 'Rede Offline',
    service_stopped: 'Serviço Parado',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tickets/rmm" className="p-2 tm-text-secondary hover:tm-text transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold tm-text">Alertas RMM</h1>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 tm-text-secondary" />
        {(['pending', 'acked', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'tm-bg-card tm-text-secondary hover:tm-text'}`}>
            {f === 'pending' ? 'Pendentes' : f === 'acked' ? 'Reconhecidos' : 'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 tm-text-secondary">
          <BellOff className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum alerta {filter === 'pending' ? 'pendente' : filter === 'acked' ? 'reconhecido' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(a => (
            <motion.div key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-xl p-4 border ${severityColors[a.severity] || severityColors.warning} ${a.acknowledged ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {a.alertType === 'snmp_offline' ? (
                    <Network className={`w-5 h-5 flex-shrink-0 mt-0.5 ${a.severity === 'critical' ? 'text-red-400' : 'text-cyan-400'}`} />
                  ) : (
                    <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${a.severity === 'critical' ? 'text-red-400' : a.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'}`} />
                  )}
                  <div>
                    <p className="tm-text font-medium">{a.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-sm tm-text-secondary flex-wrap">
                      {a.alertType === 'snmp_offline' ? (
                        <><Network className="w-3.5 h-3.5" /><Link href="/tickets/rmm/network" className="hover:text-cyan-400">Rede</Link></>
                      ) : (
                        <><Monitor className="w-3.5 h-3.5" /><Link href={`/tickets/rmm/machine/${a.machineId}`} className="hover:text-blue-400">{a.machine.hostname}</Link></>
                      )}
                      <span>•</span>
                      <span>{a.machine.company?.name}</span>
                      <span>•</span>
                      <span>{typeLabels[a.alertType] || a.alertType}</span>
                      <span>•</span>
                      <span>{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    {a.resolvedAt && (
                      <p className="text-xs text-green-400 mt-1">✓ Auto-resolvido em {new Date(a.resolvedAt).toLocaleString('pt-BR')}</p>
                    )}
                    {a.acknowledged && a.acknowledgedByName && (
                      <p className="text-xs tm-text-muted mt-1">
                        Reconhecido por {a.acknowledgedByName} em {new Date(a.acknowledgedAt!).toLocaleString('pt-BR')}
                        {a.actionTaken === 'ticket_created' && a.ticketId && (
                          <> — <Link href={`/tickets/${a.ticketId}`} className="text-blue-400 hover:underline">Ver Chamado</Link></>
                        )}
                        {a.actionTaken === 'closed' && <> — Fechado</>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!a.acknowledged && (
                    <button
                      onClick={() => setActionModal(a)}
                      disabled={processingId === a.id}
                      className="flex items-center gap-1 px-3 py-1.5 tm-bg-card hover:bg-blue-600/20 tm-text rounded-lg text-sm transition-colors disabled:opacity-50 border tm-border"
                    >
                      {processingId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Reconhecer
                    </button>
                  )}
                  {a.acknowledged && (
                    <button
                      onClick={async () => {
                        if (!confirm('Excluir este alerta permanentemente?')) return;
                        setProcessingId(a.id);
                        try {
                          const res = await fetch('/api/rmm/alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alertId: a.id }) });
                          if (res.ok) { setAlerts(prev => prev.filter(x => x.id !== a.id)); }
                          else { const d = await res.json(); alert(d.error || 'Erro'); }
                        } catch { alert('Erro ao excluir'); }
                        finally { setProcessingId(null); }
                      }}
                      disabled={processingId === a.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50 border border-red-500/20"
                    >
                      {processingId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal de ação */}
      <AnimatePresence>
        {actionModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'var(--modal-overlay)' }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="tm-bg-card rounded-2xl border tm-border shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold tm-text">Reconhecer Alerta</h3>
                <button onClick={() => setActionModal(null)} className="tm-text-secondary hover:tm-text"><X className="w-5 h-5" /></button>
              </div>
              <p className="tm-text-secondary text-sm mb-4">{actionModal.message}</p>
              <p className="tm-text-muted text-xs mb-6">{actionModal.machine.hostname} • {actionModal.machine.company?.name}</p>

              <div className="space-y-3">
                <button
                  onClick={() => handleAction(actionModal.id, 'create_ticket')}
                  disabled={!!processingId}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50"
                >
                  {processingId === actionModal.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ticket className="w-5 h-5" />}
                  <div className="text-left">
                    <p className="font-medium">Abrir Chamado</p>
                    <p className="text-xs text-blue-200">Cria ticket automaticamente com dados do alerta</p>
                  </div>
                </button>
                <button
                  onClick={() => handleAction(actionModal.id, 'close')}
                  disabled={!!processingId}
                  className="w-full flex items-center gap-3 px-4 py-3 tm-bg-card border tm-border hover:border-red-500/30 tm-text rounded-xl transition-colors disabled:opacity-50"
                >
                  {processingId === actionModal.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5 text-red-400" />}
                  <div className="text-left">
                    <p className="font-medium">Apenas Fechar</p>
                    <p className="text-xs tm-text-muted">Reconhece e encerra o alerta sem criar chamado</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
