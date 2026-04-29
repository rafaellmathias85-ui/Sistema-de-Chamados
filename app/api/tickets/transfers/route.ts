import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Listar transferências pendentes para o usuário logado
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || 'pending'; // pending | all | ticket
    const ticketId = searchParams.get('ticketId');

    const where: any = {};

    if (scope === 'pending') {
      // Transferências pendentes onde eu sou o novo responsável (para confirmar/recusar)
      where.requestedNewResponsibleUserId = session.user.id;
      where.status = 'pending';
    } else if (scope === 'ticket' && ticketId) {
      where.ticketId = ticketId;
    } else {
      // Todas onde eu estou envolvido
      where.OR = [
        { requestedByUserId: session.user.id },
        { currentResponsibleUserId: session.user.id },
        { requestedNewResponsibleUserId: session.user.id },
      ];
    }

    const transfers = await prisma.ticketTransferRequest.findMany({
      where,
      include: {
        ticket: { select: { id: true, number: true, subject: true } },
        currentResponsible: { select: { id: true, name: true } },
        requestedNewResponsible: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        processedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(transfers);
  } catch (error) {
    console.error('[Transfers] GET error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// POST - Solicitar transferência
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { ticketId, newResponsibleUserId, comment, forceTransfer } = await request.json();

    if (!ticketId || !newResponsibleUserId) {
      return NextResponse.json({ error: 'ticketId e newResponsibleUserId são obrigatórios' }, { status: 400 });
    }

    // Verificar ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, number: true, subject: true, assigneeId: true, assignee: { select: { name: true } } },
    });
    if (!ticket) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
    if (!ticket.assigneeId) return NextResponse.json({ error: 'Ticket sem responsável atual' }, { status: 400 });
    if (ticket.assigneeId === newResponsibleUserId) {
      return NextResponse.json({ error: 'O novo responsável é o mesmo que o atual' }, { status: 400 });
    }

    // Verificar se já existe transferência pendente
    const existingPending = await prisma.ticketTransferRequest.findFirst({
      where: { ticketId, status: 'pending' },
    });
    if (existingPending) {
      return NextResponse.json({ error: 'Já existe uma transferência pendente para este chamado' }, { status: 409 });
    }

    const isAdmin = session.user.role === 'ADMIN';
    const isForced = isAdmin && forceTransfer === true;

    if (isForced) {
      // Transferência forçada por admin - efetiva imediatamente
      const transfer = await prisma.ticketTransferRequest.create({
        data: {
          ticketId,
          currentResponsibleUserId: ticket.assigneeId!,
          requestedNewResponsibleUserId: newResponsibleUserId,
          requestedByUserId: session.user.id,
          comment,
          status: 'forced',
          forceTransfer: true,
          processedByUserId: session.user.id,
          confirmedAt: new Date(),
        },
      });

      // Atualizar o ticket
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          assigneeId: newResponsibleUserId,
          alertAssignee: true,
        },
      });

      // Registrar no histórico
      await prisma.ticketHistory.create({
        data: {
          ticketId,
          action: 'Transferência forçada pelo administrador',
          note: `De ${ticket.assignee?.name || 'N/A'} para novo responsável. ${comment ? 'Motivo: ' + comment : ''}`,
          userId: session.user.id,
          userName: session.user.name || '',
          userRole: session.user.role as any,
        },
      });

      return NextResponse.json(transfer);
    }

    // Transferência normal - requer confirmação
    const transfer = await prisma.ticketTransferRequest.create({
      data: {
        ticketId,
        currentResponsibleUserId: ticket.assigneeId!,
        requestedNewResponsibleUserId: newResponsibleUserId,
        requestedByUserId: session.user.id,
        comment,
        status: 'pending',
      },
    });

    // Registrar no histórico
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        action: 'Transferência solicitada',
        note: `Aguardando confirmação do novo responsável. ${comment ? 'Motivo: ' + comment : ''}`,
        userId: session.user.id,
        userName: session.user.name || '',
        userRole: session.user.role as any,
      },
    });

    return NextResponse.json(transfer);
  } catch (error) {
    console.error('[Transfers] POST error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// PATCH - Confirmar ou recusar transferência
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { transferId, action } = await request.json(); // action: 'confirm' | 'reject'
    if (!transferId || !['confirm', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'transferId e action (confirm/reject) obrigatórios' }, { status: 400 });
    }

    const transfer = await prisma.ticketTransferRequest.findUnique({
      where: { id: transferId },
      include: {
        ticket: { select: { id: true, number: true, subject: true } },
        currentResponsible: { select: { name: true } },
        requestedNewResponsible: { select: { id: true, name: true } },
        requestedBy: { select: { name: true } },
      },
    });

    if (!transfer) return NextResponse.json({ error: 'Transferência não encontrada' }, { status: 404 });
    if (transfer.status !== 'pending') {
      return NextResponse.json({ error: 'Transferência já foi processada' }, { status: 400 });
    }

    // Apenas o novo responsável designado pode confirmar/recusar
    if (transfer.requestedNewResponsibleUserId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas o técnico designado pode processar esta transferência' }, { status: 403 });
    }

    if (action === 'confirm') {
      await prisma.ticketTransferRequest.update({
        where: { id: transferId },
        data: {
          status: 'confirmed',
          processedByUserId: session.user.id,
          confirmedAt: new Date(),
        },
      });

      // Efetivar a transferência
      await prisma.ticket.update({
        where: { id: transfer.ticketId },
        data: {
          assigneeId: transfer.requestedNewResponsibleUserId,
          alertAssignee: false,
        },
      });

      // Histórico
      await prisma.ticketHistory.create({
        data: {
          ticketId: transfer.ticketId,
          action: 'Transferência confirmada',
          note: `${transfer.requestedNewResponsible.name} aceitou a transferência do chamado.`,
          userId: session.user.id,
          userName: session.user.name || '',
          userRole: session.user.role as any,
        },
      });
    } else {
      await prisma.ticketTransferRequest.update({
        where: { id: transferId },
        data: {
          status: 'rejected',
          processedByUserId: session.user.id,
          rejectedAt: new Date(),
        },
      });

      // Histórico
      await prisma.ticketHistory.create({
        data: {
          ticketId: transfer.ticketId,
          action: 'Transferência recusada',
          note: `${session.user.name} recusou a transferência do chamado.`,
          userId: session.user.id,
          userName: session.user.name || '',
          userRole: session.user.role as any,
        },
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error('[Transfers] PATCH error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}