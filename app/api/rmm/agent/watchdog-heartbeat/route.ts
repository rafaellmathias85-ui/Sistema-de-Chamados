export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/rmm/agent/watchdog-heartbeat
// Recebe heartbeat do watchdog com status do service
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      hostname,
      token,
      service_exists,
      service_running,
      nssm_exists,
      agent_exists,
      agent_version,
      watchdog_action,
      timestamp,
    } = body;

    if (!token || !hostname) {
      return NextResponse.json({ error: 'Token e hostname obrigatórios' }, { status: 400 });
    }

    // Validar token da empresa
    const company = await prisma.company.findUnique({
      where: { rmmToken: token },
    });

    if (!company) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Buscar máquina
    const machine = await prisma.rmmMachine.findUnique({
      where: {
        hostname_companyId: {
          hostname,
          companyId: company.id,
        },
      },
    });

    if (!machine) {
      return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });
    }

    // Atualizar watchdog info na máquina
    // Usamos o campo notes para guardar o status do watchdog (JSON)
    // Sem adicionar colunas novas ao schema - evita migration no VPS
    const watchdogInfo = JSON.stringify({
      lastHeartbeat: timestamp || new Date().toISOString(),
      serviceExists: service_exists,
      serviceRunning: service_running,
      nssmExists: nssm_exists,
      agentExists: agent_exists,
      agentVersion: agent_version,
      lastAction: watchdog_action,
    });

    // Atualizar agentVersion se fornecido e o campo existir no schema
    const updateData: any = {};
    if (agent_version) {
      updateData.agentVersion = agent_version;
    }

    // Atualizar lastCheckin para manter a máquina como online
    updateData.lastCheckin = new Date();

    await prisma.rmmMachine.update({
      where: { id: machine.id },
      data: updateData,
    });

    // Log watchdog action se não for healthy (para alertas)
    if (watchdog_action && watchdog_action !== 'healthy' && watchdog_action !== 'none') {
      console.log(`[Watchdog] ${hostname} (${company.name}): ${watchdog_action}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Watchdog heartbeat error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
