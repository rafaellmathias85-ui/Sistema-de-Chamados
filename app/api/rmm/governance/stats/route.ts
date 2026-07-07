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
      [endpointsMonitoredRaw],
      usbEvents,
      [usbMonitoredRaw],
      [webMonitoredRaw],
      drivers,
      relayDiscovered,
      agentVersions,
      auditLogs,
      totalMachines,
    ] = await Promise.all([
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "machineId") AS count FROM "EndpointActivitySession"`,
      prisma.usbEvent.count(),
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "machineId") AS count FROM "UsbEvent"`,
      prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT "machineId") AS count FROM "WebActivity"`,
      prisma.driverInventory.count(),
      prisma.relayDiscoveredMachine.count(),
      prisma.agentVersion.count(),
      prisma.governanceAuditLog.count(),
      prisma.rmmMachine.count(),
    ]);

    const endpointsMonitored = Number(endpointsMonitoredRaw?.count ?? 0);
    const usbMonitoredMachines = Number(usbMonitoredRaw?.count ?? 0);
    const webMonitoredMachines = Number(webMonitoredRaw?.count ?? 0);

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
