import Link from 'next/link';
import { prisma } from '@/lib/db';
import { FileText, Briefcase, Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdmDashboard() {
  const [postCount, caseCount] = await Promise.all([
    prisma.blogPost.count(),
    prisma.caseStudy.count(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Painel Administrativo</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <Link href="/adm/blog" className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition">
          <div className="flex items-center justify-between mb-3">
            <FileText className="w-8 h-8 text-blue-600" />
            <span className="text-3xl font-bold text-slate-900">{postCount}</span>
          </div>
          <h2 className="font-semibold text-slate-900">Posts do Blog</h2>
          <p className="text-sm text-slate-500 mt-1">Gerenciar artigos publicados</p>
        </Link>
        <Link href="/adm/cases" className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition">
          <div className="flex items-center justify-between mb-3">
            <Briefcase className="w-8 h-8 text-orange-500" />
            <span className="text-3xl font-bold text-slate-900">{caseCount}</span>
          </div>
          <h2 className="font-semibold text-slate-900">Cases de Sucesso</h2>
          <p className="text-sm text-slate-500 mt-1">Gerenciar cases publicados</p>
        </Link>
      </div>
      <div className="mt-8 flex gap-3">
        <Link href="/adm/blog/novo" className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Novo post
        </Link>
        <Link href="/adm/cases/novo" className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600">
          <Plus className="w-4 h-4" /> Novo case
        </Link>
      </div>
    </div>
  );
}
