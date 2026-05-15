export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/governance/drivers — Agente envia inventário de drivers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, drivers } = body;

    if (!token || !hostname || !Array.isArray(drivers)) {
      return NextResponse.json({ error: 'token, hostname e drivers[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    // Upsert cada driver (evita duplicatas)
    let upserted = 0;
    for (const d of drivers.slice(0, 500)) {
      const infName = d.inf_name || d.driver_name || 'unknown';
      const driverVersion = d.driver_version || null;

      await prisma.driverInventory.upsert({
        where: {
          machineId_infName_driverVersion: {
            machineId: machine.id,
            infName,
            driverVersion: driverVersion || '',
          },
        },
        update: {
          driverName: d.driver_name || infName,
          provider: d.provider || null,
          driverDate: d.driver_date ? new Date(d.driver_date) : null,
          deviceName: d.device_name || null,
          deviceClass: d.device_class || null,
          isSigned: d.is_signed ?? null,
          signer: d.signer || null,
          status: d.status || 'ok',
          scannedAt: new Date(),
        },
        create: {
          machineId: machine.id,
          driverName: d.driver_name || infName,
          driverVersion,
          provider: d.provider || null,
          driverDate: d.driver_date ? new Date(d.driver_date) : null,
          deviceName: d.device_name || null,
          deviceClass: d.device_class || null,
          infName,
          isSigned: d.is_signed ?? null,
          signer: d.signer || null,
          status: d.status || 'ok',
        },
      });
      upserted++;
    }

    return NextResponse.json({ ok: true, upserted });
  } catch (error) {
    console.error('Error saving driver inventory:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/governance/drivers?machineId=&status=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const status = searchParams.get('status');

    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (status) where.status = status;

    const drivers = await prisma.driverInventory.findMany({
      where,
      orderBy: { scannedAt: 'desc' },
      take: 500,
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

    return NextResponse.json(drivers);
  } catch (error) {
    console.error('Error listing drivers:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
