export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

function canManage(role: string) {
  return role === 'ADMIN' || role === 'SUPPORT' || role === 'FINANCE';
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const companyId = searchParams.get('companyId');
  const search = searchParams.get('search');

  const where: any = {};
  if (session.user.role === 'CLIENT') {
    where.companyId = session.user.companyId;
    where.status = { in: ['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'] };
  }
  if (status) where.status = status;
  if (companyId) where.companyId = companyId;
  if (search) {
    const ors: any[] = [{ title: { contains: search, mode: 'insensitive' } }];
    const num = parseInt(search, 10);
    if (!isNaN(num)) ors.push({ number: num });
    where.OR = ors;
  }

  const quotes = await prisma.quote.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true } },
      ticket: { select: { id: true, number: true, subject: true } },
      _count: { select: { items: true } },
    },
    take: 200,
  });
  return NextResponse.json(quotes);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await request.json();
  const { title, description, companyId, ticketId, validUntil, notes, items } = body as any;
  if (!title || typeof title !== 'string') return NextResponse.json({ error: 'Titulo obrigatorio' }, { status: 400 });

  // Ticket é obrigatório
  if (!ticketId) return NextResponse.json({ error: 'Ticket obrigatório. Selecione um chamado para vincular ao orçamento.' }, { status: 400 });
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, number: true, companyId: true } });
  if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });

  // Auto-preencher companyId do ticket se não informado
  const resolvedCompanyId = companyId || ticket.companyId || null;

  // Itens iniciais (opcional)
  const itemsArr = Array.isArray(items) ? items : [];
  let subtotal = 0;
  const itemsData = itemsArr.map((it: any, idx: number) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const tot = qty * price;
    subtotal += tot;
    return {
      description: String(it.description || '').slice(0, 500),
      quantity: qty,
      unitPrice: price,
      total: tot,
      order: idx,
    };
  });

  const quote = await prisma.quote.create({
    data: {
      title: title.slice(0, 200),
      description: description || null,
      companyId: resolvedCompanyId,
      ticketId: ticketId,
      validUntil: validUntil ? new Date(validUntil) : null,
      notes: notes || null,
      subtotal,
      total: subtotal,
      createdBy: session.user.id,
      createdByName: session.user.name || 'Atendente',
      items: { create: itemsData },
    },
    include: { items: true },
  });
  return NextResponse.json(quote, { status: 201 });
}
