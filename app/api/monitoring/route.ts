import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getAIProviderMetrics, resetCircuitBreaker } from '@/lib/ai-providers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/monitoring — Métricas e health check do sistema
 * Apenas ADMIN pode acessar.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last1h = new Date(now.getTime() - 60 * 60 * 1000);

    // Métricas paralelas
    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      ticketsLast24h,
      pendingTransfers,
      activeAlerts,
      recentEvents,
      emailProcessedCount,
      emailErrorCount,
      slaBreachingTickets,
    ] = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({ where: { status: 'OPEN' } }),
      prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.ticket.count({ where: { createdAt: { gte: last24h } } }),
      prisma.ticketTransferRequest.count({ where: { status: 'pending' } }).catch(() => 0),
      prisma.rmmAlert.count({ where: { acknowledged: false } }).catch(() => 0),
      prisma.systemEvent.findMany({
        where: {
          createdAt: { gte: last1h },
          severity: { in: ['error', 'critical'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, severity: true, entityType: true, actorName: true, createdAt: true, metadata: true },
      }),
      prisma.processedEmail.count({ where: { processedAt: { gte: last24h }, status: 'processed' } }).catch(() => 0),
      prisma.processedEmail.count({ where: { processedAt: { gte: last24h }, status: 'error' } }).catch(() => 0),
      prisma.ticket.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          resolutionDueAt: { lte: now },
        },
      }),
    ]);

    // Métricas de IA
    const aiMetrics = await getAIProviderMetrics();

    // Health checks
    const healthChecks = {
      database: 'ok',
      aiProviders: aiMetrics.configuredProviders > 0 ? 'ok' : 'warning',
      email: emailErrorCount === 0 ? 'ok' : emailErrorCount > 5 ? 'critical' : 'warning',
      sla: slaBreachingTickets === 0 ? 'ok' : slaBreachingTickets > 5 ? 'critical' : 'warning',
      transfers: pendingTransfers > 10 ? 'warning' : 'ok',
    };

    const overallHealth = Object.values(healthChecks).includes('critical') ? 'critical'
      : Object.values(healthChecks).includes('warning') ? 'warning' : 'ok';

    return NextResponse.json({
      status: overallHealth,
      timestamp: now.toISOString(),
      health: healthChecks,
      tickets: {
        total: totalTickets,
        open: openTickets,
        inProgress: inProgressTickets,
        createdLast24h: ticketsLast24h,
        slaBreaching: slaBreachingTickets,
      },
      transfers: {
        pending: pendingTransfers,
      },
      rmm: {
        activeAlerts,
      },
      email: {
        processedLast24h: emailProcessedCount,
        errorsLast24h: emailErrorCount,
      },
      ai: aiMetrics,
      recentCriticalEvents: recentEvents,
    });
  } catch (error) {
    console.error('[Monitoring] Error:', error);
    return NextResponse.json({ error: 'Erro ao obter métricas' }, { status: 500 });
  }
}

/**
 * POST /api/monitoring — Ações de manutenção (ex: resetar circuit breaker)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { action, providerName } = await request.json();

    if (action === 'reset_circuit_breaker' && providerName) {
      resetCircuitBreaker(providerName);
      return NextResponse.json({ success: true, message: `Circuit breaker de ${providerName} resetado` });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('[Monitoring] POST error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
