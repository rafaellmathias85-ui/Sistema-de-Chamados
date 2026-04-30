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

    // Determinar status online/offline baseado em lastCheckin
    // Agente envia heartbeat a cada 60s; threshold de 10 min = ~10 tentativas perdidas
    // Tolerância maior evita falsos "Offline" por latência, alta carga ou timeout temporário
    const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutos
    const now = new Date();
    const machinesWithStatus = machines.map((m: any) => {
      const lastCheckin = m.lastCheckin ? new Date(m.lastCheckin) : null;
      const isOnline = lastCheckin && (now.getTime() - lastCheckin.getTime()) < ONLINE_THRESHOLD_MS;
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
