import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const bearerValid = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!bearerValid) {
    const session = await getSession()
    const isAdmin = session?.user?.role === 'ADMIN'

    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()

  const cutoff90 = new Date(now)
  cutoff90.setDate(cutoff90.getDate() - 90)

  const cutoff180 = new Date(now)
  cutoff180.setDate(cutoff180.getDate() - 180)

  const cutoff30 = new Date(now)
  cutoff30.setDate(cutoff30.getDate() - 30)

  const run = async (query: () => Promise<number>, label: string) => {
    try { return await query() } catch (e: any) { console.error(`[retention] ${label}:`, e?.message); return -1 }
  }

  const [webActivity, activitySessions, execLogs, usbEvents, snapshots, diskMetrics] = await Promise.all([
    run(() => prisma.$executeRaw`
      DELETE FROM "WebActivity" WHERE id IN (
        SELECT id FROM "WebActivity" WHERE "createdAt" < ${cutoff90} LIMIT 10000
      )`, 'WebActivity'),

    run(() => prisma.$executeRaw`
      DELETE FROM "EndpointActivitySession" WHERE id IN (
        SELECT id FROM "EndpointActivitySession" WHERE "startedAt" < ${cutoff90} LIMIT 10000
      )`, 'EndpointActivitySession'),

    run(() => prisma.$executeRaw`
      DELETE FROM "RmmExecLog" WHERE id IN (
        SELECT id FROM "RmmExecLog" WHERE "createdAt" < ${cutoff90} LIMIT 10000
      )`, 'RmmExecLog'),

    run(() => prisma.$executeRaw`
      DELETE FROM "UsbEvent" WHERE id IN (
        SELECT id FROM "UsbEvent" WHERE "eventAt" < ${cutoff180} LIMIT 10000
      )`, 'UsbEvent'),

    run(() => prisma.$executeRaw`
      DELETE FROM "MachineSnapshot" WHERE id IN (
        SELECT id FROM "MachineSnapshot" WHERE "createdAt" < ${cutoff30} LIMIT 10000
      )`, 'MachineSnapshot'),

    run(() => prisma.$executeRaw`
      DELETE FROM "DiskHealthMetric" WHERE id IN (
        SELECT id FROM "DiskHealthMetric" WHERE "collectedAt" < ${cutoff180} LIMIT 10000
      )`, 'DiskHealthMetric'),
  ])

  return NextResponse.json({
    ok: true,
    deleted: { webActivity, activitySessions, execLogs, usbEvents, snapshots, diskMetrics },
  })
}
