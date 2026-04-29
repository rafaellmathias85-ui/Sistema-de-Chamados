import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Execute approved script on a machine
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { machineId } = await request.json();
    if (!machineId) {
      return NextResponse.json({ error: 'machineId obrigatório' }, { status: 400 });
    }

    const script = await prisma.rmmScript.findUnique({ where: { id: params.id } });
    if (!script) {
      return NextResponse.json({ error: 'Script não encontrado' }, { status: 404 });
    }
    if (!script.approved) {
      return NextResponse.json({ error: 'Script não aprovado' }, { status: 403 });
    }

    // Create task for the machine
    const task = await prisma.rmmTask.create({
      data: {
        machineId,
        command: script.content,
        createdBy: session.user.id,
        createdByName: session.user.name || 'Usuário',
      },
    });

    return NextResponse.json({ success: true, taskId: task.id });
  } catch (error) {
    console.error('Error executing script:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
