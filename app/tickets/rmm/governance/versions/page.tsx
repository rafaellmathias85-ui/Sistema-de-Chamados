'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Package, ChevronLeft, RefreshCw, Loader2,
  Plus, Trash2, Check, AlertTriangle, Star,
  Upload, Tag, Send,
} from 'lucide-react';

interface AgentVersion {
  id: string;
  version: string;
  agentType: string;
  channel: string;
  releaseNotes: string | null;
  downloadUrl: string;
  fileHashSha256: string;
  fileSizeBytes: string;
  isCritical: boolean;
  isActive: boolean;
  publishedById: string | null;
  createdAt: string;
}

export default function VersionsPage() {
  const { data: session } = useSession();
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string; rmmToken: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [pushCompanyId, setPushCompanyId] = useState<string>('');
  const [form, setForm] = useState({
    version: '', agentType: 'msi', channel: 'stable',
    releaseNotes: '', downloadUrl: '', fileHashSha256: '',
    fileSizeBytes: '', isCritical: false,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [versRes, compRes] = await Promise.all([
        fetch('/api/rmm/agent-versions'),
        fetch('/api/companies?limit=500'),
      ]);
      if (versRes.ok) setVersions(await versRes.json());
      if (compRes.ok) {
        const d = await compRes.json();
        const list = Array.isArray(d) ? d : d.companies || [];
        setCompanies(list.filter((c: any) => c.rmmToken));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (session?.user) loadData(); }, [session, loadData]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/rmm/agent-versions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        await loadData();
        setShowForm(false);
        setForm({ version: '', agentType: 'msi', channel: 'stable', releaseNotes: '', downloadUrl: '', fileHashSha256: '', fileSizeBytes: '', isCritical: false });
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta versão?')) return;
    await fetch(`/api/rmm/agent-versions/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const handleToggle = async (v: AgentVersion) => {
    await fetch(`/api/rmm/agent-versions/${v.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !v.isActive }),
    });
    await loadData();
  };

  const handlePushUpdate = async () => {
    const target = pushCompanyId
      ? companies.find(c => c.id === pushCompanyId)?.name || 'empresa selecionada'
      : 'TODAS as máquinas online';
    if (!confirm(`Enviar comando de atualização para ${target}?`)) return;
    setPushing(true);
    setPushResult(null);
    try {
      const body: any = pushCompanyId ? { companyId: pushCompanyId } : { allOnline: true };
      const res = await fetch('/api/rmm/agent/push-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setPushResult(`✅ ${data.tasksCreated} tarefas criadas para ${data.machinesFound} máquinas: ${data.machines?.join(', ')}`);
      } else {
        setPushResult(`❌ ${data.error}`);
      }
    } catch {
      setPushResult('❌ Erro ao enviar atualização');
    } finally {
      setPushing(false);
    }
  };

  const formatBytes = (b: string) => {
    const n = parseInt(b);
    if (isNaN(n)) return b;
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Package className="text-yellow-400" size={28} />
            Versões do Agente
          </h1>
          <p className="tm-text-secondary mt-1">Gerenciar versões, canais e distribuição de atualizações</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={pushCompanyId} onChange={e => setPushCompanyId(e.target.value)}
            className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm min-w-[180px]">
            <option value="">Todas as empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={handlePushUpdate} disabled={pushing}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
            {pushing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar Atualização
          </button>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
            <Plus size={14} /> Publicar Versão
          </button>
          <Link href="/tickets/rmm/governance" className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
            <ChevronLeft size={14} /> Governance
          </Link>
        </div>
      </div>

      {pushResult && (
        <div className={`p-3 rounded-lg text-sm ${pushResult.startsWith('✅') ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
          {pushResult}
        </div>
      )}

      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold tm-text">Publicar Nova Versão</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs tm-text-secondary">Versão</label>
              <input value={form.version} onChange={e => setForm(p => ({ ...p, version: e.target.value }))}
                className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="2.0.1" />
            </div>
            <div>
              <label className="text-xs tm-text-secondary">Tipo</label>
              <select value={form.agentType} onChange={e => setForm(p => ({ ...p, agentType: e.target.value }))}
                className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1">
                <option value="msi">MSI</option>
                <option value="ps1">PS1</option>
              </select>
            </div>
            <div>
              <label className="text-xs tm-text-secondary">Canal</label>
              <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}
                className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1">
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
                <option value="canary">Canary</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="text-xs tm-text-secondary">URL de Download</label>
              <input value={form.downloadUrl} onChange={e => setForm(p => ({ ...p, downloadUrl: e.target.value }))}
                className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs tm-text-secondary">Hash SHA256</label>
              <input value={form.fileHashSha256} onChange={e => setForm(p => ({ ...p, fileHashSha256: e.target.value }))}
                className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs tm-text-secondary">Tamanho (bytes)</label>
              <input value={form.fileSizeBytes} onChange={e => setForm(p => ({ ...p, fileSizeBytes: e.target.value }))}
                className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm tm-text">
                <input type="checkbox" checked={form.isCritical} onChange={e => setForm(p => ({ ...p, isCritical: e.target.checked }))} />
                Atualização crítica (forçada)
              </label>
            </div>
            <div className="md:col-span-3">
              <label className="text-xs tm-text-secondary">Notas de Lançamento</label>
              <textarea value={form.releaseNotes} onChange={e => setForm(p => ({ ...p, releaseNotes: e.target.value }))}
                className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" rows={3} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !form.version || !form.downloadUrl || !form.fileHashSha256}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? 'Publicando...' : 'Publicar'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">Cancelar</button>
          </div>
        </motion.div>
      )}

      {versions.length === 0 ? (
        <div className="text-center py-20 tm-text-secondary">
          <Package className="mx-auto mb-3 opacity-30" size={48} />
          <p>Nenhuma versão publicada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((v, i) => (
            <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className={`tm-bg-card border rounded-xl p-4 ${v.isActive ? 'border-green-500/30' : 'tm-border opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/5">
                    <Tag size={18} className={v.agentType === 'msi' ? 'text-blue-400' : 'text-orange-400'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold tm-text">v{v.version}</h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        v.agentType === 'msi' ? 'bg-blue-600/20 text-blue-400' : 'bg-orange-600/20 text-orange-400'
                      }`}>{v.agentType.toUpperCase()}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        v.channel === 'stable' ? 'bg-green-600/20 text-green-400' :
                        v.channel === 'beta' ? 'bg-yellow-600/20 text-yellow-400' : 'bg-purple-600/20 text-purple-400'
                      }`}>{v.channel}</span>
                      {v.isCritical && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-600/20 text-red-400">⚠ Crítica</span>}
                    </div>
                    <p className="text-xs tm-text-secondary mt-0.5">
                      {formatBytes(v.fileSizeBytes)} | {new Date(v.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </p>
                    {v.releaseNotes && <p className="text-xs tm-text-muted mt-1">{v.releaseNotes}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleToggle(v)} className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    v.isActive ? 'border-green-500/30 text-green-400' : 'tm-border tm-text'
                  }`}>
                    {v.isActive ? 'Ativa' : 'Inativa'}
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="px-3 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
