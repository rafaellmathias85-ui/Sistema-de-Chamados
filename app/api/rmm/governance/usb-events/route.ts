export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/governance/usb-events — Agente envia eventos USB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, events } = body;

    if (!token || !hostname || !Array.isArray(events)) {
      return NextResponse.json({ error: 'token, hostname e events[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    const data = events.slice(0, 200).map((e: any) => ({
      machineId: machine.id,
      deviceId: e.device_id || '',
      deviceName: e.device_name || null,
      deviceType: e.device_type || null,
      vendorId: e.vendor_id || null,
      productId: e.product_id || null,
      serialNumber: e.serial_number || null,
      action: e.action || 'connected',
      policyApplied: e.policy_applied || null,
      username: e.username || null,
      eventAt: new Date(e.event_at || Date.now()),
    }));

    const result = await prisma.usbEvent.createMany({ data });

    return NextResponse.json({ ok: true, inserted: result.count });
  } catch (error) {
    console.error('Error saving USB events:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/governance/usb-events?machineId=&action=&from=&to=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const action = searchParams.get('action');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000);

    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (action) where.action = action;

    const events = await prisma.usbEvent.findMany({
      where,
      orderBy: { eventAt: 'desc' },
      take: limit,
      include: { machine: { select: { hostname: true, companyId: true } } },
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error listing USB events:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
