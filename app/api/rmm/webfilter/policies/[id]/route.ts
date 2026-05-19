export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logGovernanceAction } from '@/lib/governance-audit';

// GET /api/rmm/webfilter/policies/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const policy = await prisma.webFilterPolicy.findUnique({
      where: { id: params.id },
      include: { company: { select: { id: true, name: true } } },
    });

    if (!policy) return NextResponse.json({ error: 'Política não encontrada' }, { status: 404 });
    return NextResponse.json(policy);
  } catch (error) {
    console.error('Error fetching policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH /api/rmm/webfilter/policies/[id] — Atualizar política
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};

    // Campos atualizáveis
    if (body.name !== undefined) updateData.name = body.name;
    if (body.companyId !== undefined) updateData.companyId = body.companyId || null;
    if (body.mode !== undefined) updateData.mode = body.mode;
    if (body.blockedDomains !== undefined) updateData.blockedDomains = body.blockedDomains;
    if (body.allowedDomains !== undefined) updateData.allowedDomains = body.allowedDomains;
    if (body.blockedCategories !== undefined) updateData.blockedCategories = body.blockedCategories;
    if (body.allowedCategories !== undefined) updateData.allowedCategories = body.allowedCategories;
    if (body.blockedKeywords !== undefined) updateData.blockedKeywords = body.blockedKeywords;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.logOnly !== undefined) updateData.logOnly = body.logOnly;
    if (body.safeSearch !== undefined) updateData.safeSearch = body.safeSearch;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.scheduleEnabled !== undefined) updateData.scheduleEnabled = body.scheduleEnabled;
    if (body.scheduleStart !== undefined) updateData.scheduleStart = body.scheduleStart;
    if (body.scheduleEnd !== undefined) updateData.scheduleEnd = body.scheduleEnd;
    if (body.scheduleDays !== undefined) updateData.scheduleDays = body.scheduleDays;
    if (body.blockPageMessage !== undefined) updateData.blockPageMessage = body.blockPageMessage;
    if (body.machineIds !== undefined) updateData.machineIds = body.machineIds;

    const policy = await prisma.webFilterPolicy.update({
      where: { id: params.id },
      data: updateData,
      include: { company: { select: { id: true, name: true } } },
    });

    await logGovernanceAction('policy_updated', 'web_filter_policy', policy.id, session.user.id, null, body);

    return NextResponse.json(policy);
  } catch (error) {
    console.error('Error updating policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/rmm/webfilter/policies/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    // Primeiro desassociar logs (setar policyId = null)
    await prisma.webFilterLog.updateMany({
      where: { policyId: params.id },
      data: { policyId: null },
    });

    await prisma.webFilterPolicy.delete({ where: { id: params.id } });

    await logGovernanceAction('policy_deleted', 'web_filter_policy', params.id, session.user.id, null, null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
