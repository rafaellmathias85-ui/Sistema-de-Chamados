export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/rmm/tasks/[machineId] — Agente busca tarefas pendentes
export async function GET(
  request: NextRequest,
  { params }: { params: { machineId: string } }
) {
  try {
    // Autenticar via header Authorization (token da empresa)
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Token obrigatório' }, { status: 401 });
    }

    const company = await prisma.company.findUnique({
      where: { rmmToken: token },
    });
    if (!company) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Buscar a próxima tarefa pendente para esta máquina
    const task = await prisma.rmmTask.findFirst({
      where: {
        machineId: params.machineId,
        status: 'PENDING',
        machine: { companyId: company.id },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!task) {
      return NextResponse.json({ task: null });
    }

    return NextResponse.json({
      task: {
        id: task.id,
        command: task.command,
        scriptType: task.scriptType || 'auto',
      },
    });
  } catch (error) {
    console.error('RMM tasks error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
