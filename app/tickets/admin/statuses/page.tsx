'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Loader2, CheckCircle, AlertCircle, Eye, EyeOff, Palette } from 'lucide-react';

interface StatusConfig {
  key: string;
  label: string;
  color: string;
  enabled: boolean;
}

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

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/ticket-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statuses),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Configura\u00e7\u00f5es de status salvas com sucesso!' });
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || 'Erro ao salvar' });
      }
    } catch { setMessage({ type: 'error', text: 'Erro de conex\u00e3o' }); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Palette size={28} className="text-blue-400" />
            Gerenciar Status de Chamados
          </h1>
          <p className="text-gray-400 text-sm mt-1">Personalize os labels, cores e visibilidade dos status</p>
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
          <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-3 text-xs font-semibold text-gray-400 uppercase px-2">
            <span>C\u00f3digo</span>
            <span>Label Exibido</span>
            <span>Cor</span>
            <span>Vis\u00edvel</span>
          </div>
          {statuses.map((s, i) => (
            <div key={s.key} className={`grid grid-cols-[1fr_2fr_auto_auto] gap-3 items-center p-3 rounded-lg border transition-colors ${s.enabled ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/[0.02] opacity-60'}`}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-mono tm-text-secondary">{s.key}</span>
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
                title={s.enabled ? 'Vis\u00edvel' : 'Oculto'}
              >
                {s.enabled ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-4">Os c\u00f3digos s\u00e3o fixos (enum do banco de dados). Voc\u00ea pode alterar o label exibido, a cor e a visibilidade nos dropdowns.</p>
      </div>

      <div className="flex items-center justify-between pb-8">
        <button onClick={handleReset} className="text-sm text-gray-400 hover:text-white transition">Restaurar padr\u00f5es</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition shadow-lg shadow-blue-600/20"
        >
          <Save size={18} />
          {saving ? 'Salvando...' : 'Salvar Configura\u00e7\u00f5es'}
        </button>
      </div>
    </div>
  );
}
