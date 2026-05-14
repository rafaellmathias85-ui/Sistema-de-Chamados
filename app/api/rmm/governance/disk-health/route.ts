export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/governance/disk-health — Agente envia inventário + métricas de discos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, hostname, disks } = body;

    if (!token || !hostname || !Array.isArray(disks)) {
      return NextResponse.json({ error: 'token, hostname e disks[] obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });

    let inventoryCount = 0;
    let metricsCount = 0;
    let alertsCount = 0;

    for (const disk of disks.slice(0, 50)) {
      const diskNumber = typeof disk.disk_number === 'number' ? disk.disk_number : 0;

      // Upsert no inventário
      const diskInv = await prisma.diskInventory.upsert({
        where: {
          machineId_diskNumber: {
            machineId: machine.id,
            diskNumber,
          },
        },
        update: {
          model: disk.model || null,
          serialNumber: disk.serial_number || null,
          firmwareRev: disk.firmware_rev || null,
          mediaType: disk.media_type || 'Unknown',
          busType: disk.bus_type || null,
          sizeBytes: disk.size_bytes ? BigInt(disk.size_bytes) : null,
          partitionCount: disk.partition_count ?? null,
          partitionsJson: disk.partitions_json ? JSON.stringify(disk.partitions_json) : null,
          smartStatus: disk.smart_status || 'Unknown',
          smartEnabled: disk.smart_enabled ?? null,
          lastScanAt: new Date(),
        },
        create: {
          machineId: machine.id,
          diskNumber,
          model: disk.model || null,
          serialNumber: disk.serial_number || null,
          firmwareRev: disk.firmware_rev || null,
          mediaType: disk.media_type || 'Unknown',
          busType: disk.bus_type || null,
          sizeBytes: disk.size_bytes ? BigInt(disk.size_bytes) : null,
          partitionCount: disk.partition_count ?? null,
          partitionsJson: disk.partitions_json ? JSON.stringify(disk.partitions_json) : null,
          smartStatus: disk.smart_status || 'Unknown',
          smartEnabled: disk.smart_enabled ?? null,
        },
      });
      inventoryCount++;

      // Inserir métricas se fornecidas
      if (disk.metrics) {
        const m = disk.metrics;
        await prisma.diskHealthMetric.create({
          data: {
            machineId: machine.id,
            diskInventoryId: diskInv.id,
            temperature: m.temperature ?? null,
            powerOnHours: m.power_on_hours ?? null,
            powerCycleCount: m.power_cycle_count ?? null,
            reallocatedSectors: m.reallocated_sectors ?? null,
            pendingSectors: m.pending_sectors ?? null,
            uncorrectableErrors: m.uncorrectable_errors ?? null,
            wearLeveling: m.wear_leveling ?? null,
            readErrorRate: m.read_error_rate ?? null,
            writeErrorRate: m.write_error_rate ?? null,
            throughputMbps: m.throughput_mbps ?? null,
            smartRawJson: m.smart_raw_json ? JSON.stringify(m.smart_raw_json) : null,
            healthScore: m.health_score ?? null,
          },
        });
        metricsCount++;
      }

      // Processar alertas gerados pelo agente
      if (Array.isArray(disk.alerts)) {
        for (const alert of disk.alerts.slice(0, 20)) {
          // Evitar alertas duplicados ativos para mesmo tipo/disco
          const existing = await prisma.diskHealthAlert.findFirst({
            where: {
              machineId: machine.id,
              diskInventoryId: diskInv.id,
              alertType: alert.alert_type,
              status: 'active',
            },
          });
          if (!existing) {
            await prisma.diskHealthAlert.create({
              data: {
                machineId: machine.id,
                diskInventoryId: diskInv.id,
                severity: alert.severity || 'warning',
                alertType: alert.alert_type || 'unknown',
                title: alert.title || 'Alerta de disco',
                description: alert.description || null,
                metricName: alert.metric_name || null,
                metricValue: alert.metric_value?.toString() || null,
                thresholdValue: alert.threshold_value?.toString() || null,
              },
            });
            alertsCount++;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      inventory: inventoryCount,
      metrics: metricsCount,
      alerts: alertsCount,
    });
  } catch (error) {
    console.error('Error saving disk health data:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/governance/disk-health?machineId=&smartStatus=&mediaType=&limit=&offset=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const smartStatus = searchParams.get('smartStatus');
    const mediaType = searchParams.get('mediaType');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (smartStatus) where.smartStatus = smartStatus;
    if (mediaType) where.mediaType = mediaType;

    // Filtrar por empresa do usuário se não for admin global
    if (session.user.role !== 'ADMIN') {
      where.machine = { companyId: session.user.companyId };
    }

    const [disks, total] = await Promise.all([
      prisma.diskInventory.findMany({
        where,
        include: {
          machine: { select: { hostname: true, company: { select: { name: true } } } },
          healthMetrics: {
            orderBy: { collectedAt: 'desc' },
            take: 1,
          },
          healthAlerts: {
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { lastScanAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.diskInventory.count({ where }),
    ]);

    // Converter BigInt para string para serialização JSON
    const serialized = disks.map(d => ({
      ...d,
      sizeBytes: d.sizeBytes?.toString() || null,
    }));

    return NextResponse.json({ disks: serialized, total });
  } catch (error) {
    console.error('Error fetching disk health:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
