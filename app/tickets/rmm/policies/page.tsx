'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ShieldAlert,
  Plus,
  Edit,
  Search,
  ArrowLeft,
  Loader2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Cpu,
  HardDrive,
  MemoryStick,
  WifiOff,
  Building2,
} from 'lucide-react';

interface Policy {
  id: string;
  name: string;
  companyId: string | null;
  cpuThreshold: number | null;
  ramThreshold: number | null;
  diskThreshold: number | null;
  offlineMinutes: number | null;
  enabled: boolean;
  createdByName: string | null;
  createdAt: string;
}

interface Company {
  id: string;
  name: string;
}

export default function PoliciesPage() {
  const { data: session } = useSession();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', companyId: '', cpuThreshold: '', ramThreshold: '', diskThreshold: '', offlineMinutes: '', enabled: true,
  });

  const isAdmin = ['ADMIN','SUPPORT'].includes(session?.user?.role || '');

  const fetchData = async () => {
    try {
      const [policiesRes, companiesRes] = await Promise.all([
        fetch('/api/rmm/policies'),
        fetch('/api/companies?limit=500'),
      ]);
      if (policiesRes.ok) setPolicies(await policiesRes.json());
      if (companiesRes.ok) {
        const data = await companiesRes.json();
        setCompanies(Array.isArray(data) ? data : data.companies || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openEdit = (p: Policy) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      companyId: p.companyId || '',
      cpuThreshold: p.cpuThreshold !== null ? String(p.cpuThreshold) : '',
      ramThreshold: p.ramThreshold !== null ? String(p.ramThreshold) : '',
      diskThreshold: p.diskThreshold !== null ? String(p.diskThreshold) : '',
      offlineMinutes: p.offlineMinutes !== null ? String(p.offlineMinutes) : '',
      enabled: p.enabled,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/rmm/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: editingId }),
      });
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setForm({ name: '', companyId: '', cpuThreshold: '', ramThreshold: '', diskThreshold: '', offlineMinutes: '', enabled: true });
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error || 'Erro');
      }
    } catch { alert('Erro'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tickets/rmm" className="p-2 tm-text-secondary hover:tm-text transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold tm-text">Políticas de Alerta</h1>
      </div>

      {isAdmin && (
        <div className="flex justify-end">
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', companyId: '', cpuThreshold: '', ramThreshold: '', diskThreshold: '', offlineMinutes: '', enabled: true }); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Plus className="w-5 h-5" /> Nova Política
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/80 rounded-xl p-6 border border-gray-700 space-y-4">
          <h2 className="text-lg font-bold tm-text">{editingId ? 'Editar' : 'Nova'} Política</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm tm-text-secondary mb-1">Nome *</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm tm-text-secondary mb-1">Empresa (vazio = global)</label>
              <select value={form.companyId} onChange={e => setForm({...form, companyId: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500">
                <option value="">Global (todas)</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm tm-text-secondary mb-1">CPU % limite</label>
              <input type="number" min="0" max="100" value={form.cpuThreshold} onChange={e => setForm({...form, cpuThreshold: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500" placeholder="ex: 90" />
            </div>
            <div>
              <label className="block text-sm tm-text-secondary mb-1">RAM % limite</label>
              <input type="number" min="0" max="100" value={form.ramThreshold} onChange={e => setForm({...form, ramThreshold: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500" placeholder="ex: 85" />
            </div>
            <div>
              <label className="block text-sm tm-text-secondary mb-1">Disco % limite</label>
              <input type="number" min="0" max="100" value={form.diskThreshold} onChange={e => setForm({...form, diskThreshold: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500" placeholder="ex: 90" />
            </div>
            <div>
              <label className="block text-sm tm-text-secondary mb-1">Offline (min)</label>
              <input type="number" min="0" value={form.offlineMinutes} onChange={e => setForm({...form, offlineMinutes: e.target.value})} className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg tm-text focus:outline-none focus:border-blue-500" placeholder="ex: 30" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setForm({...form, enabled: !form.enabled})} className="flex items-center gap-2 text-sm">
              {form.enabled ? <ToggleRight className="w-6 h-6 text-green-400" /> : <ToggleLeft className="w-6 h-6 tm-text-muted" />}
              <span className={form.enabled ? 'text-green-400' : 'tm-text-muted'}>{form.enabled ? 'Ativa' : 'Inativa'}</span>
            </button>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 tm-text-secondary hover:tm-text">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </motion.div>
      )}

      {/* Policies list */}
      <div className="space-y-3">
        {policies.map(p => (
          <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`bg-gray-800/50 rounded-xl p-4 border transition-colors ${p.enabled ? 'border-gray-700 hover:border-gray-600' : 'border-gray-800 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldAlert className={`w-5 h-5 ${p.enabled ? 'text-blue-400' : 'tm-text-muted'}`} />
                  <h3 className="tm-text font-medium">{p.name}</h3>
                  {!p.enabled && <span className="text-xs tm-text-muted">(Inativa)</span>}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                  {p.companyId ? (
                    <span className="flex items-center gap-1 tm-text-secondary"><Building2 className="w-3.5 h-3.5" />{companies.find(c => c.id === p.companyId)?.name || 'Empresa'}</span>
                  ) : (
                    <span className="text-cyan-400 text-xs">Global</span>
                  )}
                  {p.cpuThreshold !== null && <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs"><Cpu className="w-3 h-3" />CPU &gt; {p.cpuThreshold}%</span>}
                  {p.ramThreshold !== null && <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">RAM &gt; {p.ramThreshold}%</span>}
                  {p.diskThreshold !== null && <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs"><HardDrive className="w-3 h-3" />Disco &gt; {p.diskThreshold}%</span>}
                  {p.offlineMinutes !== null && <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs"><WifiOff className="w-3 h-3" />Offline &gt; {p.offlineMinutes}min</span>}
                </div>
              </div>
              {isAdmin && (
                <button onClick={() => openEdit(p)} className="p-2 tm-text-secondary hover:text-blue-400 transition-colors" title="Editar">
                  <Edit className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
        {policies.length === 0 && (
          <div className="text-center py-12 tm-text-secondary">
            <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma política configurada</p>
          </div>
        )}
      </div>
    </div>
  );
}
