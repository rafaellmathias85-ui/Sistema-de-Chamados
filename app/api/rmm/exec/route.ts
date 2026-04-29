import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - List execution logs
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get('machineId');
    const scriptId = searchParams.get('scriptId');

    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (scriptId) where.scriptId = scriptId;

    const logs = await prisma.rmmExecLog.findMany({
      where,
      include: {
        machine: { select: { id: true, hostname: true, company: { select: { name: true } } } },
        script: { select: { id: true, name: true, scriptType: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Erro ao listar exec logs:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Request script execution on a machine
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { machineId, scriptId } = await req.json();
    if (!machineId || !scriptId) {
      return NextResponse.json({ error: 'machineId e scriptId são obrigatórios' }, { status: 400 });
    }

    const script = await prisma.rmmScript.findUnique({ where: { id: scriptId } });
    if (!script) return NextResponse.json({ error: 'Script não encontrado' }, { status: 404 });
    if (!script.approved) return NextResponse.json({ error: 'Script não aprovado' }, { status: 400 });

    const machine = await prisma.rmmMachine.findUnique({ where: { id: machineId } });
    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    const execLog = await prisma.rmmExecLog.create({
      data: {
        machineId,
        scriptId,
        requestedBy: session.user.id,
        requestedByName: session.user.name || 'Admin',
        status: 'PENDING',
      },
    });

    // Create a task for the agent to pick up
    await prisma.rmmTask.create({
      data: {
        machineId,
        command: `EXEC_SCRIPT:${script.scriptType}:${script.id}:${execLog.id}`,
        createdBy: session.user.id,
        createdByName: session.user.name,
      },
    });

    return NextResponse.json(execLog, { status: 201 });
  } catch (error) {
    console.error('Erro ao solicitar execução:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
