export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET — detecção simples de anomalias
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prev7d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // 1. Pico de chamados por cliente (últimas 24h vs média 7d)
    const recentByCompany = await prisma.ticket.groupBy({
      by: ['companyId'],
      where: { createdAt: { gte: last24h } },
      _count: { id: true },
    });

    const weekByCompany = await prisma.ticket.groupBy({
      by: ['companyId'],
      where: { createdAt: { gte: last7d, lt: last24h } },
      _count: { id: true },
    });

    const weekAvgMap = new Map(weekByCompany.map(c => [c.companyId, c._count.id / 6]));
    const spikes: any[] = [];

    for (const rc of recentByCompany) {
      const avg = weekAvgMap.get(rc.companyId) || 0;
      if (rc._count.id > 3 && rc._count.id > avg * 2) {
        const company = await prisma.company.findUnique({ where: { id: rc.companyId }, select: { name: true } });
        spikes.push({
          type: 'ticket_spike',
          severity: 'warning',
          message: `${company?.name || 'Cliente'}: ${rc._count.id} chamados em 24h (média: ${avg.toFixed(1)}/dia)`,
          companyId: rc.companyId,
          count: rc._count.id,
          avg: avg,
        });
      }
    }

    // 2. Aumento de reaberturas
    const recentReopens = await prisma.ticket.count({
      where: { reopenedAt: { gte: last7d }, reopenedFlag: true },
    });
    const prevReopens = await prisma.ticket.count({
      where: { reopenedAt: { gte: prev7d, lt: last7d }, reopenedFlag: true },
    });

    if (recentReopens > 2 && recentReopens > prevReopens * 1.5) {
      spikes.push({
        type: 'reopen_increase',
        severity: 'warning',
        message: `Reaberturas subiram: ${recentReopens} (semana atual) vs ${prevReopens} (semana anterior)`,
        current: recentReopens,
        previous: prevReopens,
      });
    }

    // 3. Volume fora do padrão (últimas 24h vs média 7d)
    const totalLast24h = await prisma.ticket.count({ where: { createdAt: { gte: last24h } } });
    const totalLastWeek = await prisma.ticket.count({ where: { createdAt: { gte: last7d, lt: last24h } } });
    const dailyAvg = totalLastWeek / 6;

    if (totalLast24h > 5 && totalLast24h > dailyAvg * 2) {
      spikes.push({
        type: 'volume_anomaly',
        severity: 'warning',
        message: `Volume anômalo: ${totalLast24h} chamados em 24h (média: ${dailyAvg.toFixed(1)}/dia)`,
        current: totalLast24h,
        avg: dailyAvg,
      });
    }

    // 4. SLA breached count
    const slaBreach = await prisma.ticket.count({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        resolutionDueAt: { lt: now },
      },
    });

    if (slaBreach > 0) {
      spikes.push({
        type: 'sla_breached',
        severity: slaBreach > 5 ? 'critical' : 'error',
        message: `${slaBreach} chamado(s) com SLA estourado`,
        count: slaBreach,
      });
    }

    return NextResponse.json({ anomalies: spikes });
  } catch (error) {
    console.error('Anomalies error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
