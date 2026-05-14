export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/relay/deploy — Iniciar job de deploy remoto via relay
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const {
      discoveredMachineId, relayMachineId, deployMethod,
      agentType, agentVersion, clientToken,
    } = body;

    if (!discoveredMachineId || !relayMachineId || !deployMethod) {
      return NextResponse.json({ error: 'discoveredMachineId, relayMachineId e deployMethod obrigatórios' }, { status: 400 });
    }

    // Verificar máquina descoberta existe e está aprovada
    const discovered = await prisma.relayDiscoveredMachine.findUnique({
      where: { id: discoveredMachineId },
    });
    if (!discovered) return NextResponse.json({ error: 'Máquina descoberta não encontrada' }, { status: 404 });
    if (discovered.status !== 'approved') {
      return NextResponse.json({ error: 'Máquina precisa ser aprovada antes do deploy' }, { status: 400 });
    }

    // Criar job de deploy
    const job = await prisma.relayDeploymentJob.create({
      data: {
        discoveredMachineId,
        relayMachineId,
        deployMethod,
        agentType: agentType || 'msi',
        agentVersion: agentVersion || null,
        clientToken: clientToken || null,
        status: 'pending',
        createdById: session.user.id,
      },
    });

    // Atualizar status da máquina descoberta
    await prisma.relayDiscoveredMachine.update({
      where: { id: discoveredMachineId },
      data: { status: 'deploying' },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error('Error creating relay deploy job:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH /api/rmm/relay/deploy — Relay reporta progresso do deploy
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, job_id, status, progress_pct, error_message } = body;

    if (!token || !job_id || !status) {
      return NextResponse.json({ error: 'token, job_id e status obrigatórios' }, { status: 400 });
    }

    // Validar token
    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const data: any = { status };
    if (progress_pct !== undefined) data.progressPct = progress_pct;
    if (error_message) data.errorMessage = error_message;
    if (status === 'installing') data.startedAt = new Date();
    if (['completed', 'failed'].includes(status)) data.completedAt = new Date();
    if (status === 'failed') {
      // Incrementar retry
      const job = await prisma.relayDeploymentJob.findUnique({ where: { id: job_id } });
      if (job && job.retryCount < job.maxRetries) {
        data.retryCount = job.retryCount + 1;
        data.status = 'pending'; // Retry automático
      }
    }

    const updated = await prisma.relayDeploymentJob.update({
      where: { id: job_id },
      data,
    });

    // Atualizar status da máquina descoberta
    if (status === 'completed') {
      await prisma.relayDiscoveredMachine.update({
        where: { id: updated.discoveredMachineId },
        data: { status: 'deployed', hasAgent: true },
      });
    } else if (status === 'failed' && data.status !== 'pending') {
      await prisma.relayDiscoveredMachine.update({
        where: { id: updated.discoveredMachineId },
        data: { status: 'failed' },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating relay deploy:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
