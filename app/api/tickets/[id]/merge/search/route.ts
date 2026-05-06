import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const role = session.user.role;
  if (role !== 'ADMIN' && role !== 'SUPPORT') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const source = await prisma.ticket.findUnique({
    where: { id: params.id },
    select: { id: true, companyId: true },
  });
  if (!source) return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  const where: any = {
    companyId: source.companyId,
    id: { not: source.id },
    mergedIntoId: null,
    status: { not: 'CLOSED' },
  };

  if (q) {
    const num = parseInt(q, 10);
    const ors: any[] = [
      { subject: { contains: q, mode: 'insensitive' } },
    ];
    if (!isNaN(num)) ors.push({ number: num });
    where.OR = ors;
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true },
  });

  return NextResponse.json({ tickets });
}
