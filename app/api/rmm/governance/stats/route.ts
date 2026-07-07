export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

let statsCache: { data: object; expiresAt: number } | null = null;
const STATS_CACHE_TTL = 60_000;

// GET /api/rmm/governance/stats — Stats consolidadas de governance
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (statsCache && Date.now() < statsCache.expiresAt) {
      return NextResponse.json(statsCache.data);
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

    const data = {
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
    };

    statsCache = { data, expiresAt: Date.now() + STATS_CACHE_TTL };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Governance stats error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
