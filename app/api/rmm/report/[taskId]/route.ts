export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/rmm/report/[taskId] — Agente reporta resultado de tarefa
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const body = await request.json();
    const { output, error: taskError } = body;

    const task = await prisma.rmmTask.findUnique({
      where: { id: params.taskId },
    });

    if (!task) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }

    await prisma.rmmTask.update({
      where: { id: params.taskId },
      data: {
        status: taskError ? 'ERROR' : 'EXECUTED',
        result: output || taskError || '(sem saída)',
        executedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('RMM report error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
