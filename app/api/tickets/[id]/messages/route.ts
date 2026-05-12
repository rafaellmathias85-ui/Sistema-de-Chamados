import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { notifyNewMessage } from '@/lib/notifications';
import { emitEvent } from '@/lib/events';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';


export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { content, isInternal } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json(
        { error: 'Conteúdo é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se o ticket existe e o usuário tem acesso
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, email: true, name: true } },
        assignee: { select: { id: true, email: true, name: true } },
      }
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Chamado não encontrado' },
        { status: 404 }
      );
    }

    if (
      session.user.role === 'CLIENT' &&
      ticket.companyId !== session.user.companyId
    ) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Clientes não podem criar notas internas
    const finalIsInternal =
      session.user.role === 'CLIENT' ? false : isInternal || false;

    const message = await prisma.ticketMessage.create({
      data: {
        content,
        isInternal: finalIsInternal,
        ticketId: params.id,
        authorId: session.user.id,
        authorName: session.user.name || 'Usuário',
        authorRole: session.user.role as any,
      },
    });

    // Ativar alerta para o responsável se o autor não for o próprio responsável
    if (ticket.assigneeId && ticket.assigneeId !== session.user.id) {
      await prisma.ticket.update({
        where: { id: params.id },
        data: { alertAssignee: true },
      });
    }

    // Se SUPPORT/ADMIN respondeu (mensagem nao interna) e o ticket esta marcado
    // como reaberto, limpa a flag - significa que ja foi atendido pos-reabertura.
    if (
      !finalIsInternal &&
      session.user.role !== 'CLIENT' &&
      ticket.reopenedFlag
    ) {
      await prisma.ticket.update({
        where: { id: params.id },
        data: { reopenedFlag: false },
      });
    }

    // ========================================================
    // REABERTURA AUTOMATICA: cliente respondeu chamado fechado
    // ========================================================
    // Se o autor eh cliente (CLIENT) E ticket esta RESOLVED/CLOSED,
    // reabrir o chamado (status -> OPEN), incrementar reopenCount,
    // marcar reopenedAt e adicionar registro no historico para
    // exibir banner amarelo na UI.
    let reopened = false;
    if (
      !finalIsInternal &&
      session.user.role === 'CLIENT' &&
      (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')
    ) {
      await prisma.ticket.update({
        where: { id: params.id },
        data: {
          status: 'OPEN',
          reopenedFlag: true,
          reopenedAt: new Date(),
          reopenCount: { increment: 1 },
          alertAssignee: true, // alerta o responsavel
        },
      });
      try {
        await prisma.ticketHistory.create({
          data: {
            ticketId: params.id,
            userId: session.user.id,
            userName: session.user.name || 'Cliente',
            userRole: session.user.role as any,
            action: 'REOPENED',
            fromValue: ticket.status,
            toValue: 'OPEN',
            note: `Chamado reaberto automaticamente apos resposta do cliente`,
          },
        });
      } catch (e) {
        console.error('Erro ao registrar historico de reabertura:', e);
      }
      reopened = true;
      emitEvent({
        type: 'ticket_reopened',
        entityType: 'ticket',
        entityId: params.id,
        severity: 'warning',
        actorId: session.user.id,
        actorName: session.user.name || 'Cliente',
        metadata: {
          ticketNumber: ticket.number,
          previousStatus: ticket.status,
        },
      }).catch(() => {});
    }

    // Enviar notificação por email (se não for nota interna)
    if (!finalIsInternal) {
      const ticketUrl = `${process.env.NEXTAUTH_URL}/tickets/${ticket.id}`;
      const isFromClient = session.user.role === 'CLIENT';
      
      try {
        await notifyNewMessage({
          ticketNumber: ticket.number,
          subject: ticket.subject,
          message: content,
          authorName: session.user.name || 'Usuário',
          ticketUrl,
          recipientEmail: ticket.creator.email || '',
          recipientName: ticket.creator.name || undefined, // Nome do cliente para saudação
          isFromClient,
        });
      } catch (emailError) {
        console.error('Erro ao enviar notificação:', emailError);
      }
    }

    // Emit telemetry event
    emitEvent({
      type: finalIsInternal ? 'internal_note' : 'client_reply',
      entityType: 'ticket',
      entityId: params.id,
      severity: 'info',
      actorId: session.user.id,
      actorName: session.user.name || 'Usuário',
      metadata: { ticketNumber: ticket.number, isInternal: finalIsInternal },
    }).catch(() => {});

    return NextResponse.json({ ...message, reopened }, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Erro ao enviar mensagem' },
      { status: 500 }
    );
  }
}
