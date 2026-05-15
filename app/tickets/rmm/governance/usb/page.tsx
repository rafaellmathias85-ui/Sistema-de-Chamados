'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Usb, ChevronLeft, RefreshCw, Search, Loader2,
  Shield, Plus, Trash2, Check, X, AlertTriangle,
} from 'lucide-react';
import MachineFilter from '@/components/rmm/machine-filter';

interface UsbEvent {
  id: string;
  deviceId: string;
  deviceName: string | null;
  deviceType: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  action: string;
  policyApplied: string | null;
  username: string | null;
  eventAt: string;
  machine: { hostname: string; company: { id: string; name: string } };
}

interface UsbPolicy {
  id: string;
  name: string;
  action: string;
  deviceType: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  isActive: boolean;
  appliesToAll: boolean;
}

export default function UsbPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'events' | 'policies'>('events');
  const [events, setEvents] = useState<UsbEvent[]>([]);
  const [policies, setPolicies] = useState<UsbPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', action: 'block', deviceType: '', vendorId: '', productId: '', serialNumber: '', appliesToAll: true });
  const [saving, setSaving] = useState(false);
  const [filterMachine, setFilterMachine] = useState('');

  const loadEvents = useCallback(async () => {
    if (!filterMachine) { setEvents([]); return; }
    const params = new URLSearchParams({ limit: '200', machineId: filterMachine });
    const res = await fetch(`/api/rmm/governance/usb-events?${params}`);
    if (res.ok) setEvents(await res.json());
  }, [filterMachine]);

  const loadPolicies = useCallback(async () => {
    const res = await fetch('/api/rmm/governance/policies/usb');
    if (res.ok) setPolicies(await res.json());
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([loadEvents(), loadPolicies()]).finally(() => setLoading(false));
  }, [session, loadEvents, loadPolicies]);

  const handleCreatePolicy = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/rmm/governance/policies/usb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await loadPolicies();
        setShowForm(false);
        setFormData({ name: '', action: 'block', deviceType: '', vendorId: '', productId: '', serialNumber: '', appliesToAll: true });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Remover esta política?')) return;
    await fetch(`/api/rmm/governance/policies/usb?id=${id}`, { method: 'DELETE' });
    await loadPolicies();
  };

  const handleTogglePolicy = async (policy: UsbPolicy) => {
    await fetch('/api/rmm/governance/policies/usb', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: policy.id, isActive: !policy.isActive }),
    });
    await loadPolicies();
  };

  const filteredEvents = events.filter(e =>
    !search ||
    (e.deviceName || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.deviceId || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.machine?.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.machine?.company?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.username || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Usb className="text-orange-400" size={28} />
            Controle USB
          </h1>
          <p className="tm-text-secondary mt-1">Eventos de dispositivos e políticas de bloqueio</p>
        </div>
        <Link href="/tickets/rmm/governance" className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
          <ChevronLeft size={14} /> Governance
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b tm-border pb-2">
        {([['events', 'Eventos USB', Usb], ['policies', 'Políticas', Shield]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === key ? 'bg-blue-600 text-white' : 'tm-text-secondary hover:bg-white/10'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Machine Filter (empresa + máquina) */}
      {tab === 'events' && <MachineFilter value={filterMachine} onChange={setFilterMachine} />}

      {tab === 'events' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
            <input type="text" placeholder="Buscar por dispositivo, host, empresa..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
          </div>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Usb className="mx-auto mb-3 opacity-30" size={48} />
              <p>{filterMachine ? 'Nenhum evento USB registrado' : 'Selecione uma máquina para ver eventos USB'}</p>
            </div>
          ) : (
            <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b tm-border text-left">
                      <th className="px-4 py-3 tm-text-secondary font-medium">AÇÃO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">DISPOSITIVO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">TIPO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">SERIAL</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">USUÁRIO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">HOSTNAME</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">EMPRESA</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">POLÍTICA</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">DATA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((ev, i) => (
                      <motion.tr key={ev.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className="border-b tm-border hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            ev.action === 'blocked' ? 'bg-red-500/20 text-red-400' :
                            ev.action === 'connected' ? 'bg-green-500/20 text-green-400' :
                            ev.action === 'disconnected' ? 'bg-gray-500/20 tm-text-secondary' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {ev.action === 'connected' ? 'Conectado' :
                             ev.action === 'disconnected' ? 'Desconectado' :
                             ev.action === 'blocked' ? 'Bloqueado' : ev.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 tm-text text-xs">{ev.deviceName || ev.deviceId || '—'}</td>
                        <td className="px-4 py-3 tm-text-secondary text-xs">{ev.deviceType || '—'}</td>
                        <td className="px-4 py-3 font-mono tm-text-muted text-xs">{ev.serialNumber || '—'}</td>
                        <td className="px-4 py-3 tm-text text-xs">{ev.username || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs tm-text">{ev.machine?.hostname || '—'}</td>
                        <td className="px-4 py-3 tm-text-secondary text-xs">{ev.machine?.company?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          {ev.policyApplied ? (
                            <span className="text-orange-400">{ev.policyApplied}</span>
                          ) : (
                            <span className="tm-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tm-text-muted text-xs">{new Date(ev.eventAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'policies' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
              <Plus size={14} /> Nova Política
            </button>
          </div>

          {showForm && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold tm-text">Nova Política USB</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs tm-text-secondary">Nome</label>
                  <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="Ex: Bloquear Pendrives" />
                </div>
                <div>
                  <label className="text-xs tm-text-secondary">Ação</label>
                  <select value={formData.action} onChange={e => setFormData(p => ({ ...p, action: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1">
                    <option value="block">Bloquear</option>
                    <option value="allow">Permitir</option>
                    <option value="log_only">Apenas Registrar</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs tm-text-secondary">Tipo de Dispositivo (opcional)</label>
                  <input value={formData.deviceType} onChange={e => setFormData(p => ({ ...p, deviceType: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="Ex: MassStorage" />
                </div>
                <div>
                  <label className="text-xs tm-text-secondary">Vendor ID (opcional)</label>
                  <input value={formData.vendorId} onChange={e => setFormData(p => ({ ...p, vendorId: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="Ex: 0781" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={formData.appliesToAll} onChange={e => setFormData(p => ({ ...p, appliesToAll: e.target.checked }))} />
                <span className="text-sm tm-text">Aplicar a todas as máquinas</span>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreatePolicy} disabled={saving || !formData.name}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Criar Política'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">Cancelar</button>
              </div>
            </motion.div>
          )}

          {policies.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Shield className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhuma política USB configurada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {policies.map(p => (
                <div key={p.id} className={`tm-bg-card border rounded-xl p-4 flex items-center justify-between ${
                  p.isActive ? 'border-green-500/30' : 'tm-border opacity-60'
                }`}>
                  <div>
                    <h4 className="font-medium tm-text">{p.name}</h4>
                    <p className="text-xs tm-text-secondary mt-0.5">
                      Ação: <span className={p.action === 'block' ? 'text-red-400' : p.action === 'allow' ? 'text-green-400' : 'text-yellow-400'}>{p.action}</span>
                      {p.deviceType && ` | Tipo: ${p.deviceType}`}
                      {p.vendorId && ` | VID: ${p.vendorId}`}
                      {' | '}{p.appliesToAll ? 'Todas as máquinas' : 'Máquinas específicas'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleTogglePolicy(p)} className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      p.isActive ? 'border-green-500/30 text-green-400 hover:bg-green-500/10' : 'tm-border tm-text hover:bg-white/10'
                    }`}>
                      {p.isActive ? 'Ativa' : 'Inativa'}
                    </button>
                    <button onClick={() => handleDeletePolicy(p.id)} className="px-3 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
