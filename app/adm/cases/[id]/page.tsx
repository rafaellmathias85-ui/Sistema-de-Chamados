import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import CaseForm from '@/components/adm/case-form';

export const dynamic = 'force-dynamic';

export default async function EditCase({ params }: { params: { id: string } }) {
  const cs = await prisma.caseStudy.findUnique({ where: { id: params.id } });
  if (!cs) notFound();
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Editar case</h1>
      <CaseForm initialData={cs} />
    </div>
  );
}
