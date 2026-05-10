'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Trash2 } from 'lucide-react';

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function BlogForm({ initialData }: { initialData?: any }) {
  const router = useRouter();
  const isEdit = !!initialData;
  const [form, setForm] = useState({
    slug: initialData?.slug || '',
    title: initialData?.title || '',
    excerpt: initialData?.excerpt || '',
    content: initialData?.content || '',
    imageUrl: initialData?.imageUrl || '',
    link: initialData?.link || '',
    category: initialData?.category || 'Tecnologia',
    author: initialData?.author || 'Equipe Winner',
    isPublished: initialData?.isPublished ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const onTitle = (v: string) => {
    update('title', v);
    if (!isEdit && !form.slug) update('slug', slugify(v));
  };

  async function save() {
    setSaving(true); setError('');
    const url = isEdit ? `/api/admin/blog/${initialData.id}` : '/api/admin/blog';
    const method = isEdit ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      setError(e.error || 'Erro ao salvar');
      return;
    }
    router.push('/adm/blog');
    router.refresh();
  }

  async function remove() {
    if (!confirm('Excluir este post?')) return;
    const r = await fetch(`/api/admin/blog/${initialData.id}`, { method: 'DELETE' });
    if (r.ok) { router.push('/adm/blog'); router.refresh(); }
  }

  const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Título *</label>
          <input className={input} value={form.title} onChange={(e) => onTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Slug (URL) *</label>
          <input className={input} value={form.slug} onChange={(e) => update('slug', e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">URL final: /blog/{form.slug || 'meu-post'}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Resumo *</label>
          <textarea className={input} rows={2} value={form.excerpt} onChange={(e) => update('excerpt', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Conteúdo *</label>
          <textarea className={input} rows={10} value={form.content} onChange={(e) => update('content', e.target.value)} placeholder="Use linhas em branco para separar parágrafos." />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">URL da imagem</label>
          <input className={input} value={form.imageUrl} onChange={(e) => update('imageUrl', e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Link externo (opcional)</label>
          <input className={input} value={form.link} onChange={(e) => update('link', e.target.value)} placeholder="https://... (deixe em branco para usar o conteúdo interno)" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
            <input className={input} value={form.category} onChange={(e) => update('category', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Autor</label>
            <input className={input} value={form.author} onChange={(e) => update('author', e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isPublished} onChange={(e) => update('isPublished', e.target.checked)} />
          Publicado
        </label>
      </div>
      <div className="flex items-center gap-3 mt-6 pt-6 border-t border-slate-200">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
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
