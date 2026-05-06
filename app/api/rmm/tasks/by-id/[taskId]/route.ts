export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/tasks/by-id/[taskId] — UI consulta status + liveOutput de uma tarefa
export async function GET(_request: NextRequest, { params }: { params: { taskId: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const role = session.user.role;
  if (role !== 'ADMIN' && role !== 'SUPPORT') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const task = await prisma.rmmTask.findUnique({
    where: { id: params.taskId },
    select: {
      id: true,
      status: true,
      result: true,
      liveOutput: true,
      createdAt: true,
      startedAt: true,
      executedAt: true,
      machineId: true,
      scriptType: true,
      createdByName: true,
    },
  });
  if (!task) return NextResponse.json({ error: 'Tarefa nao encontrada' }, { status: 404 });
  return NextResponse.json(task);
}
