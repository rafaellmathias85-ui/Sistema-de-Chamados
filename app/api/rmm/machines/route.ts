export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/machines — Listar máquinas (painel web)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }

    const machines = await prisma.rmmMachine.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ status: 'asc' }, { lastCheckin: 'desc' }],
    });

    // Marcar máquinas sem check-in há mais de 5 minutos como offline
    // (agente envia heartbeat a cada 60s + retries; 5 min = ~5 tentativas perdidas)
    const now = new Date();
    const machinesWithStatus = machines.map((m: any) => {
      const lastCheckin = m.lastCheckin ? new Date(m.lastCheckin) : null;
      const isOnline = lastCheckin && (now.getTime() - lastCheckin.getTime()) < 5 * 60 * 1000;
      return {
        ...m,
        status: isOnline ? 'Ligado' : 'Offline',
      };
    });

    return NextResponse.json(machinesWithStatus);
  } catch (error) {
    console.error('RMM machines error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
