import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rmm/alerts/check-offline
 * Verifica máquinas offline (lastCheckin > offlineMinutes da política)
 * e cria alertas com dedup. Pode ser chamado periodicamente via cron/daemon.
 */
export async function GET(req: NextRequest) {
  try {
    // Buscar todas as políticas ativas que têm offlineMinutes configurado
    const policies = await prisma.rmmAlertPolicy.findMany({
      where: {
        enabled: true,
        offlineMinutes: { not: null },
      },
    });

    if (policies.length === 0) {
      return NextResponse.json({ checked: 0, alertsCreated: 0, message: 'Nenhuma política de offline configurada' });
    }

    let alertsCreated = 0;
    let machinesChecked = 0;

    for (const policy of policies) {
      const offlineMinutes = policy.offlineMinutes!;
      const cutoff = new Date(Date.now() - offlineMinutes * 60 * 1000);

      // Buscar máquinas que estão offline (lastCheckin anterior ao cutoff)
      const whereClause: any = {
        lastCheckin: { lt: cutoff },
      };
      // Se a política é de uma empresa, filtrar por empresa
      if (policy.companyId) {
        whereClause.companyId = policy.companyId;
      }

      const offlineMachines = await prisma.rmmMachine.findMany({
        where: whereClause,
        select: { id: true, hostname: true, companyId: true, lastCheckin: true },
      });

      machinesChecked += offlineMachines.length;

      for (const machine of offlineMachines) {
        // Dedup: verificar se já existe alerta offline pendente
        const existing = await prisma.rmmAlert.findFirst({
          where: {
            machineId: machine.id,
            policyId: policy.id,
            alertType: 'offline',
            acknowledged: false,
            resolvedAt: null,
          },
        });

        if (!existing) {
          const minutesOffline = Math.round((Date.now() - new Date(machine.lastCheckin!).getTime()) / 60000);
          await prisma.rmmAlert.create({
            data: {
              machineId: machine.id,
              policyId: policy.id,
              alertType: 'offline',
              message: `Máquina offline há ${minutesOffline} minutos (limite: ${offlineMinutes} min)`,
              severity: minutesOffline > offlineMinutes * 2 ? 'critical' : 'warning',
              thresholdValue: offlineMinutes,
              actualValue: minutesOffline,
            },
          });
          alertsCreated++;
        }
      }

      // Atualizar status das máquinas offline
      if (offlineMachines.length > 0) {
        await prisma.rmmMachine.updateMany({
          where: { id: { in: offlineMachines.map(m => m.id) } },
          data: { status: 'Offline' },
        });
      }
    }

    return NextResponse.json({
      checked: machinesChecked,
      alertsCreated,
      message: `Verificação concluída: ${machinesChecked} máquinas verificadas, ${alertsCreated} alertas criados`,
    });
  } catch (error) {
    console.error('Erro ao verificar máquinas offline:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
