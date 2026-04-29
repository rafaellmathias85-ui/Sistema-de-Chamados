export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST - Execute playbook on a machine
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { playbookId, machineId } = await request.json();
    if (!playbookId || !machineId) {
      return NextResponse.json({ error: 'playbookId e machineId obrigatórios' }, { status: 400 });
    }

    const playbook = await prisma.rmmPlaybook.findUnique({ where: { id: playbookId } });
    if (!playbook) return NextResponse.json({ error: 'Playbook não encontrado' }, { status: 404 });
    if (!playbook.enabled) return NextResponse.json({ error: 'Playbook desabilitado' }, { status: 400 });

    // Create RMM task to execute the playbook
    const task = await prisma.rmmTask.create({
      data: {
        command: playbook.action,
        scriptType: playbook.scriptType,
        machineId,
        createdBy: session.user.id,
        createdByName: `Playbook: ${playbook.name}`,
      },
    });

    // Record execution
    const execution = await prisma.playbookExecution.create({
      data: {
        playbookId,
        machineId,
        trigger: 'MANUAL',
        result: `Task ${task.id} criada`,
        success: true,
      },
    });

    return NextResponse.json({ success: true, taskId: task.id, executionId: execution.id });
  } catch (error) {
    console.error('Execute playbook error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET - List executions
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const playbookId = searchParams.get('playbookId');

    const where: any = {};
    if (playbookId) where.playbookId = playbookId;

    const executions = await prisma.playbookExecution.findMany({
      where,
      include: {
        playbook: { select: { name: true, trigger: true } },
        machine: { select: { hostname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(executions);
  } catch (error) {
    console.error('Playbook executions error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
