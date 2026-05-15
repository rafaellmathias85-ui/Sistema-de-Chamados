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

    const [activitySessions, usbEvents, webActivities, drivers, relayDiscovered, agentVersions, auditLogs] = await Promise.all([
      prisma.endpointActivitySession.count(),
      prisma.usbEvent.count(),
      prisma.webActivity.count(),
      prisma.driverInventory.count(),
      prisma.relayDiscoveredMachine.count(),
      prisma.agentVersion.count(),
      prisma.governanceAuditLog.count(),
    ]);

    return NextResponse.json({
      activitySessions,
      usbEvents,
      webActivities,
      drivers,
      relayDiscovered,
      agentVersions,
      auditLogs,
      usbBlocked: 0,
      webBlocked: 0,
    });
  } catch (error) {
    console.error('Governance stats error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
