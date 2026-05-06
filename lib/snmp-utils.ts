import { prisma } from '@/lib/db';

/**
 * Atualiza o SnmpDevice com base no resultado do probe (direto ou via vigia).
 * Cria métricas, dispara/resolve alertas de offline.
 */
export async function updateDeviceStatus(
  deviceId: string,
  online: boolean,
  latency: number,
  prevStatus: string
) {
  const newStatus = online ? 'online' : 'offline';

  await prisma.snmpDevice.update({
    where: { id: deviceId },
    data: { status: newStatus, lastPoll: new Date(), latency: online ? latency : null },
  });

  await prisma.snmpMetric.create({
    data: { deviceId, metric: 'status', value: newStatus, unit: null },
  });

  if (online) {
    await prisma.snmpMetric.create({
      data: { deviceId, metric: 'latency', value: String(latency), unit: 'ms' },
    });
  }

  // Alertas — encontra machineId para associar
  const deviceFull = await prisma.snmpDevice.findUnique({
    where: { id: deviceId },
    select: { watcherMachineId: true, companyId: true, name: true, ipAddress: true },
  });

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

  if (newStatus === 'offline' && prevStatus !== 'offline' && alertMachineId) {
    const existingAlert = await prisma.rmmAlert.findFirst({
      where: {
        alertType: 'snmp_offline',
        acknowledged: false,
        resolvedAt: null,
        message: { contains: deviceFull!.ipAddress },
      },
    });
    if (!existingAlert) {
      await prisma.rmmAlert.create({
        data: {
          machineId: alertMachineId,
          alertType: 'snmp_offline',
          severity: 'critical',
          message: `[Rede] Dispositivo "${deviceFull!.name}" (${deviceFull!.ipAddress}) ficou offline`,
        },
      });
    }
  }

  if (newStatus === 'online' && prevStatus === 'offline') {
    await prisma.rmmAlert.updateMany({
      where: {
        alertType: 'snmp_offline',
        acknowledged: false,
        resolvedAt: null,
        message: { contains: deviceFull!.ipAddress },
      },
      data: { resolvedAt: new Date() },
    });
  }

  return { newStatus, changed: prevStatus !== newStatus };
}

/**
 * Parse do output JSON do script de probe SNMP executado pela máquina vigia.
 * Retorna null se não conseguir parsear.
 */
export function parseSnmpProbeOutput(output: string): {
  deviceId: string;
  ip: string;
  online: boolean;
  latency: number;
  openPorts: number[];
  snmpOk: boolean;
} | null {
  try {
    // O output pode ter linhas extras antes/depois do JSON
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.includes('deviceId')) {
        const parsed = JSON.parse(trimmed);
        return {
          deviceId: parsed.deviceId || '',
          ip: parsed.ip || '',
          online: !!parsed.online,
          latency: Number(parsed.latency) || 0,
          openPorts: Array.isArray(parsed.openPorts) ? parsed.openPorts : [],
          snmpOk: !!parsed.snmpOk,
        };
      }
    }
    // Tenta parsear o output inteiro
    const parsed = JSON.parse(output.trim());
    return {
      deviceId: parsed.deviceId || '',
      ip: parsed.ip || '',
      online: !!parsed.online,
      latency: Number(parsed.latency) || 0,
      openPorts: Array.isArray(parsed.openPorts) ? parsed.openPorts : [],
      snmpOk: !!parsed.snmpOk,
    };
  } catch {
    return null;
  }
}

/**
 * Detecta se o comando de uma RmmTask é um probe SNMP pela marcação @@SNMP_PROBE:deviceId@@
 */
export function extractSnmpProbeDeviceId(command: string): string | null {
  const match = command.match(/@@SNMP_PROBE:([^@]+)@@/);
  return match ? match[1] : null;
}
