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
    if (!['SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVISION'].includes(quote.status)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }
  return NextResponse.json(quote);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const body = await request.json();
  const role = session.user.role;
  const isClient = role === 'CLIENT';
  const isStaff = canManage(role);

  // Carregar quote atual para validações
  const currentQuote = await prisma.quote.findUnique({ where: { id: params.id }, select: { id: true, status: true, companyId: true, createdBy: true, ticketId: true } });
  if (!currentQuote) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });

  // ── CLIENT: apenas pode aprovar, rejeitar ou solicitar revisão ──
  if (isClient) {
    if (currentQuote.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    const clientAction = body.clientAction as string | undefined;
    if (!clientAction || !['APPROVE', 'REJECT', 'REVISION'].includes(clientAction)) {
      return NextResponse.json({ error: 'Ação inválida para cliente' }, { status: 400 });
    }
    // Só pode agir em orçamentos SENT
    if (currentQuote.status !== 'SENT') {
      return NextResponse.json({ error: 'Este orçamento não está pendente de aprovação' }, { status: 400 });
    }

    const updateData: any = {};
    const userName = session.user.name || 'Cliente';

    if (clientAction === 'APPROVE') {
      updateData.status = 'APPROVED';
      updateData.approvedAt = new Date();
      updateData.approvedByName = userName;
      if (body.justification) updateData.actionJustification = body.justification;
    } else if (clientAction === 'REJECT') {
      if (!body.justification) return NextResponse.json({ error: 'Justificativa obrigatória para rejeição' }, { status: 400 });
      updateData.status = 'REJECTED';
      updateData.rejectedAt = new Date();
      updateData.rejectedByName = userName;
      updateData.rejectionReason = body.justification;
      updateData.actionJustification = body.justification;
    } else if (clientAction === 'REVISION') {
      if (!body.justification) return NextResponse.json({ error: 'Justificativa obrigatória para solicitar revisão' }, { status: 400 });
      updateData.status = 'REVISION';
      updateData.revisionReason = body.justification;
      updateData.revisionRequestedAt = new Date();
      updateData.revisionRequestedBy = userName;

      // Ativar alerta no ticket vinculado para o responsável ver a revisão
      if (currentQuote.ticketId) {
        try {
          await prisma.ticket.update({
            where: { id: currentQuote.ticketId },
            data: { alertAssignee: true },
          });
        } catch (e) {
          console.error('[QuoteRevision] Erro ao ativar alerta no ticket:', e);
        }
      }
    }

    await prisma.quote.update({ where: { id: params.id }, data: updateData });
    const fresh = await prisma.quote.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { order: 'asc' } }, company: { select: { id: true, name: true } }, ticket: { select: { id: true, number: true, subject: true } } },
    });
    return NextResponse.json(fresh);
  }

  // ── STAFF (ADMIN/SUPPORT/FINANCE): manter lógica existente + justificativa ──
  if (!isStaff) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const allowed: any = {};
  ['title', 'description', 'notes', 'rejectionReason'].forEach((k) => { if (body[k] !== undefined) allowed[k] = body[k]; });
  if (body.companyId !== undefined) allowed.companyId = body.companyId || null;
  if (body.ticketId !== undefined) allowed.ticketId = body.ticketId || null;
  if (body.validUntil !== undefined) allowed.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  if (body.discount !== undefined) allowed.discount = Number(body.discount) || 0;
  if (body.sentToEmails !== undefined) allowed.sentToEmails = body.sentToEmails;
  if (body.status !== undefined) {
    const valid = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'REVISION'];
    if (!valid.includes(body.status)) return NextResponse.json({ error: 'Status invalido' }, { status: 400 });
    allowed.status = body.status;
    const userName = session.user.name || 'Staff';
    if (body.status === 'SENT') allowed.sentAt = new Date();
    if (body.status === 'APPROVED') {
      allowed.approvedAt = new Date();
      allowed.approvedByName = userName;
      if (body.justification) allowed.actionJustification = body.justification;
    }
    if (body.status === 'REJECTED') {
      allowed.rejectedAt = new Date();
      allowed.rejectedByName = userName;
      if (body.justification) {
        allowed.rejectionReason = body.justification;
        allowed.actionJustification = body.justification;
      }
    }
    // Quando status volta para DRAFT (após revisão), limpa campos de revisão
    if (body.status === 'DRAFT' && currentQuote.status === 'REVISION') {
      allowed.revisionReason = null;
      allowed.revisionRequestedAt = null;
      allowed.revisionRequestedBy = null;
    }
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
