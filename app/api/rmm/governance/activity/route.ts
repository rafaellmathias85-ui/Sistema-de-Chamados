export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/governance/activity — Agente envia sessões de atividade (produtividade)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, sessions } = body;

    if (!token || !hostname || !Array.isArray(sessions)) {
      return NextResponse.json({ error: 'token, hostname e sessions[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    // Inserir em lote
    const data = sessions.slice(0, 500).map((s: any) => ({
      machineId: machine.id,
      windowTitle: s.window_title || '',
      processName: s.process_name || '',
      processPath: s.process_path || null,
      category: s.category || null,
      startedAt: new Date(s.started_at),
      endedAt: s.ended_at ? new Date(s.ended_at) : null,
      durationSeconds: s.duration_seconds || null,
      idleSeconds: s.idle_seconds || 0,
      username: s.username || null,
      isIdle: s.is_idle || false,
    }));

    const result = await prisma.endpointActivitySession.createMany({ data });

    return NextResponse.json({ ok: true, inserted: result.count });
  } catch (error) {
    console.error('Error saving activity sessions:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/governance/activity?machineId=xxx&from=&to=&category= — Painel consulta
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const category = searchParams.get('category');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);

    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (category) where.category = category;
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to) where.startedAt.lte = new Date(to);
    }

    const sessions = await prisma.endpointActivitySession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        machine: {
          select: {
            hostname: true,
            ipAddress: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error listing activity sessions:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
