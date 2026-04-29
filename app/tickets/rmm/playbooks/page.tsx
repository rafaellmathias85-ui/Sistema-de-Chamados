'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Plus, Trash2, Edit, Play, ChevronLeft, Loader2,
  Power, Cpu, HardDrive, MemoryStick, Settings, ToggleLeft, ToggleRight,
  BookTemplate, History, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  Library, Copy,
} from 'lucide-react';

interface Playbook {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  condition: string | null;
  action: string;
  scriptType: string;
  enabled: boolean;
  _count: { executions: number };
  createdAt: string;
}

interface Execution {
  id: string;
  trigger: string;
  result: string | null;
  success: boolean | null;
  createdAt: string;
  machine: { hostname: string };
  playbook: { name: string };
}

interface Machine {
  id: string;
  hostname: string;
  status: string;
}

const triggerLabels: Record<string, { label: string; icon: any; color: string }> = {
  CPU_HIGH: { label: 'CPU Alta', icon: Cpu, color: 'text-red-400' },
  RAM_HIGH: { label: 'RAM Alta', icon: MemoryStick, color: 'text-orange-400' },
  DISK_FULL: { label: 'Disco Cheio', icon: HardDrive, color: 'text-yellow-400' },
  SERVICE_DOWN: { label: 'Serviço Parado', icon: Power, color: 'text-red-400' },
  CUSTOM: { label: 'Personalizado', icon: Settings, color: 'text-blue-400' },
};

interface Template {
  name: string;
  description: string;
  trigger: string;
  condition: string;
  action: string;
  scriptType: string;
}

const PLAYBOOK_TEMPLATES: Template[] = [
  {
    name: 'Reiniciar Spooler de Impressão',
    description: 'Reinicia o serviço de spooler quando detectado como parado',
    trigger: 'SERVICE_DOWN',
    condition: JSON.stringify({ service: 'Spooler' }),
    action: 'Restart-Service -Name Spooler -Force\nWrite-Output "Spooler reiniciado com sucesso"',
    scriptType: 'powershell',
  },
  {
    name: 'Limpar Arquivos Temporários',
    description: 'Remove arquivos temporários do Windows para liberar espaço',
    trigger: 'DISK_FULL',
    condition: JSON.stringify({ threshold: 90 }),
    action: 'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue\nRemove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue\nWrite-Output "Temp limpo"',
    scriptType: 'powershell',
  },
  {
    name: 'Atualizar Group Policy',
    description: 'Executa gpupdate /force para aplicar políticas de grupo',
    trigger: 'CUSTOM',
    condition: '',
    action: 'gpupdate /force\necho "Group Policy atualizado"',
    scriptType: 'cmd',
  },
  {
    name: 'Coletar Logs de Diagnóstico',
    description: 'Coleta logs de eventos do Windows para análise',
    trigger: 'CUSTOM',
    condition: '',
    action: 'Get-EventLog -LogName System -Newest 50 | Select-Object TimeGenerated, EntryType, Source, Message | Format-Table -AutoSize\nGet-EventLog -LogName Application -Newest 50 -EntryType Error | Select-Object TimeGenerated, Source, Message | Format-Table -AutoSize',
    scriptType: 'powershell',
  },
  {
    name: 'Reiniciar Serviço Específico',
    description: 'Reinicia um serviço específico que parou',
    trigger: 'SERVICE_DOWN',
    condition: JSON.stringify({ service: 'wuauserv' }),
    action: 'param($ServiceName = "wuauserv")\nStop-Service -Name $ServiceName -Force\nStart-Sleep -Seconds 5\nStart-Service -Name $ServiceName\nGet-Service -Name $ServiceName | Select-Object Name, Status',
    scriptType: 'powershell',
  },
  {
    name: 'Liberar Espaço em Disco',
    description: 'Executa limpeza de disco automatizada',
    trigger: 'DISK_FULL',
    condition: JSON.stringify({ threshold: 85 }),
    action: 'cleanmgr /sagerun:1\nwevtutil cl Application\nwevtutil cl System\necho "Limpeza concluída"',
    scriptType: 'cmd',
  },
];

type ActiveTab = 'playbooks' | 'templates' | 'history';

