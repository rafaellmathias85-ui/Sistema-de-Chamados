'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Trash2, Plus, X } from 'lucide-react';
import ImageUploader from './image-uploader';

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type Metric = { label: string; value: string };

export default function CaseForm({ initialData }: { initialData?: any }) {
  const router = useRouter();
  const isEdit = !!initialData;
  const [form, setForm] = useState({
    slug: initialData?.slug || '',
    theme: initialData?.theme || '',
    title: initialData?.title || '',
    summary: initialData?.summary || '',
    content: initialData?.content || '',
    imageUrl: initialData?.imageUrl || '',
    isPublished: initialData?.isPublished ?? true,
    order: initialData?.order ?? 0,
  });
  const [metrics, setMetrics] = useState<Metric[]>(
    Array.isArray(initialData?.metrics) ? initialData.metrics : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const onTitle = (v: string) => {
    update('title', v);
    if (!isEdit && !form.slug) update('slug', slugify(v));
  };

  const addMetric = () => setMetrics([...metrics, { label: '', value: '' }]);
  const removeMetric = (i: number) => setMetrics(metrics.filter((_, idx) => idx !== i));
  const updateMetric = (i: number, k: 'label' | 'value', v: string) => {
    setMetrics(metrics.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));
  };

  async function save() {
    setSaving(true); setError('');
    const payload = { ...form, metrics: metrics.filter((m) => m.label && m.value) };
    const url = isEdit ? `/api/admin/cases/${initialData.id}` : '/api/admin/cases';
    const method = isEdit ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      setError(e.error || 'Erro ao salvar');
      return;
    }
    router.push('/adm/cases');
    router.refresh();
  }

  async function remove() {
    if (!confirm('Excluir este case?')) return;
    const r = await fetch(`/api/admin/cases/${initialData.id}`, { method: 'DELETE' });
    if (r.ok) { router.push('/adm/cases'); router.refresh(); }
  }

  const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tema/Segmento *</label>
            <input className={input} value={form.theme} onChange={(e) => update('theme', e.target.value)} placeholder="Ex: Indústria, Varejo" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ordem</label>
            <input type="number" className={input} value={form.order} onChange={(e) => update('order', parseInt(e.target.value) || 0)} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Título *</label>
          <input className={input} value={form.title} onChange={(e) => onTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Slug (URL) *</label>
          <input className={input} value={form.slug} onChange={(e) => update('slug', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Resumo *</label>
          <textarea className={input} rows={3} value={form.summary} onChange={(e) => update('summary', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Conteúdo completo (opcional)</label>
          <textarea className={input} rows={6} value={form.content} onChange={(e) => update('content', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Imagem de capa</label>
          <ImageUploader
            value={form.imageUrl}
            onChange={(v) => update('imageUrl', v)}
            recommended="Recomendado: 1200×675px (proporção 16:9), JPG ou WEBP, até 1MB. Use uma imagem que represente o segmento do cliente."
            accentColor="orange"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">Indicadores</label>
            <button onClick={addMetric} type="button" className="inline-flex items-center gap-1 text-sm text-orange-600 hover:underline">
              <Plus className="w-3 h-3" /> adicionar
            </button>
          </div>
          <div className="space-y-2">
            {metrics.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={input} placeholder="Rótulo (ex: Downtime)" value={m.label} onChange={(e) => updateMetric(i, 'label', e.target.value)} />
                <input className={input} placeholder="Valor (ex: 0min)" value={m.value} onChange={(e) => updateMetric(i, 'value', e.target.value)} />
                <button onClick={() => removeMetric(i)} type="button" className="p-2 text-red-500 hover:bg-red-50 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {metrics.length === 0 && <p className="text-sm text-slate-500">Nenhum indicador adicionado.</p>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isPublished} onChange={(e) => update('isPublished', e.target.checked)} />
          Publicado
        </label>
      </div>
      <div className="flex items-center gap-3 mt-6 pt-6 border-t border-slate-200">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {isEdit && (
          <button onClick={remove} className="inline-flex items-center gap-2 text-red-600 px-3 py-2 rounded-lg hover:bg-red-50">
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
        )}
      </div>
    </div>
  );
}
