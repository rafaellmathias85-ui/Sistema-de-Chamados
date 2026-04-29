export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 403 });
    }

    const executions = await prisma.playbookExecution.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        playbook: { select: { name: true } },
        machine: { select: { hostname: true } },
      },
    });

    return NextResponse.json(executions);
  } catch (error) {
    console.error('Error fetching executions:', error);
    return NextResponse.json({ error: 'Erro ao buscar execu\u00e7\u00f5es' }, { status: 500 });
  }
}
