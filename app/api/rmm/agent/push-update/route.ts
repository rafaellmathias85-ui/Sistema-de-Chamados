export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/agent/push-update — Envia comando de atualização para máquinas online
// Cria tasks pendentes nas máquinas para forçar update no próximo checkin
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { machineIds, allOnline, companyId } = body;

    if (!allOnline && !companyId && (!Array.isArray(machineIds) || machineIds.length === 0)) {
      return NextResponse.json({ error: 'machineIds[], companyId ou allOnline=true obrigatório' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    if (companyId) {
      // Máquinas online da empresa específica
      where.companyId = companyId;
      where.lastCheckin = { gte: tenMinAgo };
    } else if (allOnline) {
      // Todas as máquinas online
      where.lastCheckin = { gte: tenMinAgo };
    } else {
      where.id = { in: machineIds };
    }

    const machines = await prisma.rmmMachine.findMany({
      where,
      select: { id: true, hostname: true },
    });

    if (machines.length === 0) {
      return NextResponse.json({ error: 'Nenhuma máquina encontrada' }, { status: 404 });
    }

    // Script PS1 para forcar update do agente (sem acentos para evitar encoding issues)
    const updateCommand = `
# [WinnerRMM] Forcar atualizacao do agente
try {
    $installDir = "C:\\ProgramData\\WinnerRMM"
    $modulesDir = "$installDir\\modules"
    
    # Remover modulos em cache para forcar redownload
    if (Test-Path $modulesDir) {
        Get-ChildItem "$modulesDir\\*.psm1" | Remove-Item -Force -ErrorAction SilentlyContinue
    }
    
    # Sinalizar para o agente fazer update na proxima iteracao
    Set-Content -Path "$installDir\\force_update" -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Force
    
    Write-Output "Update sinalizado com sucesso. Agente fara update na proxima iteracao."
} catch {
    Write-Output "ERRO: $($_.Exception.Message)"
}
`.trim();

    // Criar task de update para cada máquina
    let created = 0;
    for (const machine of machines) {
      // Verificar se já não existe task de update pendente
      const existing = await prisma.rmmTask.findFirst({
        where: {
          machineId: machine.id,
          status: 'PENDING',
          command: { contains: 'force_update' },
        },
      });
      if (existing) continue;

      await prisma.rmmTask.create({
        data: {
          machineId: machine.id,
          command: updateCommand,
          scriptType: 'powershell',
          status: 'PENDING',
          createdBy: session.user.id,
        },
      });
      created++;
    }

    return NextResponse.json({
      ok: true,
      machinesFound: machines.length,
      tasksCreated: created,
      machines: machines.map(m => m.hostname),
    });
  } catch (error) {
    console.error('Error pushing update:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
