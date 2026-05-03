'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Eye, EyeOff, Palette, Plus, Trash2, Lock } from 'lucide-react';

interface StatusConfig {
  key: string;
  label: string;
  color: string;
  enabled: boolean;
}

const PROTECTED_KEYS = new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

const DEFAULT_STATUSES: StatusConfig[] = [
  { key: 'OPEN', label: 'Aberto', color: '#22c55e', enabled: true },
  { key: 'IN_PROGRESS', label: 'Em Andamento', color: '#3b82f6', enabled: true },
  { key: 'IN_PARTNER', label: 'Parceiro', color: '#a855f7', enabled: true },
  { key: 'PAUSED', label: 'Pausado', color: '#f59e0b', enabled: true },
  { key: 'AWAITING_CLIENT', label: 'Aguardando Cliente', color: '#f97316', enabled: true },
  { key: 'RESOLVED', label: 'Resolvido', color: '#06b6d4', enabled: true },
  { key: 'CLOSED', label: 'Fechado', color: '#6b7280', enabled: true },
];

export default function StatusManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [statuses, setStatuses] = useState<StatusConfig[]>(DEFAULT_STATUSES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role !== 'ADMIN') { router.replace('/tickets'); return; }
      loadStatuses();
    }
  }, [status, session, router]);

  const loadStatuses = async () => {
    try {
      const res = await fetch('/api/admin/ticket-status');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setStatuses(data);
      }
    } catch {} finally { setLoading(false); }
  };

  const updateStatus = (index: number, field: keyof StatusConfig, value: string | boolean) => {
    setStatuses(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removeStatus = (index: number) => {
    const s = statuses[index];
    if (PROTECTED_KEYS.has(s.key)) {
      setMessage({ type: 'error', text: `O status "${s.key}" é protegido e não pode ser removido.` });
      return;
    }
    if (!confirm(`Remover o status "${s.label}" (${s.key})?\n\nChamados que estiverem usando este status precisam ser migrados antes.`)) return;
    setStatuses(prev => prev.filter((_, i) => i !== index));
    setMessage(null);
  };

  const addStatus = () => {
    const key = newKey.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    const label = newLabel.trim();
    if (!key || !label) {
      setMessage({ type: 'error', text: 'Informe código e label do novo status.' });
      return;
    }
    if (statuses.some(s => s.key === key)) {
      setMessage({ type: 'error', text: `Já existe um status com o código "${key}".` });
      return;
    }
    const color = /^#[0-9a-fA-F]{6}$/.test(newColor) ? newColor : '#3b82f6';
    setStatuses(prev => [...prev, { key, label, color, enabled: true }]);
    setNewKey(''); setNewLabel(''); setNewColor('#3b82f6');
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/ticket-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statuses),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (Array.isArray(data.statuses)) setStatuses(data.statuses);
        setMessage({ type: 'success', text: 'Configurações de status salvas com sucesso!' });
      } else {
        setMessage({ type: 'error', text: data?.error || 'Erro ao salvar' });
      }
    } catch { setMessage({ type: 'error', text: 'Erro de conexão' }); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    if (!confirm('Restaurar configuração padrão? As personalizações atuais serão perdidas (precisa salvar para persistir).')) return;
    setStatuses(DEFAULT_STATUSES);
    setMessage(null);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session?.user?.role !== 'ADMIN') return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Palette size={28} className="text-blue-400" />
            Gerenciar Status de Chamados
          </h1>
          <p className="text-gray-400 text-sm mt-1">Personalize, adicione ou remova status conforme o fluxo da sua operação</p>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-4 rounded-lg border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <div className="rounded-xl border border-white/10 p-6" style={{ background: 'var(--bg-card)' }}>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-3 text-xs font-semibold text-gray-400 uppercase px-2">
            <span>Código</span>
            <span>Label Exibido</span>
            <span>Cor</span>
            <span>Visível</span>
            <span>Ações</span>
          </div>
          {statuses.map((s, i) => {
            const isProtected = PROTECTED_KEYS.has(s.key);
            return (
              <div key={s.key + i} className={`grid grid-cols-[1fr_2fr_auto_auto_auto] gap-3 items-center p-3 rounded-lg border transition-colors ${s.enabled ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/[0.02] opacity-60'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-mono tm-text-secondary truncate">{s.key}</span>
                  {isProtected && <Lock size={12} className="text-gray-500 flex-shrink-0" />}
                </div>
                <input
                  type="text"
                  value={s.label}
                  onChange={(e) => updateStatus(i, 'label', e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 tm-text text-sm focus:border-blue-500 outline-none"
                />
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => updateStatus(i, 'color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-white/10 bg-transparent"
                />
                <button
                  onClick={() => updateStatus(i, 'enabled', !s.enabled)}
                  className={`p-1.5 rounded-lg transition-colors ${s.enabled ? 'text-green-400 hover:bg-green-500/20' : 'text-gray-600 hover:bg-white/10'}`}
                  title={s.enabled ? 'Visível' : 'Oculto'}
                >
                  {s.enabled ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button
                  onClick={() => removeStatus(i)}
                  disabled={isProtected}
                  className={`p-1.5 rounded-lg transition-colors ${isProtected ? 'text-gray-700 cursor-not-allowed' : 'text-red-400 hover:bg-red-500/20'}`}
                  title={isProtected ? 'Status protegido (não pode ser removido)' : 'Remover'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Status protegidos (<Lock size={10} className="inline" />): <code>OPEN</code>, <code>IN_PROGRESS</code>, <code>RESOLVED</code>, <code>CLOSED</code> são exigidos pelas regras de negócio (notificações, fluxos automáticos) e não podem ser removidos.
        </p>
      </div>

      {/* Adicionar novo status */}
      <div className="rounded-xl border border-white/10 p-6" style={{ background: 'var(--bg-card)' }}>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Plus size={16} className="text-blue-400" /> Adicionar novo status</h3>
        <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Código</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              placeholder="EX: AGUARDANDO_NF"
              className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 tm-text text-sm focus:border-blue-500 outline-none font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Aguardando NF"
              className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 tm-text text-sm focus:border-blue-500 outline-none"
            />
          </div>
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-9 rounded cursor-pointer border border-white/10 bg-transparent"
          />
          <button
            onClick={addStatus}
            className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-sm font-medium transition"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">As alterações só são persistidas após clicar em "Salvar Configurações".</p>
      </div>

      <div className="flex items-center justify-between pb-8">
        <button onClick={handleReset} className="text-sm text-gray-400 hover:text-white transition">Restaurar padrões</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition shadow-lg shadow-blue-600/20"
        >
          <Save size={18} />
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}
