export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/relay/config?companyId=
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

    const configs = await prisma.relayConfig.findMany({
      where,
      include: {
        machine: { select: { hostname: true, status: true, ipAddress: true } },
        company: { select: { name: true } },
        credential: { select: { name: true, username: true, credentialType: true } },
      },
    });

    return NextResponse.json(configs);
  } catch (error) {
    console.error('Error listing relay configs:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/relay/config — Configurar máquina como relay
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const {
      machineId, companyId, isRelay, scanIntervalMinutes,
      scanSubnets, scanMethods, autoDeploy, credentialId,
    } = body;

    if (!machineId || !companyId) {
      return NextResponse.json({ error: 'machineId e companyId obrigatórios' }, { status: 400 });
    }

    const config = await prisma.relayConfig.upsert({
      where: { machineId },
      update: {
        isRelay: isRelay ?? true,
        scanIntervalMinutes: scanIntervalMinutes || 60,
        scanSubnets: scanSubnets || [],
        scanMethods: scanMethods || ['arp', 'ping'],
        autoDeploy: autoDeploy ?? false,
        credentialId: credentialId || null,
      },
      create: {
        machineId,
        companyId,
        isRelay: isRelay ?? true,
        scanIntervalMinutes: scanIntervalMinutes || 60,
        scanSubnets: scanSubnets || [],
        scanMethods: scanMethods || ['arp', 'ping'],
        autoDeploy: autoDeploy ?? false,
        credentialId: credentialId || null,
      },
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    console.error('Error configuring relay:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
