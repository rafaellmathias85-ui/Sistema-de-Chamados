'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Globe, ChevronLeft, Search, Loader2,
  Shield, Plus, Trash2, Check, X, Tag, Edit2,
  Building2, ToggleLeft, ToggleRight, Monitor, CheckSquare, Square,
} from 'lucide-react';
import MachineFilter from '@/components/rmm/machine-filter';

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

interface BrowsingEntry {
  id: string;
  url: string;
  domain: string;
  pageTitle: string | null;
  browser: string | null;
  category: string | null;
  durationSeconds: number | null;
  visitedAt: string;
  username: string | null;
  machine: { hostname: string; company: { id: string; name: string } };
}

interface MachineOption {
  id: string;
  hostname: string;
  status: string;
}

interface WfPolicy {
  id: string;
  name: string;
  mode: string;
  isActive: boolean;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  blockedDomains: string[];
  allowedDomains: string[];
  blockedCategories: string[];
  blockedKeywords: string[];
  machineIds: string[];
  logOnly: boolean;
  safeSearch: boolean;
  priority: number;
}

interface WfCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  _count?: { domains: number };
  domains?: { id: string; domain: string }[];
}

interface CompanyOption {
  id: string;
  name: string;
}

export default function WebPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'browsing' | 'logs' | 'policies' | 'categories'>('browsing');
  const [logs, setLogs] = useState<WebLog[]>([]);
  const [browsing, setBrowsing] = useState<BrowsingEntry[]>([]);
  const [policies, setPolicies] = useState<WfPolicy[]>([]);
  const [categories, setCategories] = useState<WfCategory[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterMachine, setFilterMachine] = useState('');
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({});
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [companyMachines, setCompanyMachines] = useState<MachineOption[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [allMachinesSelected, setAllMachinesSelected] = useState(true);

  // Form: nova política
  const [polForm, setPolForm] = useState({
    name: '',
    companyId: '' as string,
    mode: 'blacklist',
    blockedDomains: '' as string,
    blockedCategories: [] as string[],
    blockedKeywords: '' as string,
    machineIds: [] as string[],
    logOnly: false,
    safeSearch: true,
  });

  // Form: nova categoria
  const [catForm, setCatForm] = useState({ name: '', slug: '', description: '' });
  const [formType, setFormType] = useState<'policy' | 'category'>('policy');

  // Carregar empresas (API retorna { companies: [...], total, page, totalPages })
  useEffect(() => {
    fetch('/api/companies?limit=500')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.companies || []);
        setCompanies(list.map((c: any) => ({ id: c.id, name: c.name })).sort((a: CompanyOption, b: CompanyOption) => a.name.localeCompare(b.name)));
      }).catch(() => {});
  }, []);

  // Carregar máquinas quando empresa muda
  useEffect(() => {
    if (!polForm.companyId) {
      setCompanyMachines([]);
      setAllMachinesSelected(true);
      setPolForm(p => ({ ...p, machineIds: [] }));
      return;
    }
    setLoadingMachines(true);
    fetch(`/api/rmm/machines?companyId=${polForm.companyId}`)
      .then(r => r.json())
      .then(data => {
        const machines = (Array.isArray(data) ? data : []).map((m: any) => ({
          id: m.id,
          hostname: m.hostname,
          status: m.status || 'Offline',
        }));
        setCompanyMachines(machines);
        setAllMachinesSelected(true);
        setPolForm(p => ({ ...p, machineIds: [] }));
      })
      .catch(() => setCompanyMachines([]))
      .finally(() => setLoadingMachines(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polForm.companyId]);

  const loadBrowsing = useCallback(async () => {
    if (!filterMachine) { setBrowsing([]); return; }
    const params = new URLSearchParams({ limit: '200', machineId: filterMachine });
    const res = await fetch(`/api/rmm/governance/web-activity?${params}`);
    if (res.ok) setBrowsing(await res.json());
  }, [filterMachine]);

  const loadLogs = useCallback(async () => {
    if (!filterMachine) { setLogs([]); return; }
    const params = new URLSearchParams({ limit: '200', machineId: filterMachine });
    const res = await fetch(`/api/rmm/webfilter/logs?${params}`);
    if (res.ok) setLogs(await res.json());
  }, [filterMachine]);

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
    Promise.all([loadBrowsing(), loadLogs(), loadPolicies(), loadCategories()]).finally(() => setLoading(false));
  }, [session, loadBrowsing, loadLogs, loadPolicies, loadCategories]);

  // ===== POLÍTICAS =====
  const [formError, setFormError] = useState('');

  const handleCreatePolicy = async () => {
    if (!polForm.name) return;
    if (!allMachinesSelected && polForm.machineIds.length === 0 && polForm.companyId) {
      setFormError('Selecione pelo menos uma máquina ou marque "Todas as máquinas".');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const payload: any = {
        name: polForm.name,
        mode: polForm.mode,
        blockedDomains: polForm.blockedDomains ? polForm.blockedDomains.split(',').map(d => d.trim()).filter(Boolean) : [],
        blockedCategories: polForm.blockedCategories,
        blockedKeywords: polForm.blockedKeywords ? polForm.blockedKeywords.split(',').map(k => k.trim()).filter(Boolean) : [],
        machineIds: allMachinesSelected ? [] : polForm.machineIds,
        logOnly: polForm.logOnly,
        safeSearch: polForm.safeSearch,
      };
      if (polForm.companyId) payload.companyId = polForm.companyId;
      const res = await fetch('/api/rmm/webfilter/policies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await loadPolicies();
        setShowForm(false);
        setAllMachinesSelected(true);
        setCompanyMachines([]);
        setFormError('');
        setPolForm({ name: '', companyId: '', mode: 'blacklist', blockedDomains: '', blockedCategories: [], blockedKeywords: '', machineIds: [], logOnly: false, safeSearch: true });
      } else {
        const err = await res.json().catch(() => ({}));
        setFormError(err?.error || `Erro ao criar política (${res.status}). Verifique os logs do servidor.`);
      }
    } catch (e: any) {
      setFormError(`Erro de conexão: ${e.message}`);
    } finally { setSaving(false); }
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta política?')) return;
    const res = await fetch(`/api/rmm/webfilter/policies/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadPolicies();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || `Erro ao excluir política (${res.status})`);
    }
  };

  const handleTogglePolicy = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/rmm/webfilter/policies/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      await loadPolicies();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || `Erro ao atualizar política (${res.status})`);
    }
  };

  // ===== CATEGORIAS =====
  const handleCreateCategory = async () => {
    if (!catForm.name) return;
    setSaving(true);
    try {
      const slug = catForm.slug || catForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const res = await fetch('/api/rmm/webfilter/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catForm.name, slug, description: catForm.description || null }),
      });
      if (res.ok) {
        await loadCategories();
        setShowForm(false);
        setCatForm({ name: '', slug: '', description: '' });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || `Erro ao criar categoria (${res.status})`);
      }
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally { setSaving(false); }
  };

  const handleAddDomain = async (categoryId: string) => {
    const input = domainInputs[categoryId]?.trim();
    if (!input) return;
    const res = await fetch(`/api/rmm/webfilter/categories/${categoryId}/domains`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains: [input] }),
    });
    if (res.ok) {
      setDomainInputs(prev => ({ ...prev, [categoryId]: '' }));
      await loadCategories();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || `Erro ao adicionar domínio (${res.status})`);
    }
  };

  const handleRemoveDomain = async (categoryId: string, domainText: string) => {
    const res = await fetch(`/api/rmm/webfilter/categories/${categoryId}/domains?domain=${encodeURIComponent(domainText)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || `Erro ao remover domínio (${res.status})`);
    }
    await loadCategories();
  };

  // ===== FILTROS =====
  const filteredLogs = logs.filter(l =>
    !search ||
    l.url.toLowerCase().includes(search.toLowerCase()) ||
    l.domain.toLowerCase().includes(search.toLowerCase()) ||
    (l.machine?.hostname || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.machine?.company?.name || '').toLowerCase().includes(search.toLowerCase())
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
        {([['browsing', 'Navegação', Globe], ['logs', 'Bloqueios', Shield], ['policies', 'Políticas', Shield], ['categories', 'Categorias', Tag]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === key ? 'bg-blue-600 text-white' : 'tm-text-secondary hover:bg-white/10'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Machine Filter */}
      <MachineFilter value={filterMachine} onChange={setFilterMachine} />

      {/* ========== BROWSING TAB ========== */}
      {tab === 'browsing' && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 tm-text-muted" size={16} />
            <input type="text" placeholder="Buscar por URL, domínio, navegador..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
          </div>
          {(() => {
            const filtered = browsing.filter(b =>
              !search ||
              b.url.toLowerCase().includes(search.toLowerCase()) ||
              b.domain.toLowerCase().includes(search.toLowerCase()) ||
              (b.browser || '').toLowerCase().includes(search.toLowerCase()) ||
              (b.pageTitle || '').toLowerCase().includes(search.toLowerCase())
            );
            if (filtered.length === 0) return (
              <div className="text-center py-20 tm-text-secondary">
                <Globe className="mx-auto mb-3 opacity-30" size={48} />
                <p>{!filterMachine ? 'Selecione uma máquina para ver a navegação' : 'Nenhum registro de navegação'}</p>
              </div>
            );
            return (
              <div className="tm-bg-card border tm-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b tm-border text-left">
                        <th className="px-4 py-3 tm-text-secondary font-medium">QUANDO</th>
                        <th className="px-4 py-3 tm-text-secondary font-medium">NAVEGADOR</th>
                        <th className="px-4 py-3 tm-text-secondary font-medium">DOMÍNIO</th>
                        <th className="px-4 py-3 tm-text-secondary font-medium">PÁGINA</th>
                        <th className="px-4 py-3 tm-text-secondary font-medium">USUÁRIO</th>
                        <th className="px-4 py-3 tm-text-secondary font-medium">HOSTNAME</th>
                        <th className="px-4 py-3 tm-text-secondary font-medium">EMPRESA</th>
                        <th className="px-4 py-3 tm-text-secondary font-medium">DURAÇÃO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 100).map((b, i) => (
                        <motion.tr key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                          className="border-b tm-border hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2.5 tm-text-muted text-xs whitespace-nowrap">{new Date(b.visitedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              (b.browser || '').toLowerCase().includes('chrome') ? 'bg-green-600/20 text-green-400' :
                              (b.browser || '').toLowerCase().includes('edge') ? 'bg-blue-600/20 text-blue-400' :
                              (b.browser || '').toLowerCase().includes('firefox') ? 'bg-orange-600/20 text-orange-400' :
                              'bg-gray-600/20 tm-text-muted'
                            }`}>
                              {b.browser || 'Desconhecido'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs tm-text">{b.domain}</td>
                          <td className="px-4 py-2.5 tm-text-secondary text-xs max-w-[300px] truncate" title={b.pageTitle || b.url}>{b.pageTitle || b.url}</td>
                          <td className="px-4 py-2.5 tm-text-secondary text-xs">{b.username || '—'}</td>
                          <td className="px-4 py-2.5 font-mono tm-text text-xs">{b.machine?.hostname || '—'}</td>
                          <td className="px-4 py-2.5 tm-text-secondary text-xs">{b.machine?.company?.name || '—'}</td>
                          <td className="px-4 py-2.5 tm-text-muted text-xs">{b.durationSeconds ? `${Math.floor(b.durationSeconds / 60)}m ${b.durationSeconds % 60}s` : '—'}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filtered.length > 100 && <p className="text-center py-2 tm-text-muted text-xs">Mostrando 100 de {filtered.length} registros</p>}
              </div>
            );
          })()}
        </>
      )}

      {/* ========== LOGS TAB ========== */}
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
              <p>Nenhum log de bloqueio registrado</p>
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
                        <td className="px-4 py-3 font-mono text-xs tm-text">{l.machine?.hostname || '—'}</td>
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

      {/* ========== POLICIES TAB ========== */}
      {tab === 'policies' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setFormType('policy'); setShowForm(!showForm); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
              <Plus size={14} /> Nova Política
            </button>
          </div>

          <AnimatePresence>
            {showForm && formType === 'policy' && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold tm-text">Nova Política Web Filter</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs tm-text-secondary">Nome da Política *</label>
                    <input value={polForm.name} onChange={e => setPolForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1"
                      placeholder="Ex: Bloquear Redes Sociais" />
                  </div>
                  <div>
                    <label className="text-xs tm-text-secondary">Empresa (deixe vazio = global)</label>
                    <select value={polForm.companyId} onChange={e => setPolForm(p => ({ ...p, companyId: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1">
                      <option value="">Todas as empresas (Global)</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Seleção de máquinas (aparece quando empresa está selecionada) */}
                {polForm.companyId && (
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
                              setPolForm(p => ({ ...p, machineIds: [] }));
                            }} />
                          <span className="font-medium">Todas as máquinas ({companyMachines.length})</span>
                        </label>

                        {!allMachinesSelected && (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                            {companyMachines.map(m => {
                              const isSelected = polForm.machineIds.includes(m.id);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setPolForm(p => ({
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

                        {!allMachinesSelected && polForm.machineIds.length > 0 && (
                          <p className="text-xs text-blue-400">{polForm.machineIds.length} máquina(s) selecionada(s)</p>
                        )}
                        {!allMachinesSelected && polForm.machineIds.length === 0 && (
                          <p className="text-xs text-yellow-400">Selecione pelo menos uma máquina</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs tm-text-secondary">Modo</label>
                    <select value={polForm.mode} onChange={e => setPolForm(p => ({ ...p, mode: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1">
                      <option value="blacklist">Blacklist (bloquear listados)</option>
                      <option value="whitelist">Whitelist (só permitir listados)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs tm-text-secondary">Domínios bloqueados (separados por vírgula)</label>
                    <input value={polForm.blockedDomains} onChange={e => setPolForm(p => ({ ...p, blockedDomains: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1"
                      placeholder="facebook.com, tiktok.com, instagram.com" />
                  </div>
                </div>

                <div>
                  <label className="text-xs tm-text-secondary">Palavras-chave bloqueadas (separadas por vírgula)</label>
                  <input value={polForm.blockedKeywords} onChange={e => setPolForm(p => ({ ...p, blockedKeywords: e.target.value }))}
                    className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1"
                    placeholder="poker, casino, torrent" />
                </div>

                {categories.length > 0 && (
                  <div>
                    <label className="text-xs tm-text-secondary">Categorias bloqueadas</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {categories.map(c => (
                        <button key={c.id} onClick={() => setPolForm(p => ({
                          ...p, blockedCategories: p.blockedCategories.includes(c.id)
                            ? p.blockedCategories.filter(x => x !== c.id)
                            : [...p.blockedCategories, c.id]
                        }))}
                          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                            polForm.blockedCategories.includes(c.id) ? 'bg-red-600 border-red-500 text-white' : 'tm-border tm-text hover:bg-white/10'
                          }`}>{c.name}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm tm-text cursor-pointer">
                    <input type="checkbox" checked={polForm.logOnly} onChange={e => setPolForm(p => ({ ...p, logOnly: e.target.checked }))} />
                    Apenas registrar (não bloquear)
                  </label>
                  <label className="flex items-center gap-2 text-sm tm-text cursor-pointer">
                    <input type="checkbox" checked={polForm.safeSearch} onChange={e => setPolForm(p => ({ ...p, safeSearch: e.target.checked }))} />
                    Forçar SafeSearch
                  </label>
                </div>

                {formError && (
                  <div className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {formError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={handleCreatePolicy} disabled={saving || !polForm.name}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Criar Política'}
                  </button>
                  <button onClick={() => { setShowForm(false); setFormError(''); }} className="px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">Cancelar</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {policies.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Shield className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhuma política web configurada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {policies.map(p => (
                <div key={p.id} className={`tm-bg-card border rounded-xl p-4 ${p.isActive ? 'border-green-500/30' : 'tm-border opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium tm-text">{p.name}</h4>
                      <div className="text-xs tm-text-secondary mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span>Modo: <span className="text-blue-400">{p.mode}</span></span>
                        {p.company ? (
                          <span className="flex items-center gap-1"><Building2 size={10} /> {p.company.name}</span>
                        ) : (
                          <span className="text-yellow-400">Global</span>
                        )}
                        {p.machineIds?.length > 0 ? (
                          <span className="flex items-center gap-1"><Monitor size={10} /> {p.machineIds.length} máquina(s)</span>
                        ) : p.companyId ? (
                          <span className="flex items-center gap-1"><Monitor size={10} /> Todas as máquinas</span>
                        ) : null}
                        {p.blockedDomains?.length > 0 && <span>{p.blockedDomains.length} domínio(s)</span>}
                        {p.blockedCategories?.length > 0 && <span>{p.blockedCategories.length} categoria(s)</span>}
                        {p.logOnly && <span className="text-yellow-400">Apenas log</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTogglePolicy(p.id, p.isActive)}
                        className={`p-1.5 rounded transition-colors ${p.isActive ? 'text-green-400 hover:bg-green-500/10' : 'tm-text-muted hover:bg-white/10'}`}
                        title={p.isActive ? 'Desativar' : 'Ativar'}>
                        {p.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <button onClick={() => handleDeletePolicy(p.id)}
                        className="p-1.5 rounded text-red-400 hover:bg-red-500/10 transition-colors" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ========== CATEGORIES TAB ========== */}
      {tab === 'categories' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => { setFormType('category'); setShowForm(!showForm); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
              <Plus size={14} /> Nova Categoria
            </button>
          </div>

          <AnimatePresence>
            {showForm && formType === 'category' && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="tm-bg-card border tm-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold tm-text">Nova Categoria</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs tm-text-secondary">Nome *</label>
                    <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1"
                      placeholder="Ex: Redes Sociais" />
                  </div>
                  <div>
                    <label className="text-xs tm-text-secondary">Descrição</label>
                    <input value={catForm.description} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))}
                      className="w-full px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm mt-1"
                      placeholder="Conteúdo adulto e pornografia" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreateCategory} disabled={saving || !catForm.name}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Criar Categoria'}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm">Cancelar</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {categories.length === 0 ? (
            <div className="text-center py-20 tm-text-secondary">
              <Tag className="mx-auto mb-3 opacity-30" size={48} />
              <p>Nenhuma categoria criada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="tm-bg-card border tm-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-medium tm-text flex items-center gap-2">
                        <Tag size={14} className="text-blue-400" /> {cat.name}
                        {cat._count?.domains !== undefined && (
                          <span className="text-xs tm-text-muted">({cat._count.domains} domínios)</span>
                        )}
                      </h4>
                      {cat.description && <p className="text-xs tm-text-secondary mt-0.5">{cat.description}</p>}
                    </div>
                    <button onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
                      className="text-xs tm-text-secondary hover:text-blue-400 transition-colors">
                      {selectedCat === cat.id ? 'Fechar' : 'Gerenciar domínios'}
                    </button>
                  </div>
                  <AnimatePresence>
                    {selectedCat === cat.id && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mt-3 space-y-2 border-t tm-border pt-3 overflow-hidden">
                        <div className="flex gap-2">
                          <input
                            value={domainInputs[cat.id] || ''}
                            onChange={e => setDomainInputs(prev => ({ ...prev, [cat.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddDomain(cat.id); }}
                            placeholder="dominio.com"
                            className="flex-1 px-3 py-2 tm-bg-card border tm-border rounded-lg tm-text text-sm" />
                          <button onClick={() => handleAddDomain(cat.id)}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Adicionar</button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {cat.domains?.map(d => (
                            <span key={d.id} className="px-2 py-1 tm-bg-card border tm-border rounded-full text-xs tm-text flex items-center gap-1">
                              {d.domain}
                              <button onClick={() => handleRemoveDomain(cat.id, d.domain)} className="text-red-400 hover:text-red-300 ml-1">
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                          {(!cat.domains || cat.domains.length === 0) && (
                            <span className="text-xs tm-text-muted">Nenhum domínio adicionado</span>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
