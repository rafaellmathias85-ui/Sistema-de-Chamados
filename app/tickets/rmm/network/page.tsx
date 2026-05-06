'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Network, Wifi, WifiOff, Plus, Trash2, RefreshCw,
  ChevronLeft, Router, Server, Shield, Loader2, Radio,
  Building2, Monitor, Pencil, Stethoscope, X, AlertTriangle, CheckCircle2,
} from 'lucide-react';

interface SnmpDevice {
  id: string;
  name: string;
  ipAddress: string;
  community: string;
  type: string;
  status: string;
  lastPoll: string | null;
  latency: number | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  watcherMachineId: string | null;
  watcherMachine: { id: string; hostname: string; status: string; company: { name: string } } | null;
  metrics: { id: string; metric: string; value: string; createdAt: string }[];
}

interface Company {
  id: string;
  name: string;
}

interface RmmMachine {
  id: string;
  hostname: string;
  status: string;
}

const typeIcons: Record<string, typeof Network> = { router: Router, switch: Server, firewall: Shield, ap: Radio, other: Network };
const typeLabels: Record<string, string> = { router: 'Roteador', switch: 'Switch', firewall: 'Firewall', ap: 'Access Point', other: 'Outro' };

export default function NetworkPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [devices, setDevices] = useState<SnmpDevice[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [machines, setMachines] = useState<RmmMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editDevice, setEditDevice] = useState<SnmpDevice | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagDeviceName, setDiagDeviceName] = useState<string>('');
  const [diagResult, setDiagResult] = useState<any>(null);
  const [form, setForm] = useState({
    name: '', ipAddress: '', community: 'public', type: 'router',
    companyId: '', watcherMachineId: '',
  });

  const loadDevices = useCallback(async () => {
    const res = await fetch('/api/rmm/snmp/devices');
    if (res.ok) setDevices(await res.json());
  }, []);

  const loadCompanies = useCallback(async () => {
    const res = await fetch('/api/companies?limit=500');
    if (res.ok) {
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : data.companies || []);
    }
  }, []);

  const loadMachines = useCallback(async (companyId: string) => {
    if (!companyId) { setMachines([]); return; }
    const res = await fetch(`/api/rmm/machines?companyId=${companyId}`);
    if (res.ok) {
      const data = await res.json();
      setMachines(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;
    if (!['ADMIN', 'SUPPORT'].includes(session?.user?.role || '')) { router.push('/tickets'); return; }
    setLoading(true);
    Promise.all([loadDevices(), loadCompanies()]).finally(() => setLoading(false));
  }, [status, session, router, loadDevices, loadCompanies]);

  // Carregar máquinas quando empresa muda no form
  useEffect(() => {
    loadMachines(form.companyId);
  }, [form.companyId, loadMachines]);

  const resetForm = () => {
    setForm({ name: '', ipAddress: '', community: 'public', type: 'router', companyId: '', watcherMachineId: '' });
    setEditDevice(null);
    setMachines([]);
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (d: SnmpDevice) => {
    setEditDevice(d);
    setForm({
      name: d.name,
      ipAddress: d.ipAddress,
      community: d.community,
      type: d.type,
      companyId: d.companyId || '',
      watcherMachineId: d.watcherMachineId || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.ipAddress || !form.companyId) {
      window.alert('Nome, IP e Empresa são obrigatórios');
      return;
    }

    if (editDevice) {
      // PATCH
      const res = await fetch('/api/rmm/snmp/devices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editDevice.id, ...form, watcherMachineId: form.watcherMachineId || null }),
      });
      if (res.ok) { setShowModal(false); resetForm(); loadDevices(); }
      else { const d = await res.json(); window.alert(d.error); }
    } else {
      // POST
      const res = await fetch('/api/rmm/snmp/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, watcherMachineId: form.watcherMachineId || null }),
      });
      if (res.ok) { setShowModal(false); resetForm(); loadDevices(); }
      else { const d = await res.json(); window.alert(d.error); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover dispositivo?')) return;
    await fetch('/api/rmm/snmp/devices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadDevices();
  };

  const handlePoll = async (id: string) => {
    setPolling(id);
    try {
      await fetch('/api/rmm/snmp/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: id }) });
      await loadDevices();
    } finally { setPolling(null); }
  };

  const pollAll = async () => {
    setPolling('all');
    for (const d of devices) {
      await fetch('/api/rmm/snmp/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: d.id }) });
    }
    await loadDevices();
    setPolling(null);
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR') : 'Nunca';

  const handleTest = async (d: SnmpDevice) => {
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagDeviceName(`${d.name} (${d.ipAddress})`);
    setDiagResult(null);
    try {
      const res = await fetch('/api/rmm/snmp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: d.id }),
      });
      const data = await res.json();
      setDiagResult(data);
    } catch (err: any) {
      setDiagResult({ error: 'Falha ao executar diagnostico', detail: err?.message || String(err) });
    } finally {
      setDiagLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-400" size={32} /></div>;

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/tickets/rmm')} className="p-2 hover:bg-white/10 rounded-lg"><ChevronLeft size={20} /></button>
        <Network className="text-cyan-400" size={28} />
        <div>
          <h1 className="text-xl font-bold tm-text">Monitoramento de Rede</h1>
          <p className="tm-text-secondary text-sm">Dispositivos de rede vinculados a empresas com agente vigia</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={pollAll} disabled={polling === 'all' || devices.length === 0}
            className="flex items-center gap-1 px-3 py-2 tm-bg-card hover:bg-white/10 border tm-border tm-text text-sm rounded-lg disabled:opacity-40">
            {polling === 'all' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Verificar Todos
          </button>
          {session?.user?.role === 'ADMIN' && (
            <button onClick={openAdd}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
              <Plus size={16} /> Adicionar
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[{ label: 'Total', val: devices.length, color: 'text-blue-400' },
          { label: 'Online', val: onlineCount, color: 'text-green-400' },
          { label: 'Offline', val: offlineCount, color: 'text-red-400' },
        ].map((s, i) => (
          <div key={i} className="tm-bg-card border tm-border rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-xs tm-text-secondary">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Devices Grid */}
      {devices.length === 0 ? (
        <div className="text-center py-16 tm-text-muted">
          <Network size={48} className="mx-auto mb-4 opacity-30" />
          <p>Nenhum dispositivo cadastrado</p>
          <p className="text-sm mt-1">Adicione roteadores, switches e firewalls dos seus clientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map(d => {
            const Icon = typeIcons[d.type] || Network;
            return (
              <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="tm-bg-card border tm-border rounded-xl p-4 hover:bg-white/[0.07] transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon size={20} className="text-cyan-400" />
                    <div>
                      <h3 className="tm-text font-medium text-sm">{d.name}</h3>
                      <span className="tm-text-muted text-xs">{typeLabels[d.type] || d.type}</span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                    d.status === 'online' ? 'bg-green-500/20 text-green-400' :
                    d.status === 'offline' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 tm-text-secondary'
                  }`}>
                    {d.status === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
                    {d.status === 'online' ? 'Online' : d.status === 'offline' ? 'Offline' : 'Desconhecido'}
                  </div>
                </div>

                <div className="text-xs tm-text-secondary space-y-1 mb-3">
                  <div>IP: <span className="tm-text font-mono">{d.ipAddress}</span></div>
                  {d.company && (
                    <div className="flex items-center gap-1">
                      <Building2 size={11} />
                      <span className="tm-text">{d.company.name}</span>
                    </div>
                  )}
                  {d.watcherMachine && (
                    <div className="flex items-center gap-1">
                      <Monitor size={11} />
                      <span>Vigia: </span>
                      <span className={`tm-text ${d.watcherMachine.status === 'Ligado' ? 'text-green-400' : ''}`}>
                        {d.watcherMachine.hostname}
                      </span>
                    </div>
                  )}
                  {d.latency != null && d.status === 'online' && (
                    <div>Latência: <span className="tm-text font-mono">{d.latency}ms</span></div>
                  )}
                  <div>Último poll: <span className="tm-text">{fmt(d.lastPoll)}</span></div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handlePoll(d.id)} disabled={polling === d.id}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 tm-bg-card hover:bg-white/10 border tm-border tm-text text-xs rounded-lg">
                    {polling === d.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Verificar
                  </button>
                  <button onClick={() => handleTest(d)} disabled={diagLoading}
                    title="Diagnostico detalhado SNMP/portas"
                    className="flex items-center justify-center gap-1 px-2 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs rounded-lg">
                    <Stethoscope size={12} /> Testar
                  </button>
                  {session?.user?.role === 'ADMIN' && (
                    <>
                      <button onClick={() => openEdit(d)}
                        className="p-1.5 tm-text-muted hover:text-blue-400 transition-colors" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(d.id)}
                        className="p-1.5 tm-text-muted hover:text-red-400 transition-colors" title="Remover">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal Adicionar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); resetForm(); }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="tm-bg-card border tm-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold tm-text mb-4">
              {editDevice ? 'Editar Dispositivo' : 'Adicionar Dispositivo'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm tm-text mb-1">Nome *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm" placeholder="Ex: Roteador Matriz" />
              </div>
              <div>
                <label className="block text-sm tm-text mb-1">Endereço IP *</label>
                <input value={form.ipAddress} onChange={e => setForm({ ...form, ipAddress: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm" placeholder="192.168.1.1"
                  disabled={!!editDevice} />
              </div>
              <div>
                <label className="block text-sm tm-text mb-1">Empresa *</label>
                <select value={form.companyId}
                  onChange={e => setForm({ ...form, companyId: e.target.value, watcherMachineId: '' })}
                  className="w-full px-3 py-2 rounded-lg text-sm">
                  <option value="">Selecione a empresa...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm tm-text mb-1">
                  Máquina Vigia
                  <span className="tm-text-muted ml-1 text-xs">(agente que monitora)</span>
                </label>
                <select value={form.watcherMachineId}
                  onChange={e => setForm({ ...form, watcherMachineId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  disabled={!form.companyId}>
                  <option value="">Nenhuma (monitoramento central)</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.hostname} {m.status === 'Ligado' ? '✅' : '⚠️ Offline'}
                    </option>
                  ))}
                </select>
                {form.companyId && machines.length === 0 && (
                  <p className="text-xs text-yellow-400 mt-1">Nenhuma máquina RMM nesta empresa</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm tm-text mb-1">Tipo</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm">
                    <option value="router">Roteador</option>
                    <option value="switch">Switch</option>
                    <option value="firewall">Firewall</option>
                    <option value="ap">Access Point</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm tm-text mb-1">Community SNMP</label>
                  <input value={form.community} onChange={e => setForm({ ...form, community: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 tm-text-secondary hover:tm-text">Cancelar</button>
              <button onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
                {editDevice ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Diagnostico SNMP */}
      {diagOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="tm-bg-card border tm-border rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold tm-text flex items-center gap-2">
                  <Stethoscope size={18} className="text-purple-400" />
                  Diagnostico SNMP
                </h3>
                <p className="text-xs tm-text-muted mt-1">{diagDeviceName}</p>
              </div>
              <button onClick={() => setDiagOpen(false)}
                className="tm-text-muted hover:tm-text">
                <X size={20} />
              </button>
            </div>

            {diagLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-purple-400" size={32} />
                <span className="ml-3 tm-text-muted">Executando probes TCP...</span>
              </div>
            )}

            {!diagLoading && diagResult && (
              <div className="space-y-4">
                {diagResult.error && (
                  <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 text-sm">
                    <strong>Erro:</strong> {diagResult.error}
                    {diagResult.detail && <div className="text-xs mt-1 opacity-80">{diagResult.detail}</div>}
                  </div>
                )}

                {!diagResult.error && (
                  <>
                    {/* Resumo */}
                    <div className={`p-3 rounded-lg border flex items-start gap-3 ${
                      diagResult.ok
                        ? 'bg-green-500/15 border-green-500/30'
                        : 'bg-red-500/15 border-red-500/30'
                    }`}>
                      {diagResult.ok
                        ? <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
                        : <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />}
                      <div className="flex-1 text-sm">
                        <div className={`font-semibold ${diagResult.ok ? 'text-green-300' : 'text-red-300'}`}>
                          {diagResult.ok ? 'Dispositivo respondeu' : 'Dispositivo nao respondeu'}
                        </div>
                        <div className="tm-text-muted text-xs mt-0.5">
                          {diagResult.onlineCount}/{diagResult.totalPorts} portas abertas
                          {diagResult.minLatencyMs != null && ` • latencia min: ${diagResult.minLatencyMs}ms`}
                        </div>
                      </div>
                    </div>

                    {/* Tabela de portas */}
                    {diagResult.portResults && (
                      <div className="border tm-border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-white/5">
                            <tr>
                              <th className="px-3 py-2 text-left tm-text-muted">Porta</th>
                              <th className="px-3 py-2 text-left tm-text-muted">Servico</th>
                              <th className="px-3 py-2 text-left tm-text-muted">Status</th>
                              <th className="px-3 py-2 text-left tm-text-muted">Detalhe</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagResult.portResults.map((p: any) => (
                              <tr key={p.port} className="border-t tm-border">
                                <td className="px-3 py-2 font-mono tm-text">{p.port}</td>
                                <td className="px-3 py-2 tm-text-muted">{p.label}</td>
                                <td className="px-3 py-2">
                                  {p.ok
                                    ? <span className="text-green-400">● Aberta</span>
                                    : <span className="text-red-400">● Fechada</span>}
                                </td>
                                <td className="px-3 py-2 tm-text-muted">
                                  {p.ok ? `${p.ms}ms` : (p.error || '-')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Log completo */}
                    {diagResult.log && (
                      <div>
                        <div className="text-xs tm-text-muted mb-2">Log completo:</div>
                        <div className="bg-black/40 border tm-border rounded-lg p-3 max-h-72 overflow-y-auto font-mono text-xs space-y-1">
                          {diagResult.log.map((l: any, i: number) => (
                            <div key={i} className={
                              l.level === 'ok' ? 'text-green-300'
                              : l.level === 'warn' ? 'text-yellow-300'
                              : l.level === 'error' ? 'text-red-300'
                              : 'tm-text-muted'
                            }>
                              <span className="opacity-60">[{l.ts}]</span> {l.msg}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button onClick={() => setDiagOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
