export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/machines/[id]/reactivate
// Gera script PowerShell que reinicia o agente na maquina (para executar manualmente quando ela volta)
// Tambem enfileira um ping + agendamento de snapshot via task para tentar reviver.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const machine = await prisma.rmmMachine.findUnique({
      where: { id: params.id },
      select: { id: true, hostname: true, company: { select: { id: true, name: true, rmmToken: true } } },
    });

    if (!machine) {
      return NextResponse.json({ error: 'Maquina nao encontrada' }, { status: 404 });
    }

    // Cria uma task de diagnostico que sera puxada no proximo checkin (se agente estiver online)
    const pingCmd = [
      'Write-Host "[Winner RMM] Agente reativado via painel"',
      '$env:TEMP_LOG = "C:\\ProgramData\\WinnerRMM\\reactivate.log"',
      'Get-ScheduledTask -TaskName WinnerRMMAgent -ErrorAction SilentlyContinue | Start-ScheduledTask -ErrorAction SilentlyContinue',
      'Get-ScheduledTask -TaskName WinnerRMMWatchdog -ErrorAction SilentlyContinue | Start-ScheduledTask -ErrorAction SilentlyContinue',
      'Write-Host "OK - Agente e Watchdog reativados"',
    ].join('\n');

    await prisma.rmmTask.create({
      data: {
        machineId: machine.id,
        command: pingCmd,
        scriptType: 'powershell',
        status: 'PENDING',
      },
    }).catch(() => {});

    // Script remoto de recuperacao (o admin pode rodar via PsExec/Intune quando o agente esta completamente caido)
    const recoveryScript = `# Winner RMM - Script de Recuperacao Remota
# Execute como Administrador na maquina "${machine.hostname}"
$InstallDir = "C:\\ProgramData\\WinnerRMM"
$TaskName = "WinnerRMMAgent"
$WatchdogTaskName = "WinnerRMMWatchdog"
$AgentFile = "$InstallDir\\agente_rmm.ps1"

Write-Host "[RMM] Verificando agente..." -ForegroundColor Cyan
if (-not (Test-Path $AgentFile)) {
    Write-Host "[ERRO] Agente nao instalado em $AgentFile" -ForegroundColor Red
    Write-Host "Execute o instalador novamente a partir do painel Winner." -ForegroundColor Yellow
    exit 1
}

# Parar agente se estiver rodando e re-iniciar
$proc = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*agente_rmm.ps1*" }
if ($proc) {
    Write-Host "[RMM] Parando processo existente (PID $($proc.ProcessId))..." -ForegroundColor Yellow
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Re-habilitar e iniciar
Enable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

Enable-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue

Start-Sleep -Seconds 3
$proc2 = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*agente_rmm.ps1*" }
if ($proc2) {
    Write-Host "[OK] Agente RMM rodando (PID $($proc2.ProcessId))" -ForegroundColor Green
} else {
    Write-Host "[AVISO] Agente ainda nao confirmado. Verifique:" -ForegroundColor Yellow
    Write-Host "  - Log: $InstallDir\\rmm_agent.log" -ForegroundColor Gray
    Write-Host "  - Tarefa Agendada: Get-ScheduledTask -TaskName $TaskName" -ForegroundColor Gray
}
`;

    return NextResponse.json({
      ok: true,
      machineId: machine.id,
      hostname: machine.hostname,
      companyName: machine.company.name,
      recoveryScript,
      message: 'Ping enviado. Se o agente estiver offline, rode o recoveryScript manualmente na maquina.',
    });
  } catch (error) {
    console.error('RMM reactivate error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
