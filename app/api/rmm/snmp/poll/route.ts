export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import net from 'net';
import { getSession } from '@/lib/session';

/**
 * Verifica conectividade TCP em portas comuns para o tipo de dispositivo.
 * Não depende de 'ping' (indisponível em produção).
 */
async function checkDevice(ip: string, type: string): Promise<{ online: boolean; latency: number }> {
  // Portas comuns por tipo de dispositivo
  const portMap: Record<string, number[]> = {
    router: [80, 443, 22, 23, 161],
    switch: [80, 443, 22, 23, 161],
    firewall: [443, 80, 22, 8443],
    ap: [80, 443, 22],
    other: [80, 443, 22],
  };
  const ports = portMap[type] || [80, 443, 22];

  for (const port of ports) {
    try {
      const start = Date.now();
      const result = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, ip);
      });
      if (result) {
        return { online: true, latency: Date.now() - start };
      }
    } catch {
      continue;
    }
  }
  return { online: false, latency: 0 };
}

// POST - Poll a device (TCP connectivity check)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { deviceId } = await request.json();
    if (!deviceId) return NextResponse.json({ error: 'deviceId obrigatório' }, { status: 400 });

    const device = await prisma.snmpDevice.findUnique({ where: { id: deviceId } });
    if (!device) return NextResponse.json({ error: 'Dispositivo não encontrado' }, { status: 404 });

    const prevStatus = device.status;
    const { online, latency } = await checkDevice(device.ipAddress, device.type);
    const newStatus = online ? 'online' : 'offline';

    // Update device status + latência
    await prisma.snmpDevice.update({
      where: { id: deviceId },
      data: { status: newStatus, lastPoll: new Date(), latency: online ? latency : null },
    });

    // Store metrics
    await prisma.snmpMetric.create({
      data: {
        deviceId,
        metric: 'status',
        value: newStatus,
        unit: null,
      },
    });

    if (online) {
      await prisma.snmpMetric.create({
        data: {
          deviceId,
          metric: 'latency',
          value: String(latency),
          unit: 'ms',
        },
      });
    }

    // Buscar dispositivo com relações para alertas
    const deviceFull = await prisma.snmpDevice.findUnique({
      where: { id: deviceId },
      select: { watcherMachineId: true, companyId: true },
    });

    // Determinar machineId para o alerta: vigia > qualquer máquina da empresa > qualquer máquina
    let alertMachineId = deviceFull?.watcherMachineId;
    if (!alertMachineId && deviceFull?.companyId) {
      const companyMachine = await prisma.rmmMachine.findFirst({
        where: { companyId: deviceFull.companyId },
        select: { id: true },
      });
      alertMachineId = companyMachine?.id || null;
    }
    if (!alertMachineId) {
      const anyMachine = await prisma.rmmMachine.findFirst({ select: { id: true } });
      alertMachineId = anyMachine?.id || null;
    }

    // Criar alerta se ficou offline
    if (newStatus === 'offline' && prevStatus !== 'offline' && alertMachineId) {
      const existingAlert = await prisma.rmmAlert.findFirst({
        where: {
          alertType: 'snmp_offline',
          acknowledged: false,
          resolvedAt: null,
          message: { contains: device.ipAddress },
        },
      });
      if (!existingAlert) {
        await prisma.rmmAlert.create({
          data: {
            machineId: alertMachineId,
            alertType: 'snmp_offline',
            severity: 'critical',
            message: `[Rede] Dispositivo "${device.name}" (${device.ipAddress}) ficou offline`,
          },
        });
      }
    }

    // Resolver alerta se voltou online
    if (newStatus === 'online' && prevStatus === 'offline') {
      await prisma.rmmAlert.updateMany({
        where: {
          alertType: 'snmp_offline',
          acknowledged: false,
          resolvedAt: null,
          message: { contains: device.ipAddress },
        },
        data: { resolvedAt: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      latency: online ? latency : null,
      changed: prevStatus !== newStatus,
    });
  } catch (error) {
    console.error('SNMP poll error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
