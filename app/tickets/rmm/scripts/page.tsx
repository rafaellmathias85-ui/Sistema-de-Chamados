'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  FileCode2,
  Plus,
  Check,
  X,
  Search,
  Shield,
  Clock,
  Loader2,
  ArrowLeft,
  Trash2,
  Play,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Script {
  id: string;
  name: string;
  description: string | null;
  scriptType: string;
  content: string;
  contentHash: string | null;
  sizeBytes: number | null;
  approved: boolean;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdByName: string;
  companyId: string | null;
  createdAt: string;
}

interface Machine {
  id: string;
  hostname: string;
  status: string;
  company: { name: string };
}

export default function ScriptsPage() {
  const { data: session } = useSession();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewingScript, setViewingScript] = useState<string | null>(null);
  const [execModal, setExecModal] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<string | null>(null);
  const [execTaskId, setExecTaskId] = useState<string | null>(null);
  const [execLiveOutput, setExecLiveOutput] = useState<string>('');
  const [execStatus, setExecStatus] = useState<string>('');

  const [form, setForm] = useState({ name: '', description: '', scriptType: 'bat', content: '', companyId: '' });

  const isAdmin = session?.user?.role === 'ADMIN';

  const fetchData = async () => {
    try {
      const [scriptsRes, machinesRes] = await Promise.all([
        fetch('/api/rmm/scripts'),
        fetch('/api/rmm/machines'),
      ]);
      if (scriptsRes.ok) setScripts(await scriptsRes.json());
      if (machinesRes.ok) setMachines(await machinesRes.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/rmm/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ name: '', description: '', scriptType: 'bat', content: '', companyId: '' });
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error || 'Erro');
      }
    } catch { alert('Erro'); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id: string, approve: boolean) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/rmm/scripts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: approve ? 'approve' : 'reject' }),
      });
      if (res.ok) fetchData();
    } catch { alert('Erro'); }
    finally { setApproving(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este script?')) return;
    try {
      const res = await fetch(`/api/rmm/scripts/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch { alert('Erro'); }
  };

  const handleExecute = async () => {
    if (!execModal || !selectedMachine) return;
    setExecuting(true);
    setExecResult(null);
    setExecLiveOutput('');
    setExecStatus('');
    setExecTaskId(null);
    try {
      const res = await fetch('/api/rmm/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: selectedMachine, scriptId: execModal }),
      });
      const data = await res.json();
      if (res.ok) {
        setExecResult('Execução solicitada. Aguardando agente...');
        setExecTaskId(data.taskId || null);
        setExecStatus('PENDING');
      } else {
        setExecResult(data.error || 'Erro');
      }
    } catch { setExecResult('Erro de conexão'); }
    finally { setExecuting(false); }
  };

  // Polling de live output da tarefa
  useEffect(() => {
    if (!execTaskId) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/rmm/tasks/by-id/${execTaskId}`);
        if (r.ok) {
          const t = await r.json();
          setExecStatus(t.status);
          setExecLiveOutput(t.liveOutput || t.result || '');
          if (t.status === 'EXECUTED' || t.status === 'ERROR' || t.status === 'CANCELLED') {
            return; // termina polling
          }
        }
      } catch {}
      setTimeout(tick, 2000);
    };
    tick();
    return () => { stopped = true; };
  }, [execTaskId]);

  const filtered = scripts.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.scriptType.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tickets/rmm" className="p-2 tm-text-secondary hover:tm-text transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold tm-text">Scripts Remotos</h1>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 tm-text-secondary" />
          <input
            type="text" placeholder="Buscar scripts..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500"
          />
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          <Plus className="w-5 h-5" /> Novo Script
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/80 rounded-xl p-6 border border-gray-700 space-y-4">
          <h2 className="text-lg font-bold tm-text">Novo Script</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm tm-text-secondary mb-1">Nome *</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm tm-text-secondary mb-1">Tipo *</label>
              <select value={form.scriptType} onChange={e => setForm({...form, scriptType: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500">
                <option value="bat">.bat (Batch)</option>
                <option value="vbs">.vbs (VBScript)</option>
                <option value="ps1">.ps1 (PowerShell)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm tm-text-secondary mb-1">Descrição</label>
            <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500" placeholder="O que este script faz?" />
          </div>
          <div>
            <label className="block text-sm tm-text-secondary mb-1">Conteúdo do Script *</label>
            <textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} rows={10} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text font-mono text-sm focus:outline-none focus:border-blue-500" placeholder={form.scriptType === 'bat' ? '@echo off\nREM Seu script aqui' : form.scriptType === 'ps1' ? '# PowerShell script' : "' VBScript"} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 tm-text-secondary hover:tm-text">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar
            </button>
          </div>
        </motion.div>
      )}

      {/* Scripts list */}
      <div className="space-y-3">
        {filtered.map(script => (
          <motion.div key={script.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${script.approved ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                  <FileCode2 className={`w-5 h-5 ${script.approved ? 'text-green-400' : 'text-yellow-400'}`} />
                </div>
                <div>
                  <h3 className="tm-text font-medium">{script.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-sm tm-text-secondary">
                    <span className="px-2 py-0.5 bg-gray-700 rounded text-xs uppercase">{script.scriptType}</span>
                    <span>por {script.createdByName}</span>
                    <span>•</span>
                    <span>{new Date(script.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {script.description && <p className="text-sm tm-text-muted mt-1">{script.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Status */}
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  script.approved ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {script.approved ? 'Aprovado' : 'Pendente'}
                </span>
                {/* View content */}
                <button onClick={() => setViewingScript(viewingScript === script.id ? null : script.id)} className="p-2 tm-text-secondary hover:text-blue-400 transition-colors" title="Ver conteúdo">
                  {viewingScript === script.id ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {/* Approve/Reject (admin only, if not approved) */}
                {isAdmin && !script.approved && (
                  <button onClick={() => handleApprove(script.id, true)} disabled={approving === script.id} className="p-2 tm-text-secondary hover:text-green-400 transition-colors" title="Aprovar">
                    {approving === script.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                )}
                {/* Execute (only if approved) */}
                {script.approved && (
                  <button onClick={() => { setExecModal(script.id); setSelectedMachine(''); }} className="p-2 tm-text-secondary hover:text-cyan-400 transition-colors" title="Executar">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                {/* Delete */}
                {isAdmin && (
                  <button onClick={() => handleDelete(script.id)} className="p-2 tm-text-secondary hover:text-red-400 transition-colors" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {/* Script content viewer */}
            {viewingScript === script.id && (
              <div className="mt-3 p-3 bg-gray-900 rounded-lg border border-gray-700 overflow-x-auto">
                <pre className="text-sm tm-text font-mono whitespace-pre-wrap">{script.content}</pre>
              </div>
            )}
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 tm-text-secondary">
            <FileCode2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum script encontrado</p>
          </div>
        )}
      </div>

      {/* Execute modal */}
      {execModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-gray-900 rounded-xl p-6 w-full max-w-3xl border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold tm-text mb-4">Executar Script</h2>
            <p className="text-sm tm-text-secondary mb-3">Selecione a máquina para executar o script:</p>
            <select value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500 mb-4">
              <option value="">Selecione uma máquina</option>
              {machines.filter(m => m.status === 'Online').map(m => (
                <option key={m.id} value={m.id}>{m.hostname} ({m.company?.name})</option>
              ))}
            </select>
            {execResult && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${execStatus === 'EXECUTED' ? 'bg-green-500/20 text-green-400' : execStatus === 'ERROR' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-300'}`}>
                {execResult} {execStatus && <span className="ml-2 font-semibold">[{execStatus}]</span>}
              </div>
            )}
            {(execLiveOutput || execTaskId) && (
              <div className="mb-4">
                <div className="text-xs tm-text-muted mb-1 flex items-center gap-2">
                  <span>Saída do script (atualização em tempo real)</span>
                  {execStatus && execStatus !== 'EXECUTED' && execStatus !== 'ERROR' && (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  )}
                </div>
                <pre className="bg-black/60 border border-gray-800 rounded-lg p-3 text-xs text-green-300 font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
{execLiveOutput || '(aguardando saída...)'}
                </pre>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setExecModal(null); setExecResult(null); setExecTaskId(null); setExecLiveOutput(''); setExecStatus(''); setSelectedMachine(''); }} className="px-4 py-2 tm-text-secondary hover:tm-text">Fechar</button>
              <button onClick={handleExecute} disabled={executing || !selectedMachine} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg disabled:opacity-50">
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Executar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