export default function PlaybooksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Playbook | null>(null);
  const [execModal, setExecModal] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [executing, setExecuting] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('playbooks');
  const [form, setForm] = useState({ name: '', description: '', trigger: 'CPU_HIGH', condition: '', action: '', scriptType: 'powershell' });
  const [condForm, setCondForm] = useState({ threshold: '90', service: '' });
  const isAdmin = session?.user?.role === 'ADMIN';

  const loadData = useCallback(async () => {
    const [pbRes, mRes] = await Promise.all([
      fetch('/api/rmm/playbooks'),
      fetch('/api/rmm/machines?status=all').catch(() => ({ ok: false, json: async () => [] } as any)),
    ]);
    if (pbRes.ok) setPlaybooks(await pbRes.json());
    try { const mData = await mRes.json(); if (Array.isArray(mData)) setMachines(mData); } catch {}
  }, []);

  const loadExecutions = useCallback(async () => {
    try {
      const res = await fetch('/api/rmm/playbooks/executions');
      if (res.ok) { const data = await res.json(); setExecutions(Array.isArray(data) ? data : data.executions || []); }
    } catch {}
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;
    if (!['ADMIN', 'SUPPORT'].includes(session?.user?.role || '')) { router.push('/tickets'); return; }
    setLoading(true);
    Promise.all([loadData(), loadExecutions()]).finally(() => setLoading(false));
  }, [status, session, router, loadData, loadExecutions]);

  const syncConditionToForm = (trigger: string, condStr: string) => {
    try {
      const obj = condStr ? JSON.parse(condStr) : {};
      setCondForm({
        threshold: obj.threshold?.toString() || '90',
        service: obj.service || '',
      });
    } catch {
      setCondForm({ threshold: '90', service: '' });
    }
  };

  const buildCondition = () => {
    if (form.trigger === 'SERVICE_DOWN') {
      return condForm.service ? JSON.stringify({ service: condForm.service }) : '';
    }
    if (['CPU_HIGH', 'RAM_HIGH', 'DISK_FULL'].includes(form.trigger)) {
      return JSON.stringify({ threshold: parseInt(condForm.threshold) || 90 });
    }
    return form.condition;
  };

  const handleSave = async () => {
    if (!form.name || !form.action) { window.alert('Nome e ação obrigatórios'); return; }
    const condition = buildCondition();
    const method = editing ? 'PATCH' : 'POST';
    const body = editing ? { id: editing.id, ...form, condition } : { ...form, condition };
    const res = await fetch('/api/rmm/playbooks', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { setShowModal(false); setEditing(null); resetForm(); loadData(); }
    else { const d = await res.json(); window.alert(d.error); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir playbook?')) return;
    await fetch('/api/rmm/playbooks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadData();
  };

  const handleToggle = async (pb: Playbook) => {
    await fetch('/api/rmm/playbooks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pb.id, enabled: !pb.enabled }) });
    loadData();
  };

  const handleExecute = async () => {
    if (!selectedMachine || !execModal) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/rmm/playbooks/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playbookId: execModal, machineId: selectedMachine }),
      });
      const data = await res.json();
      if (res.ok) { window.alert('Playbook enviado com sucesso!'); setExecModal(null); loadExecutions(); }
      else window.alert(data.error);
    } finally { setExecuting(false); }
  };

  const openEdit = (pb: Playbook) => {
    setEditing(pb);
    setForm({ name: pb.name, description: pb.description || '', trigger: pb.trigger, condition: pb.condition || '', action: pb.action, scriptType: pb.scriptType });
    syncConditionToForm(pb.trigger, pb.condition || '');
    setShowModal(true);
  };

  const resetForm = () => {
    setForm({ name: '', description: '', trigger: 'CPU_HIGH', condition: '', action: '', scriptType: 'powershell' });
    setCondForm({ threshold: '90', service: '' });
  };

  const applyTemplate = (tpl: Template) => {
    setForm({ name: tpl.name, description: tpl.description, trigger: tpl.trigger, condition: tpl.condition, action: tpl.action, scriptType: tpl.scriptType });
    syncConditionToForm(tpl.trigger, tpl.condition);
    setEditing(null);
    setShowModal(true);
    setActiveTab('playbooks');
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-blue-400" size={32} /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/tickets/rmm')} className="p-2 hover:bg-white/10 rounded-lg"><ChevronLeft size={20} /></button>
        <Zap className="text-yellow-400" size={28} />
        <div>
          <h1 className="text-xl font-bold tm-text">Playbooks — Self-Healing</h1>
          <p className="tm-text-secondary text-sm">Automações de remediação automática</p>
        </div>
        {isAdmin && (
          <button onClick={() => { resetForm(); setEditing(null); setShowModal(true); }}
            className="ml-auto flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
            <Plus size={16} /> Novo Playbook
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 tm-bg-card p-1 rounded-xl w-fit">
        {[
          { key: 'playbooks' as ActiveTab, label: 'Playbooks', icon: Zap },
          { key: 'templates' as ActiveTab, label: 'Templates', icon: Library },
          { key: 'history' as ActiveTab, label: 'Histórico', icon: History },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition ${
              activeTab === t.key ? 'bg-cyan-600 tm-text' : 'tm-text-secondary hover:text-white hover:tm-bg-card'
            }`}
          >
            <t.icon size={16} />{t.label}
          </button>
        ))}
      </div>

      {/* Tab: Playbooks */}
      {activeTab === 'playbooks' && (
        <>
          {playbooks.length === 0 ? (
            <div className="text-center py-16 tm-text-muted"><Zap size={48} className="mx-auto mb-4 opacity-30" /><p>Nenhum playbook cadastrado</p>
              <p className="text-sm mt-2">Comece usando um <button onClick={() => setActiveTab('templates')} className="text-cyan-400 underline">template</button></p>
            </div>
          ) : (
            <div className="space-y-3">
              {playbooks.map(pb => {
                const tInfo = triggerLabels[pb.trigger] || triggerLabels.CUSTOM;
                const TIcon = tInfo.icon;
                return (
                  <motion.div key={pb.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={`tm-bg-card border tm-border rounded-xl p-4 ${!pb.enabled ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <TIcon size={16} className={tInfo.color} />
                          <span className="tm-text font-medium">{pb.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${pb.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-white-secondary'}`}>
                            {pb.enabled ? 'Ativo' : 'Inativo'}
                          </span>
                          <span className="text-xs bg-white/10 px-2 py-0.5 rounded tm-text">{tInfo.label}</span>
                        </div>
                        {pb.description && <p className="tm-text-secondary text-sm mb-2">{pb.description}</p>}
                        <pre className="text-xs text-cyan-400/70 bg-black/30 rounded p-2 max-h-20 overflow-y-auto">{pb.action.substring(0, 200)}{pb.action.length > 200 ? '...' : ''}</pre>
                        <div className="flex items-center gap-3 mt-2 text-xs tm-text-muted">
                          <span>{pb.scriptType.toUpperCase()}</span>
                          <span>{pb._count.executions} execuções</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => setExecModal(pb.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg">
                          <Play size={14} /> Executar
                        </button>
                        {isAdmin && (
                          <>
                            <button onClick={() => handleToggle(pb)} className="p-1.5 tm-text-secondary hover:tm-text">
                              {pb.enabled ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} />}
                            </button>
                            <button onClick={() => openEdit(pb)} className="p-1.5 tm-text-secondary hover:text-blue-400"><Edit size={14} /></button>
                            <button onClick={() => handleDelete(pb.id)} className="p-1.5 tm-text-secondary hover:text-red-400"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab: Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <p className="text-sm tm-text-secondary">Selecione um template para criar um playbook pré-configurado</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PLAYBOOK_TEMPLATES.map((tpl, i) => {
              const tInfo = triggerLabels[tpl.trigger] || triggerLabels.CUSTOM;
              const TIcon = tInfo.icon;
              return (
                <div key={i} className="tm-bg-card border tm-border rounded-xl p-4 hover:border-cyan-500/30 transition">
                  <div className="flex items-center gap-2 mb-2">
                    <TIcon size={16} className={tInfo.color} />
                    <span className="tm-text font-medium text-sm">{tpl.name}</span>
                  </div>
                  <p className="tm-text-secondary text-xs mb-3">{tpl.description}</p>
                  <pre className="text-[11px] text-cyan-400/60 bg-black/30 rounded p-2 max-h-16 overflow-y-auto mb-3">
                    {tpl.action.substring(0, 120)}{tpl.action.length > 120 ? '...' : ''}
                  </pre>
                  <div className="flex items-center justify-between">
                    <span className="text-xs tm-text-muted">{tpl.scriptType.toUpperCase()} &bull; {tInfo.label}</span>
                    <button
                      onClick={() => applyTemplate(tpl)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded-lg transition"
                    >
                      <Copy size={12} /> Usar Template
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: History */}
      {activeTab === 'history' && (
        <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b tm-border flex items-center justify-between">
            <h3 className="text-sm font-semibold tm-text">Histórico de Execuções</h3>
            <button onClick={loadExecutions} className="text-xs tm-text-secondary hover:tm-text flex items-center gap-1">
              <History size={12} />Atualizar
            </button>
          </div>
          {executions.length === 0 ? (
            <div className="text-center py-16 tm-text-muted">
              <History size={40} className="mx-auto mb-3 opacity-30" />
              <p>Nenhuma execução registrada</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {executions.map((ex) => (
                <div key={ex.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {ex.success === true ? (
                        <CheckCircle2 size={16} className="text-green-400" />
                      ) : ex.success === false ? (
                        <XCircle size={16} className="text-red-400" />
                      ) : (
                        <Clock size={16} className="text-yellow-400" />
                      )}
                      <div>
                        <p className="text-sm tm-text">{ex.playbook.name}</p>
                        <p className="text-xs tm-text-muted">{ex.machine.hostname} &bull; {ex.trigger}</p>
                      </div>
                    </div>
                    <span className="text-xs tm-text-muted">{formatDate(ex.createdAt)}</span>
                  </div>
                  {ex.result && (
                    <pre className="text-[11px] tm-text-secondary bg-black/20 rounded p-2 mt-2 max-h-16 overflow-y-auto">
                      {ex.result.substring(0, 300)}{(ex.result.length || 0) > 300 ? '...' : ''}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="tm-bg-card border tm-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold tm-text mb-4">{editing ? 'Editar' : 'Novo'} Playbook</h2>
            <div className="space-y-3">
              <div><label className="block text-sm tm-text mb-1">Nome</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm focus:outline-none focus:border-blue-500" /></div>
              <div><label className="block text-sm tm-text mb-1">Descrição</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm focus:outline-none focus:border-blue-500" /></div>
              <div><label className="block text-sm tm-text mb-1">Trigger</label>
                <select value={form.trigger} onChange={e => { setForm({ ...form, trigger: e.target.value }); syncConditionToForm(e.target.value, form.condition); }}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm">
                  <option value="CPU_HIGH">CPU Alta (&gt; threshold%)</option>
                  <option value="RAM_HIGH">RAM Alta (&gt; threshold%)</option>
                  <option value="DISK_FULL">Disco Cheio (&gt; threshold%)</option>
                  <option value="SERVICE_DOWN">Serviço Parado</option>
                  <option value="CUSTOM">Personalizado</option>
                </select></div>

              {/* Smart Condition Builder */}
              {['CPU_HIGH', 'RAM_HIGH', 'DISK_FULL'].includes(form.trigger) && (
                <div className="tm-bg-card border tm-border rounded-lg p-3">
                  <label className="block text-xs tm-text-secondary mb-2">Condição: Limiar (%)</label>
                  <div className="flex items-center gap-3">
                    <input type="range" min="50" max="99" value={condForm.threshold}
                      onChange={(e) => setCondForm({ ...condForm, threshold: e.target.value })}
                      className="flex-1 accent-cyan-500" />
                    <span className="tm-text text-sm font-mono w-10 text-right">{condForm.threshold}%</span>
                  </div>
                </div>
              )}
              {form.trigger === 'SERVICE_DOWN' && (
                <div className="tm-bg-card border tm-border rounded-lg p-3">
                  <label className="block text-xs tm-text-secondary mb-2">Condição: Nome do Serviço</label>
                  <input value={condForm.service} onChange={(e) => setCondForm({ ...condForm, service: e.target.value })}
                    placeholder="Ex: Spooler, wuauserv, MSSQLSERVER"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm focus:outline-none focus:border-blue-500" />
                </div>
              )}
              {form.trigger === 'CUSTOM' && (
                <div><label className="block text-sm tm-text mb-1">Condição (JSON)</label>
                  <input value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm focus:outline-none focus:border-blue-500 font-mono"
                    placeholder='{"key": "value"}' /></div>
              )}

              <div><label className="block text-sm tm-text mb-1">Tipo de Script</label>
                <select value={form.scriptType} onChange={e => setForm({ ...form, scriptType: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm">
                  <option value="powershell">PowerShell</option>
                  <option value="cmd">CMD/BAT</option>
                  <option value="python">Python</option>
                </select></div>
              <div><label className="block text-sm tm-text mb-1">Script / Ação</label>
                <textarea value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} rows={6}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm font-mono focus:outline-none focus:border-blue-500"
                  placeholder="# Script que será executado na máquina" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowModal(false); setEditing(null); }} className="px-4 py-2 tm-text-secondary hover:tm-text">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">Salvar</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Execute Modal */}
      {execModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setExecModal(null)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="tm-bg-card border tm-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold tm-text mb-4">Executar Playbook</h2>
            <div>
              <label className="block text-sm tm-text mb-1">Selecione a máquina</label>
              <select value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text text-sm">
                <option value="">Selecionar...</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.hostname} ({m.status})</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setExecModal(null)} className="px-4 py-2 tm-text-secondary hover:tm-text">Cancelar</button>
              <button onClick={handleExecute} disabled={!selectedMachine || executing}
                className="flex items-center gap-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm disabled:opacity-50">
                {executing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Executar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
