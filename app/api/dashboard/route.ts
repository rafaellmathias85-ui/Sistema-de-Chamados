export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyId = searchParams.get('companyId');
    const assigneeId = searchParams.get('assigneeId');
    const statusFilter = searchParams.get('status');
    const priorityFilter = searchParams.get('priority');

    const now = new Date();
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate + 'T00:00:00.000Z');
    if (endDate) {
      const end = new Date(endDate + 'T00:00:00.000Z');
      end.setDate(end.getDate() + 1);
      dateFilter.lt = end;
    }

    const where: any = {};
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;
    if (companyId) where.companyId = companyId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (statusFilter) where.status = statusFilter;
    if (priorityFilter) where.priority = priorityFilter;

    // Basic counts
    const [totalOpen, byStatus, byPriority, slaAtRisk, slaBreached, closedInPeriod, reopenedInPeriod] = await Promise.all([
      prisma.ticket.count({ where: { ...where, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.ticket.groupBy({ by: ['status'], where, _count: { id: true } }),
      prisma.ticket.groupBy({ by: ['priority'], where, _count: { id: true } }),
      prisma.ticket.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          resolutionDueAt: { gte: now, lte: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
        },
      }),
      prisma.ticket.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          resolutionDueAt: { lt: now },
        },
      }),
      prisma.ticket.count({ where: { ...where, status: { in: ['RESOLVED', 'CLOSED'] } } }),
      prisma.ticket.count({ where: { ...where, reopenedFlag: true } }),
    ]);

    // Avg response time (tickets with firstResponseAt)
    const ticketsWithResponse = await prisma.ticket.findMany({
      where: { ...where, firstResponseAt: { not: null } },
      select: { createdAt: true, firstResponseAt: true },
    });
    let avgResponseMinutes = 0;
    if (ticketsWithResponse.length > 0) {
      const totalMins = ticketsWithResponse.reduce((sum, t) => {
        return sum + (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime()) / 60000;
      }, 0);
      avgResponseMinutes = totalMins / ticketsWithResponse.length;
    }

    // Avg resolution time
    const ticketsResolved = await prisma.ticket.findMany({
      where: { ...where, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });
    let avgResolutionHours = 0;
    if (ticketsResolved.length > 0) {
      const totalHrs = ticketsResolved.reduce((sum, t) => {
        return sum + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000;
      }, 0);
      avgResolutionHours = totalHrs / ticketsResolved.length;
    }

    // Technician ranking
    const techRanking = await prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: { ...where, assigneeId: { not: null }, status: { in: ['RESOLVED', 'CLOSED'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const techIds = techRanking.map(t => t.assigneeId).filter(Boolean) as string[];
    const techUsers = await prisma.user.findMany({
      where: { id: { in: techIds } },
      select: { id: true, name: true },
    });
    const techMap = new Map(techUsers.map(u => [u.id, u.name]));
    // Get total + open counts per tech
    const techAll = await prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: { ...where, assigneeId: { in: techIds } },
      _count: { id: true },
    });
    const techOpen = await prisma.ticket.groupBy({
      by: ['assigneeId'],
      where: { ...where, assigneeId: { in: techIds }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      _count: { id: true },
    });
    const techAllMap = new Map(techAll.map(t => [t.assigneeId, t._count.id]));
    const techOpenMap = new Map(techOpen.map(t => [t.assigneeId, t._count.id]));
    const ranking = techRanking.map(t => ({
      id: t.assigneeId,
      name: techMap.get(t.assigneeId!) || 'Desconhecido',
      total: techAllMap.get(t.assigneeId!) || 0,
      resolved: t._count.id,
      open: techOpenMap.get(t.assigneeId!) || 0,
    }));

    // Clients with most tickets
    const topClients = await prisma.ticket.groupBy({
      by: ['companyId'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });
    const companyIds = topClients.map(c => c.companyId);
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const compMap = new Map(companies.map(c => [c.id, c.name]));
    const clientOpen = await prisma.ticket.groupBy({
      by: ['companyId'],
      where: { ...where, companyId: { in: companyIds }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      _count: { id: true },
    });
    const clientOpenMap = new Map(clientOpen.map(c => [c.companyId, c._count.id]));
    const clientRanking = topClients.map(c => ({
      companyId: c.companyId,
      companyName: compMap.get(c.companyId) || 'Desconhecido',
      total: c._count.id,
      open: clientOpenMap.get(c.companyId) || 0,
    }));

    // Oldest open tickets
    const oldestOpen = await prisma.ticket.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: {
        id: true, number: true, subject: true, status: true, priority: true,
        createdAt: true, company: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    });

    return NextResponse.json({
      totalOpen,
      byStatus: byStatus.map(s => ({ status: s.status, _count: { id: s._count.id } })),
      byPriority: byPriority.map(p => ({ priority: p.priority, _count: { id: p._count.id } })),
      slaAtRisk,
      slaBreached,
      closedInPeriod,
      reopenedInPeriod,
      avgResponseMinutes: Math.round(avgResponseMinutes),
      avgResolutionHours: parseFloat(avgResolutionHours.toFixed(1)),
      ranking,
      clientRanking,
      oldestOpen,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
