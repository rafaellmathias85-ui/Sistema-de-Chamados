export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/rmm/agent/report-update — Agente reporta resultado do update
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      token, hostname, old_version, new_version, agent_type,
      status, error_message,
    } = body;

    if (!token || !hostname || !new_version || !agent_type || !status) {
      return NextResponse.json({ error: 'Campos obrigatórios: token, hostname, new_version, agent_type, status' }, { status: 400 });
    }

    // Validar token da empresa
    const company = await prisma.company.findUnique({
      where: { rmmToken: token },
    });
    if (!company) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Encontrar a máquina
    const machine = await prisma.rmmMachine.findUnique({
      where: { hostname_companyId: { hostname, companyId: company.id } },
    });
    if (!machine) {
      return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });
    }

    // Buscar versão no banco (se existir)
    const versionRecord = await prisma.agentVersion.findFirst({
      where: { version: new_version, agentType: agent_type },
    });

    // Registrar histórico de update
    const history = await prisma.agentUpdateHistory.create({
      data: {
        machineId: machine.id,
        versionId: versionRecord?.id || null,
        oldVersion: old_version || null,
        newVersion: new_version,
        agentType: agent_type,
        status,
        errorMessage: error_message || null,
        completedAt: ['completed', 'failed', 'rolled_back'].includes(status) ? new Date() : null,
        rollbackAt: status === 'rolled_back' ? new Date() : null,
      },
    });

    // Se update completou, atualizar a máquina (colunas serão adicionadas após migração SQL)
    // TODO: Descomentar após ALTER TABLE no VPS adicionar agentVersion, agentType, lastUpdateAt, updateChannel
    // if (status === 'completed') {
    //   await prisma.rmmMachine.update({
    //     where: { id: machine.id },
    //     data: {
    //       agentVersion: new_version,
    //       agentType: agent_type,
    //       lastUpdateAt: new Date(),
    //     },
    //   });
    // }

    return NextResponse.json({ ok: true, historyId: history.id });
  } catch (error) {
    console.error('Error reporting agent update:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
