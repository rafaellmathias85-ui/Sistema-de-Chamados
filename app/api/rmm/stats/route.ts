export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/stats — Estatísticas gerais do RMM
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const threeMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    const [totalMachines, onlineMachines, totalTasks, pendingTasks, companiesWithRmm] = await Promise.all([
      prisma.rmmMachine.count(),
      prisma.rmmMachine.count({ where: { lastCheckin: { gte: threeMinAgo } } }),
      prisma.rmmTask.count(),
      prisma.rmmTask.count({ where: { status: 'PENDING' } }),
      prisma.company.count({ where: { rmmToken: { not: null } } }),
    ]);

    return NextResponse.json({
      totalMachines,
      onlineMachines,
      offlineMachines: totalMachines - onlineMachines,
      totalTasks,
      pendingTasks,
      companiesWithRmm,
    });
  } catch (error) {
    console.error('RMM stats error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
