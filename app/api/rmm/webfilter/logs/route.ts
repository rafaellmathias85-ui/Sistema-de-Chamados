export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/webfilter/logs — Agente envia logs de bloqueio/acesso
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, logs } = body;

    if (!token || !hostname || !Array.isArray(logs)) {
      return NextResponse.json({ error: 'token, hostname e logs[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    const data = logs.slice(0, 500).map((l: any) => ({
      machineId: machine.id,
      policyId: l.policy_id || null,
      url: l.url || '',
      domain: l.domain || '',
      categoryId: l.category_id || null,
      action: l.action || 'blocked',
      reason: l.reason || null,
      matchedRule: l.matched_rule || null,
      username: l.username || null,
      ipAddress: l.ip_address || null,
      userAgent: l.user_agent || null,
      eventAt: new Date(l.event_at || Date.now()),
    }));

    const result = await prisma.webFilterLog.createMany({ data });

    return NextResponse.json({ ok: true, inserted: result.count });
  } catch (error) {
    console.error('Error saving web filter logs:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/webfilter/logs?machineId=&action=&domain=&limit=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const action = searchParams.get('action');
    const domain = searchParams.get('domain');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);

    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (action) where.action = action;
    if (domain) where.domain = { contains: domain };

    const logs = await prisma.webFilterLog.findMany({
      where,
      orderBy: { eventAt: 'desc' },
      take: limit,
      include: {
        machine: { select: { hostname: true } },
        category: { select: { name: true, slug: true } },
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error listing web filter logs:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
