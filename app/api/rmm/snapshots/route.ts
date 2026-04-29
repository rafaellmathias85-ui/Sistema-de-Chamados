import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { evaluateAlertPolicies, autoResolveOfflineAlerts } from '@/lib/rmm-alerts';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Agent submits a snapshot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { machineId, agentToken, ...snapshotData } = body;

    // Auth via agent token or session
    let machine;
    if (agentToken) {
      const company = await prisma.company.findUnique({ where: { rmmToken: agentToken } });
      if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
      machine = await prisma.rmmMachine.findFirst({ where: { id: machineId, companyId: company.id } });
    } else {
      const session = await getSession();
      if (!session || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
      }
      machine = await prisma.rmmMachine.findUnique({ where: { id: machineId } });
    }

    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    const snapshot = await prisma.machineSnapshot.create({
      data: {
        machineId: machine.id,
        cpuPercent: snapshotData.cpuPercent,
        memoryPercent: snapshotData.memoryPercent,
        memoryUsedBytes: snapshotData.memoryUsedBytes ? BigInt(snapshotData.memoryUsedBytes) : null,
        diskUsageJson: snapshotData.diskUsageJson ? JSON.stringify(snapshotData.diskUsageJson) : null,
        processesJson: snapshotData.processesJson ? JSON.stringify(snapshotData.processesJson) : null,
        servicesJson: snapshotData.servicesJson ? JSON.stringify(snapshotData.servicesJson) : null,
        installedAppsJson: snapshotData.installedAppsJson ? JSON.stringify(snapshotData.installedAppsJson) : null,
        startupAppsJson: snapshotData.startupAppsJson ? JSON.stringify(snapshotData.startupAppsJson) : null,
        gpuJson: snapshotData.gpuJson ? JSON.stringify(snapshotData.gpuJson) : null,
        networkIoJson: snapshotData.networkIoJson ? JSON.stringify(snapshotData.networkIoJson) : null,
      },
    });

    // Update machine metrics
    await prisma.rmmMachine.update({
      where: { id: machine.id },
      data: {
        cpuUsage: snapshotData.cpuPercent,
        ramUsage: snapshotData.memoryPercent,
        diskUsage: snapshotData.diskPercent,
        lastCheckin: new Date(),
        status: 'Online',
      },
    });

    // Auto-resolve offline alerts (machine is alive)
    await autoResolveOfflineAlerts(machine.id);

    // Evaluate alert policies with dedup
    await evaluateAlertPolicies(machine.id, machine.companyId, {
      cpuPercent: snapshotData.cpuPercent,
      memoryPercent: snapshotData.memoryPercent,
      diskPercent: snapshotData.diskPercent,
    });

    return NextResponse.json({ id: snapshot.id });
  } catch (error) {
    console.error('Erro ao salvar snapshot:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET - Get snapshots for a machine
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const machineId = searchParams.get('machineId');
    const latest = searchParams.get('latest');

    if (!machineId) return NextResponse.json({ error: 'machineId obrigatório' }, { status: 400 });

    if (latest === 'true') {
      const snapshot = await prisma.machineSnapshot.findFirst({
        where: { machineId },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json(snapshot);
    }

    const snapshots = await prisma.machineSnapshot.findMany({
      where: { machineId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(snapshots);
  } catch (error) {
    console.error('Erro ao buscar snapshots:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
