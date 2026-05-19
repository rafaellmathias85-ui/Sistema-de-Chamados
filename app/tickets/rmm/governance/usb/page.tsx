'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Usb, ChevronLeft, RefreshCw, Search, Loader2,
  Shield, Plus, Trash2, Check, X, AlertTriangle,
  Building2, Monitor, CheckSquare, Square,
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
  policyType: string;
  deviceClass: string | null;
  vendorId: string | null;
  productId: string | null;
  serialNumber: string | null;
  machineIds: string[];
  isActive: boolean;
  company?: { name: string } | null;
  companyId?: string | null;
}

interface CompanyOption { id: string; name: string; }
interface MachineOption { id: string; hostname: string; status: string; }

export default function UsbPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'events' | 'policies'>('events');
  const [events, setEvents] = useState<UsbEvent[]>([]);
  const [policies, setPolicies] = useState<UsbPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '', action: 'block', deviceType: '', vendorId: '', productId: '', serialNumber: '',
    companyId: '', machineIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [filterMachine, setFilterMachine] = useState('');

  // Empresa + máquinas para seleção no form de política
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyMachines, setCompanyMachines] = useState<MachineOption[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [allMachinesSelected, setAllMachinesSelected] = useState(true);

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

  // Carregar empresas para o form de políticas
  useEffect(() => {
    fetch('/api/companies?limit=500')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.companies || []);
        setCompanies(list.map((c: any) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  // Carregar máquinas quando empresa selecionada no form
  useEffect(() => {
    if (!formData.companyId) { setCompanyMachines([]); return; }
    setLoadingMachines(true);
    setFormData(p => ({ ...p, machineIds: [] }));
    fetch(`/api/rmm/machines?companyId=${formData.companyId}&limit=500`)
      .then(r => r.json())
      .then(data => {
        const machines = Array.isArray(data) ? data : (data?.machines || []);
        setCompanyMachines(machines.map((m: any) => ({ id: m.id, hostname: m.hostname, status: m.status })));
        setAllMachinesSelected(true);
      })
      .catch(() => setCompanyMachines([]))
      .finally(() => setLoadingMachines(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.companyId]);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([loadEvents(), loadPolicies()]).finally(() => setLoading(false));
  }, [session, loadEvents, loadPolicies]);

  const handleCreatePolicy = async () => {
    // Validação: se empresa selecionada e não "todas máquinas", precisa ter pelo menos 1
    if (formData.companyId && !allMachinesSelected && formData.machineIds.length === 0) {
      alert('Selecione pelo menos uma máquina ou marque "Todas as máquinas".');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        action: formData.action,
        deviceType: formData.deviceType || undefined,
        vendorId: formData.vendorId || undefined,
        productId: formData.productId || undefined,
        serialNumber: formData.serialNumber || undefined,
        companyId: formData.companyId || undefined,
        machineIds: allMachinesSelected ? [] : formData.machineIds,
      };
      const res = await fetch('/api/rmm/governance/policies/usb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await loadPolicies();
        setShowForm(false);
        setFormData({ name: '', action: 'block', deviceType: '', vendorId: '', productId: '', serialNumber: '', companyId: '', machineIds: [] });
        setAllMachinesSelected(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Erro ao criar política');
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

      {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-400" size={28} /></div>}

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

          <AnimatePresence>
            {showForm && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold tm-text">Nova Política USB</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs tm-text-secondary">Nome *</label>
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
                    <label className="text-xs tm-text-secondary">Empresa (vazio = global)</label>
                    <select value={formData.companyId} onChange={e => setFormData(p => ({ ...p, companyId: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1">
                      <option value="">Todas as empresas (Global)</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
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
                  <div>
                    <label className="text-xs tm-text-secondary">Serial Number (opcional)</label>
                    <input value={formData.serialNumber} onChange={e => setFormData(p => ({ ...p, serialNumber: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="Ex: ABC123" />
                  </div>
                </div>

                {/* Seleção de máquinas (quando empresa selecionada) */}
                {formData.companyId && (
                  <div className="tm-bg-card border tm-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs tm-text-secondary flex items-center gap-1.5">
                        <Monitor size={14} /> Máquinas da empresa
                      </label>
                      {loadingMachines && <Loader2 size={14} className="animate-spin tm-text-muted" />}
                    </div>

                    {!loadingMachines && companyMachines.length === 0 && (
                      <p className="text-xs tm-text-muted">Nenhuma máquina encontrada para esta empresa.</p>
                    )}

                    {companyMachines.length > 0 && (
                      <>
                        <label className="flex items-center gap-2 text-sm tm-text cursor-pointer">
                          <input type="checkbox" checked={allMachinesSelected}
                            onChange={() => {
                              setAllMachinesSelected(!allMachinesSelected);
                              setFormData(p => ({ ...p, machineIds: [] }));
                            }} />
                          <span className="font-medium">Todas as máquinas ({companyMachines.length})</span>
                        </label>

                        {!allMachinesSelected && (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                            {companyMachines.map(m => {
                              const isSelected = formData.machineIds.includes(m.id);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData(p => ({
                                      ...p,
                                      machineIds: isSelected
                                        ? p.machineIds.filter(x => x !== m.id)
                                        : [...p.machineIds, m.id],
                                    }));
                                  }}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors text-left ${
                                    isSelected
                                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                                      : 'tm-border tm-text hover:bg-white/5'
                                  }`}
                                >
                                  {isSelected ? <CheckSquare size={14} /> : <Square size={14} className="tm-text-muted" />}
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">{m.hostname}</div>
                                    <div className={`text-[10px] ${m.status === 'Ligado' ? 'text-green-400' : 'tm-text-muted'}`}>
                                      {m.status === 'Ligado' ? '● Online' : '○ Offline'}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {!allMachinesSelected && formData.machineIds.length > 0 && (
                          <p className="text-xs text-blue-400">{formData.machineIds.length} máquina(s) selecionada(s)</p>
                        )}
                        {!allMachinesSelected && formData.machineIds.length === 0 && (
                          <p className="text-xs text-yellow-400">Selecione pelo menos uma máquina</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={handleCreatePolicy} disabled={saving || !formData.name}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Criar Política'}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">Cancelar</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                      Ação: <span className={p.policyType === 'block' ? 'text-red-400' : p.policyType === 'allow' ? 'text-green-400' : 'text-yellow-400'}>{p.policyType}</span>
                      {p.deviceClass && ` | Tipo: ${p.deviceClass}`}
                      {p.vendorId && ` | VID: ${p.vendorId}`}
                      {p.company?.name && (
                        <span className="flex items-center gap-1 inline-flex ml-1"><Building2 size={10} /> {p.company.name}</span>
                      )}
                      {!p.company && ' | Global'}
                      {p.machineIds?.length > 0 ? (
                        <span className="flex items-center gap-1 inline-flex ml-1"><Monitor size={10} /> {p.machineIds.length} máquina(s)</span>
                      ) : (
                        <span className="ml-1">| Todas as máquinas</span>
                      )}
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
