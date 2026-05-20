export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/governance/stats — Stats consolidadas de governance (single query)
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });
    }

    const [
      endpointsMonitored,
      usbEvents,
      usbMonitoredMachines,
      webMonitoredMachines,
      drivers,
      relayDiscovered,
      agentVersions,
      auditLogs,
      totalMachines,
    ] = await Promise.all([
      // Contar máquinas únicas com sessões de atividade (não total de sessões)
      prisma.endpointActivitySession.groupBy({ by: ['machineId'] }).then(g => g.length),
      prisma.usbEvent.count(),
      // Contar máquinas distintas com eventos USB
      prisma.usbEvent.groupBy({ by: ['machineId'] }).then(g => g.length),
      // Contar máquinas distintas com webActivity (não URLs individuais)
      prisma.webActivity.groupBy({ by: ['machineId'] }).then(g => g.length),
      prisma.driverInventory.count(),
      prisma.relayDiscoveredMachine.count(),
      prisma.agentVersion.count(),
      prisma.governanceAuditLog.count(),
      prisma.rmmMachine.count(),
    ]);

    return NextResponse.json({
      endpointsMonitored,
      usbEvents,
      usbMonitoredMachines,
      webActivities: webMonitoredMachines,
      drivers,
      relayDiscovered,
      agentVersions,
      auditLogs,
      totalMachines,
      usbBlocked: 0,
      webBlocked: 0,
    });
  } catch (error) {
    console.error('Governance stats error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
