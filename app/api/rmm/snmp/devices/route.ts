export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET - Listar dispositivos de rede com empresa e máquina vigia
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const devices = await prisma.snmpDevice.findMany({
      include: {
        metrics: { orderBy: { createdAt: 'desc' }, take: 10 },
        company: { select: { id: true, name: true } },
        watcherMachine: { select: { id: true, hostname: true, status: true, company: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(devices);
  } catch (error) {
    console.error('SNMP devices error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Criar dispositivo com empresa e máquina vigia
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { name, ipAddress, community, type, companyId, watcherMachineId } = await request.json();
    if (!name || !ipAddress) {
      return NextResponse.json({ error: 'Nome e IP obrigatórios' }, { status: 400 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'Empresa obrigatória' }, { status: 400 });
    }

    // Validar se a empresa existe
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    // Validar se a máquina vigia existe e pertence à mesma empresa
    if (watcherMachineId) {
      const machine = await prisma.rmmMachine.findUnique({ where: { id: watcherMachineId } });
      if (!machine) {
        return NextResponse.json({ error: 'Máquina vigia não encontrada' }, { status: 400 });
      }
      if (machine.companyId !== companyId) {
        return NextResponse.json({ error: 'A máquina vigia deve pertencer à mesma empresa' }, { status: 400 });
      }
    }

    const device = await prisma.snmpDevice.create({
      data: {
        name,
        ipAddress,
        community: community || 'public',
        type: type || 'router',
        companyId,
        watcherMachineId: watcherMachineId || null,
      },
      include: {
        company: { select: { id: true, name: true } },
        watcherMachine: { select: { id: true, hostname: true } },
      },
    });

    return NextResponse.json(device, { status: 201 });
  } catch (error: unknown) {
    const prismaError = error as { code?: string };
    if (prismaError.code === 'P2002') {
      return NextResponse.json({ error: 'Dispositivo com este IP já existe' }, { status: 400 });
    }
    console.error('SNMP device create error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH - Atualizar dispositivo (alterar vigia, empresa, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { id, watcherMachineId, companyId, name, type } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (companyId !== undefined) updateData.companyId = companyId;
    if (watcherMachineId !== undefined) updateData.watcherMachineId = watcherMachineId || null;

    const device = await prisma.snmpDevice.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true } },
        watcherMachine: { select: { id: true, hostname: true } },
      },
    });

    return NextResponse.json(device);
  } catch (error) {
    console.error('SNMP device update error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Remover dispositivo
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    await prisma.snmpDevice.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('SNMP device delete error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
