export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { emitEvent } from '@/lib/events';

// ============================================================
// MERGE TICKETS (mesclar chamados)
// ============================================================
// Une o chamado [id] (ORIGEM) ao chamado targetTicketId (DESTINO).
//
// Acoes em transacao:
//   1. Move todas as mensagens do origem para o destino.
//   2. Move todos os anexos do origem para o destino.
//   3. Cria TicketHistory tanto no origem quanto no destino.
//   4. Cria mensagem interna no destino registrando a mesclagem
//      (com numero do origem, autor, motivo).
//   5. Marca o origem com mergedIntoId, mergedAt, status='CLOSED',
//      closedAt=now.
//
// Restricoes:
//   - Apenas ADMIN ou SUPPORT podem mesclar.
//   - Origem e destino devem ser DIFERENTES.
//   - Origem nao pode estar ja mesclado.
//   - Destino nao pode estar mesclado nem CLOSED.
//   - Tickets devem ser da MESMA empresa (regra de seguranca).
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const { targetTicketId, reason } = await request.json();
    if (!targetTicketId) {
      return NextResponse.json({ error: 'targetTicketId obrigatorio' }, { status: 400 });
    }
    if (targetTicketId === params.id) {
      return NextResponse.json({ error: 'Origem e destino devem ser diferentes' }, { status: 400 });
    }

    const [source, target] = await Promise.all([
      prisma.ticket.findUnique({
        where: { id: params.id },
        select: { id: true, number: true, subject: true, companyId: true, status: true, mergedIntoId: true },
      }),
      prisma.ticket.findUnique({
        where: { id: targetTicketId },
        select: { id: true, number: true, subject: true, companyId: true, status: true, mergedIntoId: true },
      }),
    ]);

    if (!source) return NextResponse.json({ error: 'Chamado origem nao encontrado' }, { status: 404 });
    if (!target) return NextResponse.json({ error: 'Chamado destino nao encontrado' }, { status: 404 });

    if (source.mergedIntoId) {
      return NextResponse.json(
        { error: 'Chamado origem ja foi mesclado anteriormente' },
        { status: 400 },
      );
    }
    if (target.mergedIntoId) {
      return NextResponse.json(
        { error: 'Chamado destino ja foi mesclado em outro chamado' },
        { status: 400 },
      );
    }
    if (target.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'Chamado destino esta fechado. Reabra-o antes de mesclar.' },
        { status: 400 },
      );
    }
    if (source.companyId !== target.companyId) {
      return NextResponse.json(
        { error: 'Mesclagem permitida apenas entre chamados da mesma empresa' },
        { status: 400 },
      );
    }

    const reasonText = (reason && typeof reason === 'string') ? reason.trim() : '';
    const userName = session.user.name || 'Atendente';
    const userId = session.user.id;
    const userRole = session.user.role as any;

    await prisma.$transaction(async (tx) => {
      // 1. Move mensagens
      await tx.ticketMessage.updateMany({
        where: { ticketId: source.id },
        data: { ticketId: target.id },
      });

      // 2. Move anexos
      await tx.ticketAttachment.updateMany({
        where: { ticketId: source.id },
        data: { ticketId: target.id },
      });

      // 3. Historico no destino
      await tx.ticketHistory.create({
        data: {
          ticketId: target.id,
          userId,
          userName,
          userRole,
          action: 'MERGE_RECEIVED',
          fromValue: null,
          toValue: `#${source.number}`,
          note: `Chamado #${source.number} ("${source.subject}") foi mesclado neste chamado${reasonText ? ` - Motivo: ${reasonText}` : ''}`,
        },
      });

      // Historico no origem
      await tx.ticketHistory.create({
        data: {
          ticketId: source.id,
          userId,
          userName,
          userRole,
          action: 'MERGED_INTO',
          fromValue: source.status,
          toValue: `#${target.number}`,
          note: `Mesclado no chamado #${target.number} ("${target.subject}")${reasonText ? ` - Motivo: ${reasonText}` : ''}`,
        },
      });

      // 4. Mensagem interna no destino
      await tx.ticketMessage.create({
        data: {
          ticketId: target.id,
          authorId: userId,
          authorName: userName,
          authorRole: session.user.role as any,
          isInternal: true,
          content: `🔗 Chamado #${source.number} ("${source.subject}") foi mesclado neste atendimento por ${userName}.${reasonText ? `\n\nMotivo: ${reasonText}` : ''}`,
        },
      });

      // 5. Marca origem como mesclado e fechado
      await tx.ticket.update({
        where: { id: source.id },
        data: {
          mergedIntoId: target.id,
          mergedAt: new Date(),
          status: 'CLOSED',
          closedAt: new Date(),
        },
      });
    });

    emitEvent({
      type: 'ticket_merged',
      entityType: 'ticket',
      entityId: source.id,
      severity: 'info',
      actorId: userId,
      actorName: userName,
      metadata: {
        sourceNumber: source.number,
        targetNumber: target.number,
        targetId: target.id,
        reason: reasonText || null,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      sourceId: source.id,
      sourceNumber: source.number,
      targetId: target.id,
      targetNumber: target.number,
    });
  } catch (error: any) {
    console.error('Merge ticket error:', error);
    return NextResponse.json(
      { error: 'Erro ao mesclar chamado', detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}
