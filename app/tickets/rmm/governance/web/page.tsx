'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Globe, ChevronLeft, RefreshCw, Search, Loader2,
  Shield, Plus, Trash2, Check, X, AlertTriangle, Tag, Link2,
} from 'lucide-react';

interface WebLog {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  action: string;
  categoryMatched: string | null;
  machineId: string;
  username: string | null;
  timestamp: string;
  machine: { hostname: string; company: { name: string } };
}

interface WfPolicy {
  id: string;
  name: string;
  action: string;
  isActive: boolean;
  appliesToAll: boolean;
  categories: { id: string; category: { name: string } }[];
}

interface WfCategory {
  id: string;
  name: string;
  description: string | null;
  _count?: { domains: number };
  domains?: { id: string; domain: string }[];
}

export default function WebPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'logs' | 'policies' | 'categories'>('logs');
  const [logs, setLogs] = useState<WebLog[]>([]);
  const [policies, setPolicies] = useState<WfPolicy[]>([]);
  const [categories, setCategories] = useState<WfCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [polForm, setPolForm] = useState({ name: '', action: 'block', categoryIds: [] as string[], appliesToAll: true });
  const [domainInput, setDomainInput] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formType, setFormType] = useState<'policy' | 'category'>('policy');

  const loadLogs = useCallback(async () => {
    const res = await fetch('/api/rmm/webfilter/logs?limit=200');
    if (res.ok) setLogs(await res.json());
  }, []);
  const loadPolicies = useCallback(async () => {
    const res = await fetch('/api/rmm/webfilter/policies');
    if (res.ok) setPolicies(await res.json());
  }, []);
  const loadCategories = useCallback(async () => {
    const res = await fetch('/api/rmm/webfilter/categories');
    if (res.ok) setCategories(await res.json());
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([loadLogs(), loadPolicies(), loadCategories()]).finally(() => setLoading(false));
  }, [session, loadLogs, loadPolicies, loadCategories]);

  const handleCreatePolicy = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/rmm/webfilter/policies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(polForm),
      });
      if (res.ok) { await loadPolicies(); setShowForm(false); }
    } finally { setSaving(false); }
  };

  const handleCreateCategory = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/rmm/webfilter/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(catForm),
      });
      if (res.ok) { await loadCategories(); setShowForm(false); setCatForm({ name: '', description: '' }); }
    } finally { setSaving(false); }
  };

  const handleAddDomain = async (categoryId: string) => {
    if (!domainInput.trim()) return;
    await fetch(`/api/rmm/webfilter/categories/${categoryId}/domains`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: domainInput.trim() }),
    });
    setDomainInput('');
    await loadCategories();
  };

  const handleRemoveDomain = async (categoryId: string, domainId: string) => {
    await fetch(`/api/rmm/webfilter/categories/${categoryId}/domains?domainId=${domainId}`, { method: 'DELETE' });
    await loadCategories();
  };

  const filteredLogs = logs.filter(l =>
    !search ||
    l.url.toLowerCase().includes(search.toLowerCase()) ||
    l.domain.toLowerCase().includes(search.toLowerCase()) ||
    l.machine.hostname.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-400" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-montserrat font-bold tm-text flex items-center gap-3">
            <Globe className="text-blue-400" size={28} />
            Web Filter & Navegação
          </h1>
          <p className="tm-text-secondary mt-1">Logs de navegação, políticas de acesso e categorias</p>
        </div>
        <Link href="/tickets/rmm/governance" className="px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text hover:bg-white/10 transition flex items-center gap-2 text-sm">
          <ChevronLeft size={14} /> Governance
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b tm-border pb-2">
        {([['logs', 'Logs de Navegação', Globe], ['policies', 'Políticas', Shield], ['categories', 'Categorias', Tag]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === key ? 'bg-blue-600 text-white' : 'tm-text-secondary hover:bg-white/10'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Logs Tab */}
      {tab === 'logs' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
            <input type="text" placeholder="Buscar por URL, domínio, host..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
          </div>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Globe className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhum log de navegação registrado</p>
            </div>
          ) : (
            <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b tm-border text-left">
                      <th className="px-4 py-3 tm-text-secondary font-medium">AÇÃO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">DOMÍNIO</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">URL</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">CATEGORIA</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">HOSTNAME</th>
                      <th className="px-4 py-3 tm-text-secondary font-medium">DATA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l, i) => (
                      <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className="border-b tm-border hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          {l.action === 'blocked' ? (
                            <span className="text-red-400 flex items-center gap-1 text-xs"><X size={12} /> Bloqueado</span>
                          ) : (
                            <span className="text-green-400 flex items-center gap-1 text-xs"><Check size={12} /> Permitido</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tm-text">{l.domain}</td>
                        <td className="px-4 py-3 tm-text-muted text-xs max-w-[250px] truncate" title={l.url}>{l.url}</td>
                        <td className="px-4 py-3 text-xs">
                          {l.categoryMatched ? <span className="text-orange-400">{l.categoryMatched}</span> : <span className="tm-text-muted">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tm-text">{l.machine.hostname}</td>
                        <td className="px-4 py-3 tm-text-muted text-xs">{new Date(l.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Policies Tab */}
      {tab === 'policies' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setFormType('policy'); setShowForm(!showForm); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
              <Plus size={14} /> Nova Política
            </button>
          </div>
          {showForm && formType === 'policy' && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold tm-text">Nova Política Web Filter</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs tm-text-secondary">Nome</label>
                  <input value={polForm.name} onChange={e => setPolForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="Ex: Bloquear Redes Sociais" />
                </div>
                <div>
                  <label className="text-xs tm-text-secondary">Ação</label>
                  <select value={polForm.action} onChange={e => setPolForm(p => ({ ...p, action: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1">
                    <option value="block">Bloquear</option>
                    <option value="allow">Permitir</option>
                    <option value="log_only">Apenas Registrar</option>
                  </select>
                </div>
              </div>
              {categories.length > 0 && (
                <div>
                  <label className="text-xs tm-text-secondary">Categorias</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {categories.map(c => (
                      <button key={c.id} onClick={() => setPolForm(p => ({ ...p, categoryIds: p.categoryIds.includes(c.id) ? p.categoryIds.filter(x => x !== c.id) : [...p.categoryIds, c.id] }))}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                          polForm.categoryIds.includes(c.id) ? 'bg-blue-600 border-blue-500 text-white' : 'tm-border tm-text hover:bg-white/10'
                        }`}>{c.name}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleCreatePolicy} disabled={saving || !polForm.name} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Criar Política'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">Cancelar</button>
              </div>
            </motion.div>
          )}
          {policies.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary"><Shield className="mx-auto mb-3 opacity-30" size={48} /><p>Nenhuma política web configurada</p></div>
          ) : (
            <div className="space-y-3">
              {policies.map(p => (
                <div key={p.id} className={`tm-bg-card border rounded-xl p-4 ${p.isActive ? 'border-green-500/30' : 'tm-border opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium tm-text">{p.name}</h4>
                      <p className="text-xs tm-text-secondary mt-0.5">
                        Ação: <span className={p.action === 'block' ? 'text-red-400' : 'text-green-400'}>{p.action}</span>
                        {p.categories?.length > 0 && ` | Categorias: ${p.categories.map(c => c.category.name).join(', ')}`}
                      </p>
                    </div>
                    <span className={`text-xs ${p.isActive ? 'text-green-400' : 'tm-text-muted'}`}>{p.isActive ? 'Ativa' : 'Inativa'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Categories Tab */}
      {tab === 'categories' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setFormType('category'); setShowForm(!showForm); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
              <Plus size={14} /> Nova Categoria
            </button>
          </div>
          {showForm && formType === 'category' && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold tm-text">Nova Categoria</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs tm-text-secondary">Nome</label>
                  <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="Ex: Redes Sociais" />
                </div>
                <div>
                  <label className="text-xs tm-text-secondary">Descrição</label>
                  <input value={catForm.description} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1" placeholder="Ex: Facebook, Instagram, TikTok..." />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateCategory} disabled={saving || !catForm.name} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Criar Categoria'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">Cancelar</button>
              </div>
            </motion.div>
          )}
          {categories.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary"><Tag className="mx-auto mb-3 opacity-30" size={48} /><p>Nenhuma categoria criada</p></div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="tm-bg-card border tm-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-medium tm-text flex items-center gap-2"><Tag size={14} className="text-blue-400" /> {cat.name}</h4>
                      {cat.description && <p className="text-xs tm-text-secondary mt-0.5">{cat.description}</p>}
                    </div>
                    <button onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)} className="text-xs tm-text-secondary hover:text-blue-400 transition-colors">
                      {selectedCat === cat.id ? 'Fechar' : 'Gerenciar domínios'}
                    </button>
                  </div>
                  {selectedCat === cat.id && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2 border-t tm-border pt-3">
                      <div className="flex gap-2">
                        <input value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="dominio.com"
                          className="flex-1 px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
                        <button onClick={() => handleAddDomain(cat.id)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Adicionar</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {cat.domains?.map(d => (
                          <span key={d.id} className="px-2 py-1 tm-bg-card border tm-border rounded-full text-xs tm-text flex items-center gap-1">
                            {d.domain}
                            <button onClick={() => handleRemoveDomain(cat.id, d.id)} className="text-red-400 hover:text-red-300"><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
