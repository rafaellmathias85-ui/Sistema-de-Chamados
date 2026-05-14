export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/agent/heartbeat-check — Detectar agentes removidos / offline
// Chamado via cron ou manualmente pelo painel
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // Minutos sem checkin para considerar offline (padrão: 5 min)
    const offlineMinutes = parseInt(searchParams.get('offlineMinutes') || '5');
    // Minutos sem checkin para considerar removido (padrão: 1440 = 24h)
    const removedMinutes = parseInt(searchParams.get('removedMinutes') || '1440');

    const now = new Date();
    const offlineThreshold = new Date(now.getTime() - offlineMinutes * 60 * 1000);
    const removedThreshold = new Date(now.getTime() - removedMinutes * 60 * 1000);

    // Máquinas que estão "Ligado" mas não fizeram checkin recente → marcar como Offline
    const staleOnline = await prisma.rmmMachine.updateMany({
      where: {
        status: 'Ligado',
        lastCheckin: { lt: offlineThreshold },
      },
      data: { status: 'Offline' },
    });

    // Máquinas offline há muito tempo (possivelmente com agente removido)
    const possiblyRemoved = await prisma.rmmMachine.findMany({
      where: {
        status: 'Offline',
        lastCheckin: { lt: removedThreshold },
      },
      select: {
        id: true,
        hostname: true,
        lastCheckin: true,
        companyId: true,
        company: { select: { name: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      markedOffline: staleOnline.count,
      possiblyRemoved: possiblyRemoved.length,
      machines: possiblyRemoved,
    });
  } catch (error) {
    console.error('Error checking heartbeats:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
