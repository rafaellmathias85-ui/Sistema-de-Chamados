export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/governance/web-activity — Agente envia URLs visitadas
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, activities } = body;

    if (!token || !hostname || !Array.isArray(activities)) {
      return NextResponse.json({ error: 'token, hostname e activities[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    const data = activities.slice(0, 500).map((a: any) => ({
      machineId: machine.id,
      url: a.url || '',
      domain: a.domain || '',
      pageTitle: a.page_title || null,
      browser: a.browser || null,
      category: a.category || null,
      durationSeconds: a.duration_seconds || null,
      visitedAt: new Date(a.visited_at || Date.now()),
      username: a.username || null,
      isBlocked: a.is_blocked || false,
    }));

    const result = await prisma.webActivity.createMany({ data });

    return NextResponse.json({ ok: true, inserted: result.count });
  } catch (error) {
    console.error('Error saving web activity:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/governance/web-activity?machineId=&domain=&from=&to=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const domain = searchParams.get('domain');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);

    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (domain) where.domain = { contains: domain };

    const activities = await prisma.webActivity.findMany({
      where,
      orderBy: { visitedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error listing web activity:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
