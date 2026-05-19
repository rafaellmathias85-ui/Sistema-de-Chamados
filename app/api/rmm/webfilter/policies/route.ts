export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logGovernanceAction } from '@/lib/governance-audit';

// GET /api/rmm/webfilter/policies
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

    const policies = await prisma.webFilterPolicy.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: { company: { select: { name: true } } },
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error('Error listing web filter policies:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/webfilter/policies
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name, companyId, mode, blockedDomains, allowedDomains,
      blockedCategories, allowedCategories, blockedKeywords,
      scheduleEnabled, scheduleStart, scheduleEnd, scheduleDays,
      blockPageMessage, logOnly, safeSearch, priority, machineIds,
    } = body;

    if (!name) return NextResponse.json({ error: 'name obrigatório' }, { status: 400 });

    const createData: any = {
      name,
      companyId: companyId || null,
      mode: mode || 'blacklist',
      blockedDomains: blockedDomains || [],
      allowedDomains: allowedDomains || [],
      blockedCategories: blockedCategories || [],
      allowedCategories: allowedCategories || [],
      blockedKeywords: blockedKeywords || [],
      scheduleEnabled: scheduleEnabled || false,
      scheduleStart: scheduleStart || null,
      scheduleEnd: scheduleEnd || null,
      scheduleDays: scheduleDays || [1, 2, 3, 4, 5],
      blockPageMessage: blockPageMessage || 'Acesso bloqueado pela política da empresa.',
      logOnly: logOnly || false,
      safeSearch: safeSearch ?? true,
      priority: priority || 100,
      machineIds: machineIds || [],
      createdById: session.user.id,
      tenantId: session.user.tenantId || null,
    };

    let policy;
    try {
      policy = await prisma.webFilterPolicy.create({ data: createData });
    } catch (dbError: any) {
      // Fallback: se coluna machineIds não existe no banco, tenta sem ela
      if (dbError?.message?.includes('machineIds') || dbError?.code === 'P2009') {
        console.warn('Column machineIds not found, retrying without it');
        delete createData.machineIds;
        policy = await prisma.webFilterPolicy.create({ data: createData });
      } else {
        throw dbError;
      }
    }

    await logGovernanceAction('policy_created', 'web_filter_policy', policy.id, session.user.id, null, body);

    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    console.error('Error creating web filter policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
