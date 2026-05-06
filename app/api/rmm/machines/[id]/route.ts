export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/machines/[id] — Detalhes de uma máquina + tarefas recentes
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const machine = await prisma.rmmMachine.findUnique({
      where: { id: params.id },
      include: {
        company: { select: { id: true, name: true } },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!machine) {
      return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });
    }

    // Determinar status online/offline baseado em lastCheckin (threshold: 10 min)
    const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;
    const now = new Date();
    const lastCheckin = machine.lastCheckin ? new Date(machine.lastCheckin) : null;
    const isOnline = lastCheckin && (now.getTime() - lastCheckin.getTime()) < ONLINE_THRESHOLD_MS;

    return NextResponse.json({
      ...machine,
      status: isOnline ? 'Ligado' : 'Offline',
    });
  } catch (error) {
    console.error('RMM machine detail error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/rmm/machines/[id] — Remover máquina
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    await prisma.rmmMachine.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('RMM machine delete error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
