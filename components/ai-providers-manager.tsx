'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, ArrowUp, ArrowDown, Loader2, Save, X,
  Server, Lock, AlertTriangle, CheckCircle,
} from 'lucide-react';

interface ProviderRow {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  priority: number;
  weight: number;
  enabled: boolean;
  bestFor: string[];
  isBuiltin: boolean;
  isCustom: boolean;
  hasKey: boolean;
  keyPreview: string;
  apiFormat: string;
  apiKeyEnv: string | null;
}

type ProviderForm = {
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
  priority: number;
  weight: number;
  enabled: boolean;
  bestFor: string[];
  apiFormat: string;
};

const PRESETS: Record<string, Partial<ProviderForm>> = {
  custom: {},
  claude: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20241022',
    apiFormat: 'anthropic',
    bestFor: ['complex', 'creative'],
  },
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    apiFormat: 'openai_compatible',
    bestFor: ['general', 'fast'],
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    apiFormat: 'openai_compatible',
    bestFor: ['fast', 'general'],
  },
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-large-latest',
    apiFormat: 'openai_compatible',
    bestFor: ['general', 'creative'],
  },
};

const BEST_FOR_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'fast', label: 'Rápido' },
  { key: 'general', label: 'Geral' },
  { key: 'complex', label: 'Complexo' },
  { key: 'creative', label: 'Criativo' },
];

const emptyForm = (): ProviderForm => ({
  name: '',
  endpoint: '',
  model: '',
  apiKey: '',
  priority: 99,
  weight: 1,
  enabled: true,
  bestFor: ['general'],
  apiFormat: 'openai_compatible',
});

