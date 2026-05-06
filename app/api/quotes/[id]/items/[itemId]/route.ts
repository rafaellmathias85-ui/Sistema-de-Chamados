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

export async function PATCH(request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await request.json();
  const allowed: any = {};
  if (body.description !== undefined) allowed.description = String(body.description).slice(0, 500);
  if (body.quantity !== undefined) allowed.quantity = Number(body.quantity) || 0;
  if (body.unitPrice !== undefined) allowed.unitPrice = Number(body.unitPrice) || 0;
  if (allowed.quantity !== undefined || allowed.unitPrice !== undefined) {
    const cur = await prisma.quoteItem.findUnique({ where: { id: params.itemId } });
    const q = allowed.quantity ?? cur?.quantity ?? 0;
    const p = allowed.unitPrice ?? cur?.unitPrice ?? 0;
    allowed.total = q * p;
  }
  await prisma.quoteItem.update({ where: { id: params.itemId }, data: allowed });
  await recalc(params.id);
  const fresh = await prisma.quoteItem.findUnique({ where: { id: params.itemId } });
  return NextResponse.json(fresh);
}

export async function DELETE(_r: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  await prisma.quoteItem.delete({ where: { id: params.itemId } });
  await recalc(params.id);
  return NextResponse.json({ ok: true });
}
