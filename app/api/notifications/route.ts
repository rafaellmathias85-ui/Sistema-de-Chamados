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
      const [ticketAlertCount, tickets, pendingTransfers] = await Promise.all([
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

      const totalCount = ticketAlertCount + pendingTransfers.length + rmmAlertCount;

      return NextResponse.json({
        count: totalCount,
        tickets,
        pendingTransfers,
        rmmAlerts,
        rmmAlertCount,
      });
    }

    return NextResponse.json({ count: 0, tickets: [], pendingTransfers: [] });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
