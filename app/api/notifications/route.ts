export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // For staff: count tickets where they're assigned and have alertAssignee=true
    if (['ADMIN', 'SUPPORT', 'FINANCE', 'SPECIAL'].includes(session.user.role)) {
      const isAdminOrSupport = ['ADMIN', 'SUPPORT'].includes(session.user.role);
      // Tickets nao atribuidos com atividade recente do cliente (ultimas 72h) — apenas para ADMIN/SUPPORT
      const sevenDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const [ticketAlertCount, tickets, pendingTransfers, unassignedTickets, reopenedTickets] = await Promise.all([
        prisma.ticket.count({
          where: {
            assigneeId: session.user.id,
            alertAssignee: true,
          },
        }),
        prisma.ticket.findMany({
          where: {
            assigneeId: session.user.id,
            alertAssignee: true,
          },
          select: {
            id: true,
            number: true,
            subject: true,
            priority: true,
            updatedAt: true,
            company: { select: { name: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
        // Transferências pendentes para este usuário
        prisma.ticketTransferRequest.findMany({
          where: {
            requestedNewResponsibleUserId: session.user.id,
            status: 'pending',
          },
          include: {
            ticket: { select: { id: true, number: true, subject: true } },
            currentResponsible: { select: { name: true } },
            requestedBy: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        // Tickets sem responsavel com atividade recente — visivel apenas para ADMIN/SUPPORT
        isAdminOrSupport
          ? prisma.ticket.findMany({
              where: {
                assigneeId: null,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                updatedAt: { gte: sevenDaysAgo },
              },
              select: {
                id: true,
                number: true,
                subject: true,
                priority: true,
                updatedAt: true,
                company: { select: { name: true } },
              },
              orderBy: { updatedAt: 'desc' },
              take: 10,
            })
          : Promise.resolve([]),
        // Tickets reabertos com flag reopenedFlag=true
        isAdminOrSupport
          ? prisma.ticket.findMany({
              where: {
                reopenedFlag: true,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
              },
              select: {
                id: true,
                number: true,
                subject: true,
                priority: true,
                reopenedAt: true,
                assignee: { select: { name: true } },
                company: { select: { name: true } },
              },
              orderBy: { reopenedAt: 'desc' },
              take: 10,
            })
          : Promise.resolve([]),
      ]);

      // Alertas RMM pendentes (não reconhecidos)
      const rmmAlerts = await prisma.rmmAlert.findMany({
        where: { acknowledged: false },
        include: {
          machine: { select: { hostname: true, company: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const rmmAlertCount = await prisma.rmmAlert.count({ where: { acknowledged: false } });

      const totalCount =
        ticketAlertCount +
        pendingTransfers.length +
        rmmAlertCount +
        unassignedTickets.length +
        reopenedTickets.length;

      return NextResponse.json({
        count: totalCount,
        tickets,
        pendingTransfers,
        rmmAlerts,
        rmmAlertCount,
        unassignedTickets,
        reopenedTickets,
      });
    }

    return NextResponse.json({ count: 0, tickets: [], pendingTransfers: [] });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
