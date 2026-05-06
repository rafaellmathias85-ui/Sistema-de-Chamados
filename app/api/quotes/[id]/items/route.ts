export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

function canManage(role: string) {
  return role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE';
}

async function recalc(quoteId: string) {
  const items = await prisma.quoteItem.findMany({ where: { quoteId } });
  const subtotal = items.reduce((a, i) => a + i.total, 0);
  const cur = await prisma.quote.findUnique({ where: { id: quoteId }, select: { discount: true } });
  const total = Math.max(0, subtotal - (cur?.discount || 0));
  await prisma.quote.update({ where: { id: quoteId }, data: { subtotal, total } });
}

// POST -> adiciona item
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await request.json();
  const description = String(body.description || '').slice(0, 500);
  const quantity = Number(body.quantity) || 0;
  const unitPrice = Number(body.unitPrice) || 0;
  if (!description) return NextResponse.json({ error: 'Descricao obrigatoria' }, { status: 400 });

  const count = await prisma.quoteItem.count({ where: { quoteId: params.id } });
  const item = await prisma.quoteItem.create({
    data: {
      quoteId: params.id,
      description,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      order: count,
    },
  });
  await recalc(params.id);
  return NextResponse.json(item, { status: 201 });
}
