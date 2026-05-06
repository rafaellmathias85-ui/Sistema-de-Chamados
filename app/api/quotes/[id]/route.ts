export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

function canManage(role: string) {
  return role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE';
}

async function recalcTotals(quoteId: string, opts?: { discount?: number }) {
  const items = await prisma.quoteItem.findMany({ where: { quoteId } });
  const subtotal = items.reduce((acc, i) => acc + i.total, 0);
  let discount: number | undefined = opts?.discount;
  if (discount === undefined) {
    const cur = await prisma.quote.findUnique({ where: { id: quoteId }, select: { discount: true } });
    discount = cur?.discount || 0;
  }
  const total = Math.max(0, subtotal - (discount || 0));
  await prisma.quote.update({ where: { id: quoteId }, data: { subtotal, discount, total } });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { id: true, name: true } },
      ticket: { select: { id: true, number: true, subject: true } },
      items: { orderBy: { order: 'asc' } },
    },
  });
  if (!quote) return NextResponse.json({ error: 'Orcamento nao encontrado' }, { status: 404 });
  if (session.user.role === 'CLIENT') {
    if (quote.companyId !== session.user.companyId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (!['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }
  return NextResponse.json(quote);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await request.json();
  const allowed: any = {};
  ['title', 'description', 'notes', 'rejectionReason'].forEach((k) => { if (body[k] !== undefined) allowed[k] = body[k]; });
  if (body.companyId !== undefined) allowed.companyId = body.companyId || null;
  if (body.ticketId !== undefined) allowed.ticketId = body.ticketId || null;
  if (body.validUntil !== undefined) allowed.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  if (body.discount !== undefined) allowed.discount = Number(body.discount) || 0;
  if (body.status !== undefined) {
    const valid = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
    if (!valid.includes(body.status)) return NextResponse.json({ error: 'Status invalido' }, { status: 400 });
    allowed.status = body.status;
    if (body.status === 'SENT') allowed.sentAt = new Date();
    if (body.status === 'APPROVED') allowed.approvedAt = new Date();
    if (body.status === 'REJECTED') allowed.rejectedAt = new Date();
  }

  await prisma.quote.update({ where: { id: params.id }, data: allowed });
  if (allowed.discount !== undefined) await recalcTotals(params.id, { discount: allowed.discount });
  const fresh = await prisma.quote.findUnique({
    where: { id: params.id },
    include: { items: { orderBy: { order: 'asc' } }, company: { select: { id: true, name: true } }, ticket: { select: { id: true, number: true, subject: true } } },
  });
  return NextResponse.json(fresh);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Apenas ADMIN' }, { status: 403 });
  await prisma.quote.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
