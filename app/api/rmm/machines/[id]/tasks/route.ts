export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// PATCH /api/rmm/machines/[id]/tasks — Cancelar tarefa pendente
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, action } = body;

    if (!taskId || action !== 'cancel') {
      return NextResponse.json({ error: 'taskId e action=cancel são obrigatórios' }, { status: 400 });
    }

    const task = await prisma.rmmTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }
    if (task.machineId !== params.id) {
      return NextResponse.json({ error: 'Tarefa não pertence a esta máquina' }, { status: 400 });
    }
    if (task.status !== 'PENDING') {
      return NextResponse.json({ error: 'Apenas tarefas pendentes podem ser canceladas' }, { status: 400 });
    }

    const updated = await prisma.rmmTask.update({
      where: { id: taskId },
      data: {
        status: 'CANCELLED',
        result: `Cancelado por ${session.user.name || 'Admin'} em ${new Date().toLocaleString('pt-BR')}`,
        executedAt: new Date(),
      },
    });

    // Also cancel corresponding exec log if exists
    const execMatch = task.command.match(/EXEC_SCRIPT:[^:]+:[^:]+:(\w+)/);
    if (execMatch) {
      await prisma.rmmExecLog.updateMany({
        where: { id: execMatch[1], status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('RMM cancel task error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/machines/[id]/tasks — Enviar comando para máquina
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { command, scriptType } = body;

    if (!command || !command.trim()) {
      return NextResponse.json({ error: 'Comando obrigatório' }, { status: 400 });
    }

    const validTypes = ['powershell', 'cmd', 'vbscript', 'python'];
    const finalType = validTypes.includes(scriptType) ? scriptType : 'auto';

    // Verificar se a máquina existe
    const machine = await prisma.rmmMachine.findUnique({
      where: { id: params.id },
    });
    if (!machine) {
      return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });
    }

    const task = await prisma.rmmTask.create({
      data: {
        command: command.trim(),
        scriptType: finalType,
        machineId: params.id,
        createdBy: session.user.id,
        createdByName: session.user.name || 'Usuário',
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('RMM create task error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
