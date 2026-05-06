export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { extractSnmpProbeDeviceId, parseSnmpProbeOutput, updateDeviceStatus } from '@/lib/snmp-utils';

// POST /api/rmm/report/[taskId] — Agente reporta resultado de tarefa
export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const body = await request.json();
    const { output, error: taskError } = body;

    const task = await prisma.rmmTask.findUnique({
      where: { id: params.taskId },
    });

    if (!task) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }

    await prisma.rmmTask.update({
      where: { id: params.taskId },
      data: {
        status: taskError ? 'ERROR' : 'EXECUTED',
        result: output || taskError || '(sem saída)',
        executedAt: new Date(),
      },
    });

    // === SNMP Probe: detecta se a tarefa era um probe de rede e processa resultado ===
    if (task.command && !taskError) {
      const probeDeviceId = extractSnmpProbeDeviceId(task.command);
      if (probeDeviceId && output) {
        try {
          const probeResult = parseSnmpProbeOutput(output);
          if (probeResult) {
            const device = await prisma.snmpDevice.findUnique({
              where: { id: probeDeviceId },
              select: { status: true },
            });
            if (device) {
              await updateDeviceStatus(
                probeDeviceId,
                probeResult.online,
                probeResult.latency,
                device.status
              );
              console.log(`[SNMP Proxy] Probe resultado para device ${probeDeviceId}: online=${probeResult.online}, latency=${probeResult.latency}ms, snmpOk=${probeResult.snmpOk}`);
            }
          } else {
            console.warn(`[SNMP Proxy] Não foi possível parsear output do probe para device ${probeDeviceId}`);
          }
        } catch (parseErr) {
          console.error(`[SNMP Proxy] Erro ao processar probe para device ${probeDeviceId}:`, parseErr);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('RMM report error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
