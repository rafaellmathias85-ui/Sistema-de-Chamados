export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/governance/disk-health/alerts?machineId=&severity=&status=&limit=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const severity = searchParams.get('severity');
    const status = searchParams.get('status') || 'active';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (severity) where.severity = severity;
    if (status !== 'all') where.status = status;

    if (session.user.role !== 'ADMIN') {
      where.machine = { companyId: session.user.companyId };
    }

    const alerts = await prisma.diskHealthAlert.findMany({
      where,
      include: {
        machine: { select: { hostname: true, company: { select: { name: true } } } },
        diskInventory: { select: { model: true, diskNumber: true, mediaType: true, serialNumber: true } },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Error fetching disk health alerts:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH /api/rmm/governance/disk-health/alerts — Resolve/acknowledge alerta
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { alertId, action, resolution } = body;

    if (!alertId || !action) {
      return NextResponse.json({ error: 'alertId e action obrigatórios' }, { status: 400 });
    }

    if (!['acknowledge', 'resolve'].includes(action)) {
      return NextResponse.json({ error: 'action deve ser acknowledge ou resolve' }, { status: 400 });
    }

    const alert = await prisma.diskHealthAlert.findUnique({ where: { id: alertId } });
    if (!alert) return NextResponse.json({ error: 'Alerta não encontrado' }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (action === 'acknowledge') {
      updateData.status = 'acknowledged';
      updateData.acknowledgedBy = session.user.id;
      updateData.acknowledgedAt = new Date();
    } else if (action === 'resolve') {
      updateData.status = 'resolved';
      updateData.resolvedBy = session.user.id;
      updateData.resolvedAt = new Date();
      updateData.resolution = resolution || null;
    }

    const updated = await prisma.diskHealthAlert.update({
      where: { id: alertId },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating disk health alert:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
