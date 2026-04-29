import { prisma } from '@/lib/db';

interface MetricData {
  cpuPercent?: number | null;
  memoryPercent?: number | null;
  diskPercent?: number | null;
}

/**
 * Avalia políticas de alerta para uma máquina, com dedup de alertas pendentes.
 * Apenas cria alerta se NÃO existir alerta pendente (não reconhecido e não resolvido)
 * do mesmo tipo para a mesma máquina + política.
 */
export async function evaluateAlertPolicies(
  machineId: string,
  companyId: string,
  metrics: MetricData
): Promise<void> {
  const policies = await prisma.rmmAlertPolicy.findMany({
    where: {
      enabled: true,
      OR: [{ companyId }, { companyId: null }],
    },
  });

  for (const policy of policies) {
    // CPU
    if (policy.cpuThreshold && metrics.cpuPercent != null && metrics.cpuPercent > policy.cpuThreshold) {
      await createAlertIfNotExists(machineId, policy.id, 'cpu_high', {
        message: `CPU em ${metrics.cpuPercent.toFixed(1)}% (limite: ${policy.cpuThreshold}%)`,
        severity: metrics.cpuPercent > 95 ? 'critical' : 'warning',
        thresholdValue: policy.cpuThreshold,
        actualValue: metrics.cpuPercent,
      });
    }

    // RAM
    if (policy.ramThreshold && metrics.memoryPercent != null && metrics.memoryPercent > policy.ramThreshold) {
      await createAlertIfNotExists(machineId, policy.id, 'ram_high', {
        message: `RAM em ${metrics.memoryPercent.toFixed(1)}% (limite: ${policy.ramThreshold}%)`,
        severity: metrics.memoryPercent > 95 ? 'critical' : 'warning',
        thresholdValue: policy.ramThreshold,
        actualValue: metrics.memoryPercent,
      });
    }

    // Disco
    if (policy.diskThreshold && metrics.diskPercent != null && metrics.diskPercent > policy.diskThreshold) {
      await createAlertIfNotExists(machineId, policy.id, 'disk_high', {
        message: `Disco em ${metrics.diskPercent.toFixed(1)}% (limite: ${policy.diskThreshold}%)`,
        severity: metrics.diskPercent > 90 ? 'critical' : 'warning',
        thresholdValue: policy.diskThreshold,
        actualValue: metrics.diskPercent,
      });
    }
  }
}

/**
 * Cria alerta apenas se não existir alerta pendente (não reconhecido E não resolvido)
 * do mesmo tipo para a mesma máquina + política.
 */
async function createAlertIfNotExists(
  machineId: string,
  policyId: string,
  alertType: string,
  data: { message: string; severity: string; thresholdValue: number; actualValue: number }
): Promise<void> {
  const existing = await prisma.rmmAlert.findFirst({
    where: {
      machineId,
      policyId,
      alertType,
      acknowledged: false,
      resolvedAt: null,
    },
  });

  if (existing) return; // Alerta pendente já existe, skip

  await prisma.rmmAlert.create({
    data: {
      machineId,
      policyId,
      alertType,
      ...data,
    },
  });
}

/**
 * Auto-resolve alertas offline pendentes quando a máquina faz checkin/snapshot.
 */
export async function autoResolveOfflineAlerts(machineId: string): Promise<void> {
  await prisma.rmmAlert.updateMany({
    where: {
      machineId,
      alertType: 'offline',
      acknowledged: false,
      resolvedAt: null,
    },
    data: {
      resolvedAt: new Date(),
    },
  });
}
