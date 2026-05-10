import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Plus, Edit2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdmBlogList() {
  const posts = await prisma.blogPost.findMany({ orderBy: { publishedAt: 'desc' } });
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Posts do Blog</h1>
        <Link href="/adm/blog/novo" className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Novo post
        </Link>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase">
            <tr>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Publicado em</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {posts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{p.title}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{p.category}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${p.isPublished ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {p.isPublished ? 'Publicado' : 'Rascunho'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{new Date(p.publishedAt).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/adm/blog/${p.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                    <Edit2 className="w-3 h-3" /> Editar
                  </Link>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum post.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