export default function AIProvidersManager() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm());
  const [preset, setPreset] = useState('custom');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/ai-providers');
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setProviders(d.providers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar provedores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(row: ProviderRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      endpoint: row.endpoint,
      model: row.model,
      apiKey: '',
      priority: row.priority,
      weight: row.weight,
      enabled: row.enabled,
      bestFor: row.bestFor.length ? row.bestFor : ['general'],
      apiFormat: row.apiFormat || 'openai_compatible',
    });
  }

  function applyPreset(key: string) {
    setPreset(key);
    if (key === 'custom') return;
    const data = PRESETS[key];
    setForm(f => ({ ...f, ...data, apiKey: '' }));
  }

  async function handleCreate() {
    if (busy) return;
    if (!form.name.trim() || !form.endpoint.trim() || !form.model.trim() || !form.apiKey.trim()) {
      alert('Preencha nome, endpoint, modelo e API key.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      setShowCreateModal(false);
      setForm(emptyForm());
      setPreset('custom');
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit() {
    if (busy || !editingId) return;
    setBusy(true);
    try {
      const target = providers.find(p => p.id === editingId);
      const isBuiltin = target?.isBuiltin;

      // Built-ins: só envia campos editaveis (sem name/endpoint/apiKey)
      const payload: Record<string, unknown> = {
        priority: form.priority,
        weight: form.weight,
        enabled: form.enabled,
        model: form.model,
        bestFor: form.bestFor,
      };
      if (!isBuiltin) {
        payload.endpoint = form.endpoint;
        payload.apiFormat = form.apiFormat;
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
      }

      const r = await fetch(`/api/admin/ai-providers/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ai-providers/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      setConfirmDeleteId(null);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao deletar');
    } finally {
      setBusy(false);
    }
  }

  async function quickToggle(row: ProviderRow) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ai-providers/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao alternar');
    } finally {
      setBusy(false);
    }
  }

  async function reorder(row: ProviderRow, direction: 'up' | 'down') {
    if (busy) return;
    const sorted = [...providers].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex(p => p.id === row.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const swap = sorted[swapIdx];
    setBusy(true);
    try {
      // Troca prioridades em duas requisições
      await Promise.all([
        fetch(`/api/admin/ai-providers/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: swap.priority }),
        }),
        fetch(`/api/admin/ai-providers/${swap.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: row.priority }),
        }),
      ]);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao reordenar');
    } finally {
      setBusy(false);
    }
  }

  function toggleBestFor(key: string) {
    setForm(f => {
      const set = new Set(f.bestFor);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...f, bestFor: Array.from(set) };
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm tm-text-muted py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando provedores...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 rounded border border-red-500/30 bg-red-500/10 text-sm text-red-300">
        Erro: {error}
      </div>
    );
  }

  const sorted = [...providers].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs tm-text-muted">
          Built-in (Abacus, OpenAI, Gemini) sempre presentes — apenas custom podem ser removidos.
        </p>
        <button
          onClick={() => {
            setForm(emptyForm());
            setPreset('custom');
            setShowCreateModal(true);
          }}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          disabled={busy}
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar provedor
        </button>
      </div>

      <div className="space-y-2">
        {sorted.map((row, idx) => {
          const isEditing = editingId === row.id;
          return (
            <div
              key={row.id}
              className={`rounded-lg border ${
                row.enabled ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/[0.02]'
              } p-3`}
            >
              {!isEditing ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => reorder(row, 'up')}
                        disabled={idx === 0 || busy}
                        className="p-0.5 rounded hover:bg-white/10 disabled:opacity-30"
                        title="Subir prioridade"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => reorder(row, 'down')}
                        disabled={idx === sorted.length - 1 || busy}
                        className="p-0.5 rounded hover:bg-white/10 disabled:opacity-30"
                        title="Descer prioridade"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <Server className="w-4 h-4 text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium tm-text">{row.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          P{row.priority}
                        </span>
                        {row.isBuiltin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                            BUILT-IN
                          </span>
                        )}
                        {row.isCustom && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            CUSTOM
                          </span>
                        )}
                        {!row.hasKey && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 inline-flex items-center gap-1"
                            title="API key ausente—provedor é ignorado em runtime"
                          >
                            <AlertTriangle className="w-3 h-3" /> Sem chave
                          </span>
                        )}
                      </div>
                      <div className="text-xs tm-text-muted truncate">
                        {row.model} · peso {row.weight} · {row.bestFor.join(', ')}
                      </div>
                      {row.hasKey && row.keyPreview && (
                        <div className="text-[10px] tm-text-muted inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          {row.keyPreview}
                          {row.apiKeyEnv && <span>({row.apiKeyEnv})</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => quickToggle(row)}
                      disabled={busy}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        row.enabled
                          ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                          : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                      } disabled:opacity-50`}
                      title={row.enabled ? 'Desativar' : 'Ativar'}
                    >
                      {row.enabled ? <CheckCircle className="w-3.5 h-3.5" /> : 'Off'}
                    </button>
                    <button
                      onClick={() => openEdit(row)}
                      disabled={busy}
                      className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {row.isCustom && (
                      <button
                        onClick={() => setConfirmDeleteId(row.id)}
                        disabled={busy}
                        className="p-1.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <EditForm
                  form={form}
                  setForm={setForm}
                  isBuiltin={row.isBuiltin}
                  toggleBestFor={toggleBestFor}
                  onCancel={() => {
                    setEditingId(null);
                    setForm(emptyForm());
                  }}
                  onSave={handleEdit}
                  busy={busy}
                  rowKeyPreview={row.keyPreview}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Criar */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !busy && setShowCreateModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-white/10 rounded-xl p-5 max-w-lg w-full max-h-[90vh] overflow-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold tm-text">Adicionar Provedor</h3>
              <button onClick={() => !busy && setShowCreateModal(false)} className="p-1 hover:bg-white/10 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Preset selector */}
            <div className="mb-3">
              <label className="text-xs tm-text-secondary mb-1 block">Preset</label>
              <select
                value={preset}
                onChange={(e) => applyPreset(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text"
              >
                <option value="custom">Custom (preencher manualmente)</option>
                <option value="claude">Anthropic Claude (claude-3-5-sonnet)</option>
                <option value="deepseek">DeepSeek (deepseek-chat)</option>
                <option value="groq">Groq (Llama 3.3 70B)</option>
                <option value="mistral">Mistral (mistral-large-latest)</option>
              </select>
              {preset === 'claude' && (
                <p className="text-[10px] text-yellow-300 mt-1">
                  ⚠ Claude usa formato Anthropic (não-padrão OpenAI). Suporte experimental — pode requerer adapter.
                </p>
              )}
            </div>

            <FormFields
              form={form}
              setForm={setForm}
              isBuiltin={false}
              isCreate={true}
              toggleBestFor={toggleBestFor}
              rowKeyPreview=""
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => !busy && setShowCreateModal(false)}
                className="px-3 py-1.5 text-sm rounded border border-white/10 hover:bg-white/5"
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                disabled={busy}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !busy && setConfirmDeleteId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-red-500/30 rounded-xl p-5 max-w-md w-full"
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-semibold tm-text">Remover provedor?</h3>
            </div>
            <p className="text-sm tm-text-secondary mb-4">
              O provedor será desativado imediatamente e a chave criptografada será destruída. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => !busy && setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-sm rounded border border-white/10 hover:bg-white/5"
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                disabled={busy}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditForm({
  form,
  setForm,
  isBuiltin,
  toggleBestFor,
  onCancel,
  onSave,
  busy,
  rowKeyPreview,
}: {
  form: ProviderForm;
  setForm: React.Dispatch<React.SetStateAction<ProviderForm>>;
  isBuiltin: boolean;
  toggleBestFor: (key: string) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  rowKeyPreview: string;
}) {
  return (
    <div className="space-y-3">
      <FormFields
        form={form}
        setForm={setForm}
        isBuiltin={isBuiltin}
        isCreate={false}
        toggleBestFor={toggleBestFor}
        rowKeyPreview={rowKeyPreview}
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded border border-white/10 hover:bg-white/5"
          disabled={busy}
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50"
          disabled={busy}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </button>
      </div>
    </div>
  );
}

function FormFields({
  form,
  setForm,
  isBuiltin,
  isCreate,
  toggleBestFor,
  rowKeyPreview,
}: {
  form: ProviderForm;
  setForm: React.Dispatch<React.SetStateAction<ProviderForm>>;
  isBuiltin: boolean;
  isCreate: boolean;
  toggleBestFor: (key: string) => void;
  rowKeyPreview: string;
}) {
  return (
    <div className="space-y-3">
      {!isBuiltin && (
        <div>
          <label className="text-xs tm-text-secondary mb-1 block">Nome *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            disabled={!isCreate}
            placeholder="Ex.: Claude, DeepSeek, MeuAI"
            className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text disabled:opacity-60"
          />
        </div>
      )}
      {!isBuiltin && (
        <div>
          <label className="text-xs tm-text-secondary mb-1 block">Endpoint *</label>
          <input
            type="text"
            value={form.endpoint}
            onChange={(e) => setForm(f => ({ ...f, endpoint: e.target.value }))}
            placeholder="https://api.exemplo.com/v1/chat/completions"
            className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text"
          />
        </div>
      )}
      <div>
        <label className="text-xs tm-text-secondary mb-1 block">Modelo *</label>
        <input
          type="text"
          value={form.model}
          onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))}
          placeholder="gpt-4o-mini, claude-3-5-sonnet-20241022, ..."
          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text"
        />
      </div>
      {!isBuiltin && (
        <div>
          <label className="text-xs tm-text-secondary mb-1 block">
            API Key {isCreate ? '*' : '(deixe vazio p/ manter)'}
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))}
            placeholder={isCreate ? 'sk-... ou similar' : (rowKeyPreview || 'inalterada')}
            autoComplete="new-password"
            className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text font-mono"
          />
          <p className="text-[10px] tm-text-muted mt-1">
            Criptografada com AES-256-GCM. Nunca é retornada em texto plano.
          </p>
        </div>
      )}
      {isBuiltin && (
        <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
          Built-in: API key é lida da env var (não editável pela UI). Apenas modelo, prioridade, peso, ativo e bestFor podem ser ajustados.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs tm-text-secondary mb-1 block">Prioridade (1-99)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={form.priority}
            onChange={(e) => setForm(f => ({ ...f, priority: parseInt(e.target.value, 10) || 99 }))}
            className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text"
          />
        </div>
        <div>
          <label className="text-xs tm-text-secondary mb-1 block">Peso (1-100)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.weight}
            onChange={(e) => setForm(f => ({ ...f, weight: parseInt(e.target.value, 10) || 1 }))}
            className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text"
          />
        </div>
      </div>
      <div>
        <label className="text-xs tm-text-secondary mb-1 block">Bom para</label>
        <div className="flex gap-1.5 flex-wrap">
          {BEST_FOR_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggleBestFor(opt.key)}
              className={`px-2 py-1 text-xs rounded border ${
                form.bestFor.includes(opt.key)
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                  : 'bg-white/5 border-white/10 tm-text-muted hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {!isBuiltin && (
        <div>
          <label className="text-xs tm-text-secondary mb-1 block">Formato API</label>
          <select
            value={form.apiFormat}
            onChange={(e) => setForm(f => ({ ...f, apiFormat: e.target.value }))}
            className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-sm tm-text"
          >
            <option value="openai_compatible">OpenAI Compatible (default)</option>
            <option value="anthropic">Anthropic (Claude)</option>
          </select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          id="enabled-toggle"
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm(f => ({ ...f, enabled: e.target.checked }))}
          className="w-4 h-4"
        />
        <label htmlFor="enabled-toggle" className="text-sm tm-text">
          Ativo (incluir no balanceador)
        </label>
      </div>
    </div>
  );
}
