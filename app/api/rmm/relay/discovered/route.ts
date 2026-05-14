export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/relay/discovered — Relay reporta máquinas descobertas na rede
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, discoveries } = body;

    if (!token || !hostname || !Array.isArray(discoveries)) {
      return NextResponse.json({ error: 'token, hostname e discoveries[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    // Máquina relay
    const relayMachine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!relayMachine) return NextResponse.json({ error: 'Máquina relay não encontrada' }, { status: 404 });

    let upserted = 0;
    for (const d of discoveries.slice(0, 200)) {
      if (!d.ip_address) continue;

      // Verificar se já tem agente instalado
      let agentMachineId: string | null = null;
      let hasAgent = false;
      if (d.hostname) {
        const existing = await prisma.rmmMachine.findUnique({
          where: { hostname_companyId: { hostname: d.hostname, companyId: company.id } },
          select: { id: true },
        });
        if (existing) {
          agentMachineId = existing.id;
          hasAgent = true;
        }
      }

      await prisma.relayDiscoveredMachine.upsert({
        where: {
          relayMachineId_ipAddress: {
            relayMachineId: relayMachine.id,
            ipAddress: d.ip_address,
          },
        },
        update: {
          hostname: d.hostname || null,
          macAddress: d.mac_address || null,
          osInfo: d.os_info || null,
          discoveryMethod: d.discovery_method || 'ping',
          hasAgent,
          agentMachineId,
          lastSeenAt: new Date(),
        },
        create: {
          relayMachineId: relayMachine.id,
          companyId: company.id,
          hostname: d.hostname || null,
          ipAddress: d.ip_address,
          macAddress: d.mac_address || null,
          osInfo: d.os_info || null,
          discoveryMethod: d.discovery_method || 'ping',
          hasAgent,
          agentMachineId,
          status: 'discovered',
        },
      });
      upserted++;
    }

    return NextResponse.json({ ok: true, upserted });
  } catch (error) {
    console.error('Error saving relay discoveries:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/relay/discovered?companyId=&status=&relayMachineId=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const status = searchParams.get('status');
    const relayMachineId = searchParams.get('relayMachineId');

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;
    if (relayMachineId) where.relayMachineId = relayMachineId;

    const discovered = await prisma.relayDiscoveredMachine.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      take: 500,
      include: {
        relayMachine: { select: { hostname: true } },
        company: { select: { name: true } },
      },
    });

    return NextResponse.json(discovered);
  } catch (error) {
    console.error('Error listing relay discoveries:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH /api/rmm/relay/discovered — Aprovar/rejeitar máquina descoberta
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { id, status, notes } = await request.json();
    if (!id || !status) return NextResponse.json({ error: 'id e status obrigatórios' }, { status: 400 });

    const data: any = { status };
    if (notes !== undefined) data.notes = notes;
    if (status === 'approved') {
      data.approvedById = session.user.id;
      data.approvedAt = new Date();
    }

    const updated = await prisma.relayDiscoveredMachine.update({ where: { id }, data });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating relay discovery:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
