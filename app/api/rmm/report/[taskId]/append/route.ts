export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/rmm/report/[taskId]/append — Agente envia chunk parcial de saida
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const body = await request.json();
    const { chunk, started } = body as { chunk?: string; started?: boolean };

    const task = await prisma.rmmTask.findUnique({
      where: { id: params.taskId },
      select: { id: true, status: true, liveOutput: true },
    });
    if (!task) return NextResponse.json({ error: 'Tarefa nao encontrada' }, { status: 404 });

    const updates: any = {};
    if (started && task.status === 'PENDING') {
      updates.status = 'RUNNING';
      updates.startedAt = new Date();
    }
    if (typeof chunk === 'string' && chunk.length > 0) {
      // Limita liveOutput a ~256KB para evitar inchaco
      const prev = task.liveOutput || '';
      const merged = prev + chunk;
      updates.liveOutput = merged.length > 262144 ? merged.slice(-262144) : merged;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.rmmTask.update({ where: { id: params.taskId }, data: updates });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('RMM append error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
