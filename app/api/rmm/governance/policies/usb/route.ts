export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { logGovernanceAction } from '@/lib/governance-audit';

// GET /api/rmm/governance/policies/usb — Listar políticas USB
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

    const policies = await prisma.usbPolicy.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: { company: { select: { name: true } } },
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error('Error listing USB policies:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/governance/policies/usb — Criar política USB
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const { name, companyId, policyType, deviceClass, vendorId, productId, serialNumber, priority } = body;

    if (!name || !policyType) {
      return NextResponse.json({ error: 'name e policyType obrigatórios' }, { status: 400 });
    }

    if (!['allow', 'block', 'read_only', 'notify'].includes(policyType)) {
      return NextResponse.json({ error: 'policyType inválido' }, { status: 400 });
    }

    const policy = await prisma.usbPolicy.create({
      data: {
        name,
        companyId: companyId || null,
        policyType,
        deviceClass: deviceClass || null,
        vendorId: vendorId || null,
        productId: productId || null,
        serialNumber: serialNumber || null,
        priority: priority || 100,
        createdById: session.user.id,
        tenantId: session.user.tenantId || null,
      },
    });

    await logGovernanceAction('policy_created', 'usb_policy', policy.id, session.user.id, null, body);

    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    console.error('Error creating USB policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH /api/rmm/governance/policies/usb — Atualizar política USB
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updateFields } = body;
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const existing = await prisma.usbPolicy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Política não encontrada' }, { status: 404 });

    const data: any = {};
    if (updateFields.name !== undefined) data.name = updateFields.name;
    if (updateFields.policyType !== undefined) data.policyType = updateFields.policyType;
    if (updateFields.deviceClass !== undefined) data.deviceClass = updateFields.deviceClass;
    if (updateFields.priority !== undefined) data.priority = updateFields.priority;
    if (updateFields.isActive !== undefined) data.isActive = updateFields.isActive;

    const updated = await prisma.usbPolicy.update({ where: { id }, data });

    await logGovernanceAction('policy_updated', 'usb_policy', id, session.user.id, existing, updateFields);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating USB policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/rmm/governance/policies/usb?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    await prisma.usbPolicy.delete({ where: { id } });
    await logGovernanceAction('policy_deleted', 'usb_policy', id, session.user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting USB policy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
