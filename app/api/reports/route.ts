import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Gerar relatórios
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyId = searchParams.get('companyId');

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate + 'T00:00:00.000Z');
    if (endDate) {
      // Incluir o dia inteiro até 23:59:59.999 UTC
      const end = new Date(endDate + 'T00:00:00.000Z');
      end.setUTCDate(end.getUTCDate() + 1);
      dateFilter.lt = end;
    }

    const baseWhere: any = {};
    if (Object.keys(dateFilter).length > 0) baseWhere.createdAt = dateFilter;
    if (companyId) baseWhere.companyId = companyId;

    switch (type) {
      case 'overview': {
        // Estatísticas gerais
        const [total, byStatus, byPriority, byCategory, recentTickets] = await Promise.all([
          prisma.ticket.count({ where: baseWhere }),
          prisma.ticket.groupBy({
            by: ['status'],
            where: baseWhere,
            _count: { id: true }
          }),
          prisma.ticket.groupBy({
            by: ['priority'],
            where: baseWhere,
            _count: { id: true }
          }),
          prisma.ticket.groupBy({
            by: ['categoryId'],
            where: { ...baseWhere, categoryId: { not: null } },
            _count: { id: true }
          }),
          prisma.ticket.findMany({
            where: baseWhere,
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              number: true,
              subject: true,
              status: true,
              priority: true,
              createdAt: true,
              company: { select: { name: true } }
            }
          })
        ]);

        // Buscar nomes das categorias
        const categoryIds = byCategory.map((c: any) => c.categoryId).filter(Boolean) as string[];
        const categories = await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, color: true }
        });

        const categoryMap = new Map(categories.map((c: any) => [c.id, c]));
        const byCategoryWithNames = byCategory.map((c: any) => ({
          ...c,
          category: categoryMap.get(c.categoryId || '')
        }));

        return NextResponse.json({
          total,
          byStatus,
          byPriority,
          byCategory: byCategoryWithNames,
          recentTickets
        });
      }

      case 'timeline': {
        // Chamados por dia/semana/mês
        const period = searchParams.get('period') || 'day'; // day, week, month
        
        const tickets = await prisma.ticket.findMany({
          where: baseWhere,
          select: {
            createdAt: true,
            status: true,
            resolvedAt: true
          },
          orderBy: { createdAt: 'asc' }
        });

        // Agrupar por período
        const grouped: Record<string, { created: number; resolved: number }> = {};
        
        tickets.forEach((t: any) => {
          let key: string;
          const date = new Date(t.createdAt);
          
          if (period === 'month') {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          } else if (period === 'week') {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            key = weekStart.toISOString().split('T')[0];
          } else {
            key = date.toISOString().split('T')[0];
          }
          
          if (!grouped[key]) grouped[key] = { created: 0, resolved: 0 };
          grouped[key].created++;
          
          if (t.resolvedAt) {
            const resolvedDate = new Date(t.resolvedAt);
            let resolvedKey: string;
            if (period === 'month') {
              resolvedKey = `${resolvedDate.getFullYear()}-${String(resolvedDate.getMonth() + 1).padStart(2, '0')}`;
            } else if (period === 'week') {
              const weekStart = new Date(resolvedDate);
              weekStart.setDate(resolvedDate.getDate() - resolvedDate.getDay());
              resolvedKey = weekStart.toISOString().split('T')[0];
            } else {
              resolvedKey = resolvedDate.toISOString().split('T')[0];
            }
            if (!grouped[resolvedKey]) grouped[resolvedKey] = { created: 0, resolved: 0 };
            grouped[resolvedKey].resolved++;
          }
        });

        const timeline = Object.entries(grouped)
          .map(([date, data]) => ({ date, ...data }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({ timeline });
      }

      case 'sla': {
        // Análise de SLA
        const tickets = await prisma.ticket.findMany({
          where: {
            ...baseWhere,
            OR: [
              { responseDueAt: { not: null } },
              { resolutionDueAt: { not: null } }
            ]
          },
          select: {
            id: true,
            number: true,
            subject: true,
            priority: true,
            status: true,
            createdAt: true,
            firstResponseAt: true,
            responseDueAt: true,
            resolutionDueAt: true,
            resolvedAt: true,
            company: { select: { name: true } },
            assignee: { select: { name: true } }
          }
        });

        let responseOnTime = 0;
        let responseLate = 0;
        let resolutionOnTime = 0;
        let resolutionLate = 0;

        const ticketsWithSLA = tickets.map((t: any) => {
          const responseStatus = t.responseDueAt && t.firstResponseAt
            ? new Date(t.firstResponseAt) <= new Date(t.responseDueAt) ? 'on_time' : 'late'
            : t.responseDueAt && new Date() > new Date(t.responseDueAt) ? 'overdue' : 'pending';
          
          const resolutionStatus = t.resolutionDueAt && t.resolvedAt
            ? new Date(t.resolvedAt) <= new Date(t.resolutionDueAt) ? 'on_time' : 'late'
            : t.resolutionDueAt && new Date() > new Date(t.resolutionDueAt) ? 'overdue' : 'pending';

          if (responseStatus === 'on_time') responseOnTime++;
          if (responseStatus === 'late' || responseStatus === 'overdue') responseLate++;
          if (resolutionStatus === 'on_time') resolutionOnTime++;
          if (resolutionStatus === 'late' || resolutionStatus === 'overdue') resolutionLate++;

          return {
            ...t,
            responseStatus,
            resolutionStatus
          };
        });

        return NextResponse.json({
          summary: {
            responseOnTime,
            responseLate,
            resolutionOnTime,
            resolutionLate,
            responseRate: responseOnTime + responseLate > 0 
              ? Math.round((responseOnTime / (responseOnTime + responseLate)) * 100) 
              : 100,
            resolutionRate: resolutionOnTime + resolutionLate > 0
              ? Math.round((resolutionOnTime / (resolutionOnTime + resolutionLate)) * 100)
              : 100
          },
          tickets: ticketsWithSLA
        });
      }

      case 'performance': {
        // Performance por atendente
        const assignees = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'SUPPORT'] } },
          select: {
            id: true,
            name: true,
            ticketsAssigned: {
              where: baseWhere,
              select: {
                id: true,
                status: true,
                priority: true,
                createdAt: true,
                resolvedAt: true,
                firstResponseAt: true,
                responseDueAt: true,
                resolutionDueAt: true
              }
            }
          }
        });

        const performance = assignees.map((a: any) => {
          const tickets = a.ticketsAssigned;
          const resolved = tickets.filter((t: any) => t.status === 'RESOLVED' || t.status === 'CLOSED');
          const avgResolutionTime = resolved.length > 0
            ? resolved.reduce((acc: any, t: any) => {
                if (t.resolvedAt) {
                  return acc + (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime());
                }
                return acc;
              }, 0) / resolved.length / (1000 * 60 * 60) // Em horas
            : 0;

          const slaCompliance = tickets.filter((t: any) => 
            t.resolutionDueAt && t.resolvedAt && 
            new Date(t.resolvedAt) <= new Date(t.resolutionDueAt)
          ).length;

          return {
            id: a.id,
            name: a.name,
            totalTickets: tickets.length,
            resolvedTickets: resolved.length,
            openTickets: tickets.filter((t: any) => t.status === 'OPEN').length,
            inProgressTickets: tickets.filter((t: any) => t.status === 'IN_PROGRESS').length,
            avgResolutionTimeHrs: Math.round(avgResolutionTime * 10) / 10,
            slaCompliance: tickets.length > 0 ? Math.round((slaCompliance / tickets.length) * 100) : 100
          };
        });

        return NextResponse.json({ performance });
      }

      case 'companies': {
        // Relatório por empresa
        const companies = await prisma.company.findMany({
          select: {
            id: true,
            name: true,
            tickets: {
              where: baseWhere,
              select: {
                id: true,
                status: true,
                priority: true
              }
            }
          }
        });

        const companiesReport = companies
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            totalTickets: c.tickets.length,
            openTickets: c.tickets.filter((t: any) => t.status === 'OPEN').length,
            inProgressTickets: c.tickets.filter((t: any) => t.status === 'IN_PROGRESS').length,
            resolvedTickets: c.tickets.filter((t: any) => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
            criticalTickets: c.tickets.filter((t: any) => t.priority === 'CRITICAL').length
          }))
          .filter((c: any) => c.totalTickets > 0)
          .sort((a: any, b: any) => b.totalTickets - a.totalTickets);

        return NextResponse.json({ companies: companiesReport });
      }

      default:
        return NextResponse.json({ error: 'Tipo de relatório inválido' }, { status: 400 });
    }
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
