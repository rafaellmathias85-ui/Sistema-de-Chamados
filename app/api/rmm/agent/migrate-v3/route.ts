export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function buildMigrationScript(downloadUrl: string, sha256: string, nssmDownloadUrl: string): string {
  const lines = [
    '# ============================================================',
    '# [WinnerRMM] Migracao Automatica V1/V2 -> V3',
    '# ============================================================',
    '$ErrorActionPreference = "SilentlyContinue"',
    '$installDir = "C:\\ProgramData\\WinnerRMM"',
    '$serviceName = "WinnerRMMAgent"',
    '$logFile = "$installDir\\migration-v3.log"',
    '$backupDir = "$installDir\\backup-pre-v3"',
    '$newAgentFile = "$installDir\\agente_rmm_v3.ps1"',
    '$oldAgentFile = "$installDir\\agente_rmm.ps1"',
    '$stagingFile = "$installDir\\staging\\agente_rmm_v3_new.ps1"',
    '',
    'function Write-MigLog($msg) {',
    '    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"',
    '    Add-Content -Path $logFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue',
    '    Write-Output $msg',
    '}',
    '',
    'try {',
    '    New-Item -ItemType Directory -Force -Path $installDir | Out-Null',
    '    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null',
    '    New-Item -ItemType Directory -Force -Path "$installDir\\staging" | Out-Null',
    '    New-Item -ItemType Directory -Force -Path "$installDir\\modules" | Out-Null',
    '',
    '    Write-MigLog "=== INICIO DA MIGRACAO V3 ==="',
    '',
    '    # 1. Backup do agente atual',
    '    Write-MigLog "[1/7] Fazendo backup do agente atual..."',
    '    if (Test-Path $oldAgentFile) { Copy-Item $oldAgentFile "$backupDir\\agente_rmm_backup.ps1" -Force }',
    '    if (Test-Path $newAgentFile) { Copy-Item $newAgentFile "$backupDir\\agente_rmm_v3_backup.ps1" -Force }',
    '',
    '    # 2. Baixar agente V3',
    '    Write-MigLog "[2/7] Baixando agente V3..."',
    `    $downloadUrl = "${downloadUrl}"`,
    '    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    '    Invoke-WebRequest -Uri $downloadUrl -OutFile $stagingFile -UseBasicParsing -TimeoutSec 120 -ErrorAction Stop',
    '    if (-not (Test-Path $stagingFile) -or (Get-Item $stagingFile).Length -lt 1000) { throw "Download falhou" }',
    '    Write-MigLog "  Download OK: $((Get-Item $stagingFile).Length) bytes"',
    '',
    '    # 3. Verificar hash',
    '    Write-MigLog "[3/7] Verificando integridade..."',
    `    $expectedHash = "${sha256}"`,
    '    if ($expectedHash) {',
    '        $actualHash = (Get-FileHash -Path $stagingFile -Algorithm SHA256).Hash',
    '        if ($actualHash -ne $expectedHash) {',
    '            Remove-Item $stagingFile -Force -ErrorAction SilentlyContinue',
    '            throw "Hash invalido! Esperado=$expectedHash Recebido=$actualHash"',
    '        }',
    '        Write-MigLog "  Hash verificado OK"',
    '    }',
    '',
    '    # 4. Parar servico',
    '    Write-MigLog "[4/7] Parando servico..."',
    '    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '    if ($svc) { Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3 }',
    '',
    '    # 5. Verificar NSSM',
    '    Write-MigLog "[5/7] Verificando NSSM..."',
    '    $nssmPath = "$installDir\\nssm.exe"',
    '    if (-not (Test-Path $nssmPath)) {',
    `        $nssmUrl = "${nssmDownloadUrl}"`,
    '        try { Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop }',
    '        catch { Write-MigLog "  AVISO: Falha ao baixar NSSM" }',
    '    }',
    '',
    '    # 6. Instalar agente V3',
    '    Write-MigLog "[6/7] Instalando agente V3..."',
    '    Copy-Item -Path $stagingFile -Destination $newAgentFile -Force',
    '    Remove-Item $stagingFile -Force -ErrorAction SilentlyContinue',
    '    if (Test-Path $oldAgentFile) { Remove-Item $oldAgentFile -Force -ErrorAction SilentlyContinue }',
    '    Get-ChildItem "$installDir\\modules\\*.psm1" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue',
    '',
    '    if (Test-Path $nssmPath) {',
    '        $psExe = (Get-Command powershell.exe).Source',
    '        & $nssmPath remove $serviceName confirm 2>$null',
    '        Start-Sleep -Seconds 1',
    '        $appParams = "-ExecutionPolicy Bypass -NoProfile -File ""$newAgentFile"""',
    '        & $nssmPath install $serviceName $psExe $appParams',
    '        & $nssmPath set $serviceName AppDirectory $installDir',
    '        & $nssmPath set $serviceName DisplayName "Winner RMM Agent V3"',
    '        & $nssmPath set $serviceName Description "Winner Tecnologia - Agente RMM V3"',
    '        & $nssmPath set $serviceName Start SERVICE_AUTO_START',
    '        & $nssmPath set $serviceName AppExit Default Restart',
    '        & $nssmPath set $serviceName AppRestartDelay 10000',
    '        & $nssmPath set $serviceName AppStdout "$installDir\\service-stdout.log"',
    '        & $nssmPath set $serviceName AppStderr "$installDir\\service-stderr.log"',
    '        & $nssmPath set $serviceName AppRotateFiles 1',
    '        & $nssmPath set $serviceName AppRotateBytes 5242880',
    '        Write-MigLog "  NSSM reconfigurado para V3"',
    '    }',
    '',
    '    try { Add-MpPreference -ExclusionPath $installDir -ErrorAction SilentlyContinue } catch {}',
    '',
    '    # 7. Iniciar servico',
    '    Write-MigLog "[7/7] Iniciando servico V3..."',
    '    Start-Service -Name $serviceName -ErrorAction Stop',
    '    Start-Sleep -Seconds 10',
    '    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '    if ($svc -and $svc.Status -eq "Running") {',
    '        Write-MigLog "=== MIGRACAO CONCLUIDA COM SUCESSO ==="',
    '        Remove-Item "$installDir\\force_update" -Force -ErrorAction SilentlyContinue',
    '        Write-Output "MIGRACAO V3 CONCLUIDA COM SUCESSO"',
    '    } else { throw "Servico V3 nao iniciou" }',
    '',
    '} catch {',
    '    Write-MigLog "ERRO FATAL: $($_.Exception.Message)"',
    '    Write-MigLog "Executando ROLLBACK..."',
    '    try {',
    '        if (Test-Path "$backupDir\\agente_rmm_backup.ps1") { Copy-Item "$backupDir\\agente_rmm_backup.ps1" $oldAgentFile -Force }',
    '        if (Test-Path "$backupDir\\agente_rmm_v3_backup.ps1") { Copy-Item "$backupDir\\agente_rmm_v3_backup.ps1" $newAgentFile -Force }',
    '        $nssmPath2 = "$installDir\\nssm.exe"',
    '        if (Test-Path $nssmPath2) {',
    '            $targetFile = if (Test-Path $oldAgentFile) { $oldAgentFile } elseif (Test-Path $newAgentFile) { $newAgentFile } else { $null }',
    '            if ($targetFile) {',
    '                $psExe = (Get-Command powershell.exe).Source',
    '                & $nssmPath2 remove $serviceName confirm 2>$null',
    '                $appParams = "-ExecutionPolicy Bypass -NoProfile -File ""$targetFile"""',
    '                & $nssmPath2 install $serviceName $psExe $appParams',
    '                & $nssmPath2 set $serviceName AppDirectory $installDir',
    '                & $nssmPath2 set $serviceName Start SERVICE_AUTO_START',
    '                Start-Service -Name $serviceName -ErrorAction SilentlyContinue',
    '            }',
    '        }',
    '        Write-MigLog "=== ROLLBACK CONCLUIDO ==="',
    '    } catch { Write-MigLog "ERRO no rollback: $($_.Exception.Message)" }',
    '    Write-Output "ERRO NA MIGRACAO - ROLLBACK EXECUTADO: $($_.Exception.Message)"',
    '}',
  ];
  return lines.join('\r\n');
}

// POST /api/rmm/agent/migrate-v3
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { machineIds, allLegacy, companyId } = body;

    if (!allLegacy && !companyId && (!Array.isArray(machineIds) || machineIds.length === 0)) {
      return NextResponse.json({ error: 'machineIds[], companyId ou allLegacy=true obrigatório' }, { status: 400 });
    }

    // Filtrar apenas máquinas V1/V2
    const where: Record<string, unknown> = {
      OR: [
        { agentVersion: null },
        { agentVersion: '' },
        { agentVersion: { not: { startsWith: '3' } } },
      ],
    };

    if (companyId) {
      where.companyId = companyId;
    } else if (!allLegacy) {
      where.id = { in: machineIds };
    }

    const machines = await prisma.rmmMachine.findMany({
      where,
      select: {
        id: true, hostname: true, companyId: true, agentVersion: true, status: true,
        company: { select: { rmmToken: true } },
      },
    });

    if (machines.length === 0) {
      return NextResponse.json({ error: 'Nenhuma máquina V1/V2 encontrada para migração' }, { status: 404 });
    }

    // Template V3
    const templatePath = path.join(process.cwd(), 'public', 'rmm', 'WinnerRMM-AgentV3.ps1');
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Template do agente V3 não encontrado' }, { status: 500 });
    }

    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost || request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${proto}://${host}`;
    const nssmDownloadUrl = `${baseUrl}/rmm/nssm.exe`;

    let created = 0;
    const migrated: string[] = [];
    const skipped: string[] = [];

    for (const machine of machines) {
      // Dedup
      const existing = await prisma.rmmTask.findFirst({
        where: { machineId: machine.id, status: 'PENDING', command: { contains: 'MIGRACAO V3' } },
      });
      if (existing) { skipped.push(machine.hostname); continue; }

      const company = machine.company;
      if (!company?.rmmToken) { skipped.push(machine.hostname + ' (sem token)'); continue; }

      // Hash do agente personalizado
      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const apiUrl = baseUrl + '/api/rmm';
      const personalizedContent = templateContent
        .replace(/\{\{API_URL\}\}/g, apiUrl)
        .replace(/\{\{COMPANY_TOKEN\}\}/g, company.rmmToken)
        .replace(/\{\{FALLBACK_API_URL\}\}/g, '');

      const sha256 = crypto.createHash('sha256').update(personalizedContent, 'utf-8').digest('hex').toUpperCase();
      const downloadUrl = `${baseUrl}/api/rmm/agent?format=agent_ps1&companyId=${machine.companyId}&token=${company.rmmToken}`;

      const migrationCommand = buildMigrationScript(downloadUrl, sha256, nssmDownloadUrl);

      await prisma.rmmTask.create({
        data: {
          machineId: machine.id,
          command: migrationCommand,
          scriptType: 'powershell',
          status: 'PENDING',
          createdBy: session.user.id,
        },
      });
      created++;
      migrated.push(machine.hostname);
    }

    return NextResponse.json({
      ok: true,
      totalFound: machines.length,
      tasksCreated: created,
      skipped: skipped.length,
      machines: migrated,
      skippedMachines: skipped,
    });
  } catch (error) {
    console.error('Error creating migration tasks:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
