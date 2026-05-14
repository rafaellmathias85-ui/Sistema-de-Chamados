export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logGovernanceAction } from '@/lib/governance-audit';

// GET /api/rmm/governance/policies/productivity
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    const where: any = {};
    if (companyId) where.companyId = companyId;

    const policies = await prisma.productivityPolicy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true } } },
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error('Error listing productivity policies:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/governance/policies/productivity
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name, companyId, trackApps, trackUrls, trackIdle,
      idleTimeoutSeconds, captureIntervalSeconds,
      workingHoursStart, workingHoursEnd, workingDays,
      excludedProcesses, productiveApps, unproductiveApps,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name obrigatório' }, { status: 400 });
    }

    const policy = await prisma.productivityPolicy.create({
      data: {
        name,
        companyId: companyId || null,
        trackApps: trackApps ?? true,
        trackUrls: trackUrls ?? false,
        trackIdle: trackIdle ?? true,
        idleTimeoutSeconds: idleTimeoutSeconds || 300,
        captureIntervalSeconds: captureIntervalSeconds || 30,
        workingHoursStart: workingHoursStart || '08:00',
        workingHoursEnd: workingHoursEnd || '18:00',
        workingDays: workingDays || [1, 2, 3, 4, 5],
        excludedProcesses: excludedProcesses || [],
        productiveApps: productiveApps || [],
        unproductiveApps: unproductiveApps || [],
        createdById: session.user.id,
        tenantId: session.user.tenantId || null,
      },
    });

    await logGovernanceAction('policy_created', 'productivity_policy', policy.id, session.user.id, null, body);

    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    console.error('Error creating productivity policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
