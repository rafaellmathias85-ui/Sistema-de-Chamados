import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Plus, Edit2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdmCasesList() {
  const cases = await prisma.caseStudy.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'desc' }] });
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cases de Sucesso</h1>
        <Link href="/adm/cases/novo" className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600">
          <Plus className="w-4 h-4" /> Novo case
        </Link>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase">
            <tr>
              <th className="px-4 py-3">Tema</th>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ordem</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {cases.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-600">{c.theme}</td>
                <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.title}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${c.isPublished ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {c.isPublished ? 'Publicado' : 'Rascunho'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{c.order}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/adm/cases/${c.id}`} className="inline-flex items-center gap-1 text-orange-600 hover:underline text-sm">
                    <Edit2 className="w-3 h-3" /> Editar
                  </Link>
                </td>
              </tr>
            ))}
            {cases.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nenhum case.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
