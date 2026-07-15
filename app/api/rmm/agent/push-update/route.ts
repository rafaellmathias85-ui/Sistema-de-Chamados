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

    // Script PS1 para forcar update do agente — detecta V4 (Program Files) e V3 (ProgramData)
    const updateCommand = `
# [WinnerRMM] Forcar atualizacao do agente (compativel V3 e V4)
$ErrorActionPreference = "SilentlyContinue"
try {
    $v4Dir = "C:\\Program Files\\WinnerRMM"
    $v3Dir = "C:\\ProgramData\\WinnerRMM"

    if (Test-Path "$v4Dir\\agente_rmm_v4.ps1") {
        # Agente V4: aciona self-update imediato via check-update API
        $stagingDir = Join-Path $v4Dir "staging"
        New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

        # Ler configuracao e token DPAPI
        $cfg = Get-Content (Join-Path $v4Dir "config.json") -Raw | ConvertFrom-Json
        $apiUrl = if ($cfg.API_URL) { $cfg.API_URL } else { "https://wticorp.com.br/api/rmm" }
        Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
        $tokenBytes = [System.IO.File]::ReadAllBytes((Join-Path $v4Dir "secure\\token.dat"))
        $token = [System.Text.Encoding]::UTF8.GetString(
            [System.Security.Cryptography.ProtectedData]::Unprotect($tokenBytes, $null, 'LocalMachine'))

        $currentVersion = if (Test-Path (Join-Path $v4Dir "agent_version")) { (Get-Content (Join-Path $v4Dir "agent_version") -EA SilentlyContinue).Trim() } else { "0" }

        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $body = @{ hostname=$env:COMPUTERNAME; current_version=$currentVersion } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "$apiUrl/agent/check-update" -Method POST -Body $body -ContentType "application/json" -Headers @{ Authorization="Bearer $token" } -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop

        if ($resp.update_available -eq $true -and $resp.download_url) {
            $stagingFile = Join-Path $stagingDir "_new_agente.ps1"
            Invoke-WebRequest -Uri $resp.download_url -OutFile $stagingFile -UseBasicParsing -TimeoutSec 120 -ErrorAction Stop
            if ($resp.sha256_hash) {
                $hash = (Get-FileHash -Path $stagingFile -Algorithm SHA256).Hash
                if ($hash -ne $resp.sha256_hash) { Remove-Item $stagingFile -Force -EA SilentlyContinue; throw "Hash divergente" }
            }
            Set-Content -Path (Join-Path $stagingDir "update.ready") -Value $stagingFile -Force
            Stop-ScheduledTask -TaskName "WinnerRMMAgent" -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Start-ScheduledTask -TaskName "WinnerRMMAgent" -ErrorAction SilentlyContinue
            Write-Output "V4: Update $($resp.new_version) baixado e agente reiniciado."
        } else {
            Write-Output "V4: Agente ja esta na versao mais recente ($currentVersion)."
        }
    } elseif (Test-Path $v3Dir) {
        # Agente V3: remove modulos em cache e sinaliza force_update
        $modulesDir = "$v3Dir\\modules"
        if (Test-Path $modulesDir) {
            Get-ChildItem "$modulesDir\\*.psm1" | Remove-Item -Force -ErrorAction SilentlyContinue
        }
        Set-Content -Path "$v3Dir\\force_update" -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Force
        Write-Output "V3: update sinalizado. Agente fara update na proxima iteracao."
    } else {
        Write-Output "AVISO: Nenhum agente RMM encontrado nesta maquina."
    }
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
