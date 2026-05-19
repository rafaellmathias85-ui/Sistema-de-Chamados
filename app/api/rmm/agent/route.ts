export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ============================================================
// Carrega o Agente V3 do disco e substitui placeholders
// O template fica em public/rmm/WinnerRMM-AgentV3.ps1
// Melhorias: NSSM service, dual-server fallback, Write-Log global,
// DACL anti-tamper, agentVersion, self-update, security events fix
// ============================================================
function loadAgentV3(apiUrl: string, companyToken: string, fallbackApiUrl: string = ''): string {
  const templatePath = path.join(process.cwd(), 'public', 'rmm', 'WinnerRMM-AgentV3.ps1');
  const template = fs.readFileSync(templatePath, 'utf-8');
  return template
    .replace(/\{\{API_URL\}\}/g, apiUrl)
    .replace(/\{\{COMPANY_TOKEN\}\}/g, companyToken)
    .replace(/\{\{FALLBACK_API_URL\}\}/g, fallbackApiUrl);
}

// Carrega o Watchdog V3 do disco e substitui placeholders
function loadWatchdogV3(apiUrl: string, companyToken: string, fallbackApiUrl: string = ''): string {
  const templatePath = path.join(process.cwd(), 'public', 'rmm', 'WinnerRMM-Watchdog.ps1');
  const template = fs.readFileSync(templatePath, 'utf-8');
  return template
    .replace(/\{\{API_URL\}\}/g, apiUrl)
    .replace(/\{\{COMPANY_TOKEN\}\}/g, companyToken)
    .replace(/\{\{FALLBACK_API_URL\}\}/g, fallbackApiUrl);
}

// Retrocompatibilidade: carrega V2 se necessário
function loadAgentV2(apiUrl: string, companyToken: string): string {
  const templatePath = path.join(process.cwd(), 'public', 'rmm', 'WinnerRMM-AgentV2.ps1');
  const template = fs.readFileSync(templatePath, 'utf-8');
  return template
    .replace(/\{\{API_URL\}\}/g, apiUrl)
    .replace(/\{\{COMPANY_TOKEN\}\}/g, companyToken);
}

// ============================================================
// Instalador Completo V3 PowerShell (autossuficiente)
// Instala agente como Windows Service via NSSM + watchdog como Scheduled Task
// Melhorias: SCM recovery (A), Execution Policy bypass (B), DACL (F), ps2exe (H)
// ============================================================
function generateFullInstaller(apiUrl: string, companyToken: string, companyName: string): string {
  // Computar fallback URL
  const fallbackApiUrl = apiUrl.includes('wticorp.com.br')
    ? 'https://winner-tecnologia-si-aq2c13.abacusai.app/api/rmm'
    : apiUrl.includes('abacusai.app')
      ? 'https://www.wticorp.com.br/api/rmm'
      : '';

  const agentContent = loadAgentV3(apiUrl, companyToken, fallbackApiUrl);
  const watchdogContent = loadWatchdogV3(apiUrl, companyToken, fallbackApiUrl);

  // Base URLs para download de assets estaticos (public/)
  // apiUrl = https://www.wticorp.com.br/api/rmm → baseUrl = https://www.wticorp.com.br
  const baseUrl = apiUrl.replace(/\/api\/rmm\/?$/, '');
  const fallbackBaseUrl = fallbackApiUrl ? fallbackApiUrl.replace(/\/api\/rmm\/?$/, '') : '';

  // ATENCAO: o agente e embutido como here-string PowerShell @' ... '@ (literal, sem expansao
  // de variaveis). NAO usar Base64+FromBase64String pois EDR/AV detectam esse padrao.
  const escapedAgent = agentContent.replace(/^'@/gm, '`@');
  const escapedWatchdog = watchdogContent.replace(/^'@/gm, '`@');

  return `# ============================================================
# Instalador RMM V3 - Winner Tecnologia
# Empresa: ${companyName}
# Arquitetura: Windows Service (NSSM) + Watchdog (Scheduled Task)
# Execute como Administrador (Botao direito > Executar como Admin)
# ============================================================

$ErrorActionPreference = "Stop"
$InstallDir = "C:\\ProgramData\\WinnerRMM"
$StagingDir = "$InstallDir\\staging"
$ModulesDir = "$InstallDir\\modules"
$AgentFile = "$InstallDir\\agente_rmm.ps1"
$WatchdogFile = "$InstallDir\\watchdog.ps1"
$NssmExe = "$InstallDir\\nssm.exe"
$ServiceName = "WinnerRMMService"
$WatchdogTaskName = "WinnerRMMWatchdog"
$NssmUrls = @(
    "${baseUrl}/rmm/nssm-2.24-win64.zip",
    "${fallbackBaseUrl}/rmm/nssm-2.24-win64.zip",
    "https://github.com/ONLYOFFICE/nssm/releases/download/v2.24/nssm_x64.zip",
    "https://nssm.cc/release/nssm-2.24.zip"
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Winner Tecnologia - Instalador RMM V3" -ForegroundColor Cyan
Write-Host "  Empresa: ${companyName}" -ForegroundColor Yellow
Write-Host "  Modo: Windows Service + Watchdog" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar privilegios de administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERRO] Este script deve ser executado como Administrador!" -ForegroundColor Red
    Write-Host "Clique com botao direito > Executar como Administrador" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Melhoria B: Garantir Execution Policy
Write-Host "[1/7] Configurando Execution Policy..." -ForegroundColor Cyan
try { Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope LocalMachine -Force -ErrorAction SilentlyContinue } catch {}
try { Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force } catch {}

Write-Host "[2/7] Criando diretorios de instalacao..." -ForegroundColor Cyan
foreach ($dir in @($InstallDir, $StagingDir, $ModulesDir)) {
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

# Limpar instalacao anterior (Scheduled Tasks do V2)
Write-Host "       Removendo instalacao V2 anterior (se existir)..." -ForegroundColor DarkGray
$oldTasks = @("WinnerRMMAgent", "WinnerRMMWatchdog")
foreach ($t in $oldTasks) {
    $existing = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "       Tarefa V2 '$t' removida" -ForegroundColor DarkGray
    }
}
# Parar service V3 anterior se existir
$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
    Write-Host "       Parando service anterior..." -ForegroundColor DarkGray
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (Test-Path $NssmExe) {
        & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }
}

Write-Host "[3/7] Gravando agente RMM V3..." -ForegroundColor Cyan
$agentContent = @'
${escapedAgent}
'@
Set-Content -LiteralPath $AgentFile -Value $agentContent -Encoding UTF8 -Force

Write-Host "[4/7] Gravando watchdog..." -ForegroundColor Cyan
$watchdogContent = @'
${escapedWatchdog}
'@
Set-Content -LiteralPath $WatchdogFile -Value $watchdogContent -Encoding UTF8 -Force

Write-Host "[5/7] Baixando e instalando NSSM (Service Manager)..." -ForegroundColor Cyan

# Funcao universal de extracao ZIP (compativel PS 2.0+)
function Extract-ZipCompat {
    param([string]$ZipFile, [string]$Destination)
    if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    # Metodo 1: Expand-Archive (PS 5.0+)
    if (Get-Command Expand-Archive -ErrorAction SilentlyContinue) {
        Expand-Archive -Path $ZipFile -DestinationPath $Destination -Force
        return
    }
    # Metodo 2: .NET System.IO.Compression.ZipFile (.NET 4.5+)
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipFile, $Destination)
        return
    } catch {}
    # Metodo 3: Shell.Application COM (funciona ate no PS 2.0 / Windows 7)
    $shell = New-Object -ComObject Shell.Application
    $zip = $shell.NameSpace((Resolve-Path $ZipFile).Path)
    $dest = $shell.NameSpace((Resolve-Path $Destination).Path)
    $dest.CopyHere($zip.Items(), 0x14)
}

if (!(Test-Path $NssmExe)) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $nssmDownloaded = $false
    foreach ($nssmUrl in $NssmUrls) {
        try {
            Write-Host "       Tentando: $nssmUrl" -ForegroundColor DarkGray
            $zipPath = "$InstallDir\\nssm.zip"
            Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            if ((Get-Item $zipPath).Length -lt 10000) {
                throw "Download corrompido (tamanho muito pequeno)"
            }
            $extractDir = "$InstallDir\\nssm_extract"
            Extract-ZipCompat -ZipFile $zipPath -Destination $extractDir
            $found = Get-ChildItem -Path $extractDir -Recurse -Filter "nssm.exe" | Where-Object {
                $_.DirectoryName -match "win64"
            } | Select-Object -First 1
            if (-not $found) {
                $found = Get-ChildItem -Path $extractDir -Recurse -Filter "nssm.exe" | Select-Object -First 1
            }
            if ($found) {
                Copy-Item -Path $found.FullName -Destination $NssmExe -Force
                Write-Host "       NSSM instalado com sucesso" -ForegroundColor Green
                $nssmDownloaded = $true
            } else {
                throw "NSSM.exe nao encontrado no ZIP"
            }
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
            break
        } catch {
            Write-Host "       [FALHA] $($_.Exception.Message)" -ForegroundColor Yellow
            Remove-Item "$InstallDir\\nssm.zip" -Force -ErrorAction SilentlyContinue
            Remove-Item "$InstallDir\\nssm_extract" -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not $nssmDownloaded) {
        Write-Host "       [AVISO] Nenhuma URL do NSSM funcionou. Usando fallback sc.exe..." -ForegroundColor Yellow
    }
}

Write-Host "[6/7] Registrando Windows Service..." -ForegroundColor Cyan
if (Test-Path $NssmExe) {
    # Instalar via NSSM (preferido)
    & $NssmExe install $ServiceName "powershell.exe" "-ExecutionPolicy Bypass -NonInteractive -File \`"$AgentFile\`"" 2>&1 | Out-Null
    & $NssmExe set $ServiceName DisplayName "Winner RMM Agent" 2>&1 | Out-Null
    & $NssmExe set $ServiceName Description "Agente de monitoramento remoto - Winner Tecnologia" 2>&1 | Out-Null
    & $NssmExe set $ServiceName Start SERVICE_AUTO_START 2>&1 | Out-Null
    & $NssmExe set $ServiceName ObjectName LocalSystem 2>&1 | Out-Null
    & $NssmExe set $ServiceName AppStdout "$InstallDir\\service_stdout.log" 2>&1 | Out-Null
    & $NssmExe set $ServiceName AppStderr "$InstallDir\\service_stderr.log" 2>&1 | Out-Null
    & $NssmExe set $ServiceName AppRotateFiles 1 2>&1 | Out-Null
    & $NssmExe set $ServiceName AppRotateBytes 5242880 2>&1 | Out-Null
    Write-Host "       Service registrado via NSSM" -ForegroundColor Green
} else {
    # Fallback: registrar via sc.exe + wrapper script
    Write-Host "       Usando sc.exe como fallback..." -ForegroundColor Yellow
    $wrapperFile = "$InstallDir\\service_wrapper.bat"
    Set-Content -Path $wrapperFile -Value "@echo off\`r\`npowershell.exe -ExecutionPolicy Bypass -NonInteractive -File \`"$AgentFile\`"" -Encoding ASCII
    & sc.exe create $ServiceName binPath= "cmd.exe /c \`"$wrapperFile\`"" start= auto DisplayName= "Winner RMM Agent" 2>&1 | Out-Null
    & sc.exe description $ServiceName "Agente de monitoramento remoto - Winner Tecnologia" 2>&1 | Out-Null
}

# Melhoria A: Configurar SCM failure recovery (restart automatico)
# 1a falha: restart apos 10s | 2a: 30s | 3a: 60s | Reset counter apos 24h
& sc.exe failure $ServiceName reset= 86400 actions= restart/10000/restart/30000/restart/60000 2>&1 | Out-Null
Write-Host "       SCM failure recovery configurado (10s/30s/60s)" -ForegroundColor Green

# Iniciar o service
& sc.exe start $ServiceName 2>&1 | Out-Null
Start-Sleep -Seconds 3

# Registrar watchdog como Scheduled Task (redundancia)
Write-Host "[7/7] Registrando watchdog (Scheduled Task)..." -ForegroundColor Cyan
$existingWD = Get-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
if ($existingWD) {
    Unregister-ScheduledTask -TaskName $WatchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
}
$wdAction = New-ScheduledTaskAction -Execute "powershell.exe" \`
    -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File \`"$WatchdogFile\`""
$wdTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) \`
    -RepetitionInterval (New-TimeSpan -Minutes 15) \`
    -RepetitionDuration (New-TimeSpan -Days 825)
$wdSettings = New-ScheduledTaskSettingsSet \`
    -Hidden \`
    -AllowStartIfOnBatteries \`
    -DontStopIfGoingOnBatteries \`
    -StartWhenAvailable \`
    -MultipleInstances IgnoreNew
$wdPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
Register-ScheduledTask \`
    -TaskName $WatchdogTaskName \`
    -Action $wdAction \`
    -Trigger $wdTrigger \`
    -Settings $wdSettings \`
    -Principal $wdPrincipal \`
    -Description "Watchdog do agente RMM V3 - Winner Tecnologia" \`
    -Force | Out-Null
Start-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue

# Melhoria F: Aplicar DACL anti-tamper no diretorio
Write-Host "       Aplicando protecao anti-tamper (DACL)..." -ForegroundColor DarkGray
try {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $ruleSystem = New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\\SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($ruleSystem)
    $ruleAdmins = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\\Administrators", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($ruleAdmins)
    Set-Acl -Path $InstallDir -AclObject $acl -ErrorAction SilentlyContinue
} catch {}

# Verificar status final
$svcCheck = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$svcStatus = if ($svcCheck -and $svcCheck.Status -eq 'Running') { "RODANDO" } else { "VERIFICAR" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Instalacao V3 concluida!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Service: $ServiceName ($svcStatus)" -ForegroundColor $(if ($svcStatus -eq "RODANDO") { "Green" } else { "Yellow" })
Write-Host "  Watchdog: $WatchdogTaskName (a cada 15 min)" -ForegroundColor Gray
Write-Host "  Diretorio: $InstallDir" -ForegroundColor Gray
Write-Host "  Log: $InstallDir\\rmm_agent.log" -ForegroundColor Gray
Write-Host ""
Write-Host "  Protecoes ativas:" -ForegroundColor Cyan
Write-Host "    - Windows Service com auto-restart pelo SCM" -ForegroundColor Gray
Write-Host "    - Watchdog independente recria service se deletado" -ForegroundColor Gray
Write-Host "    - DACL anti-tamper no diretorio" -ForegroundColor Gray
Write-Host "    - Dual-server fallback" -ForegroundColor Gray
Write-Host ""

# Para deploy silencioso via GPO/Intune, remova a linha abaixo:
Read-Host "Pressione Enter para fechar"
`;
}

// Script de desinstalação V3 (remove service + task + arquivos)
function generateUninstaller(): string {
  return `# ============================================================
# Desinstalador RMM V3 - Winner Tecnologia
# Remove: Windows Service + Scheduled Tasks + NSSM + arquivos
# Execute como Administrador
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$InstallDir = "C:\\ProgramData\\WinnerRMM"
$NssmExe = "$InstallDir\\nssm.exe"
$ServiceName = "WinnerRMMService"
$WatchdogTaskName = "WinnerRMMWatchdog"
# Compat V2
$OldTaskName = "WinnerRMMAgent"
$OldWatchdogTaskName = "WinnerRMMWatchdog"

Write-Host ""
Write-Host "Winner Tecnologia - Desinstalador RMM" -ForegroundColor Yellow
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERRO] Execute como Administrador!" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# 1. Parar e remover Windows Service (V3)
Write-Host "[1/4] Removendo Windows Service..." -ForegroundColor Cyan
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (Test-Path $NssmExe) {
        & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
    } else {
        & sc.exe delete $ServiceName 2>&1 | Out-Null
    }
    Write-Host "       Service removido" -ForegroundColor Green
} else {
    Write-Host "       Service nao encontrado (OK)" -ForegroundColor DarkGray
}

# 2. Remover Scheduled Tasks (V2 + V3 watchdog)
Write-Host "[2/4] Removendo Scheduled Tasks..." -ForegroundColor Cyan
$tasks = @($WatchdogTaskName, $OldTaskName, $OldWatchdogTaskName)
foreach ($t in $tasks) {
    $existing = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "       Task '$t' removida" -ForegroundColor Green
    }
}

# 3. Matar processos remanescentes
Write-Host "[3/4] Finalizando processos..." -ForegroundColor Cyan
Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
    $_.CommandLine -like "*WinnerRMM*" -or $_.CommandLine -like "*agente_rmm*"
} | ForEach-Object { $_.Terminate() } 2>&1 | Out-Null

# 4. Restaurar DACL e remover arquivos
Write-Host "[4/4] Removendo arquivos..." -ForegroundColor Cyan
try {
    # Restaurar permissoes para poder deletar
    $acl = Get-Acl $InstallDir -ErrorAction SilentlyContinue
    if ($acl) {
        $acl.SetAccessRuleProtection($false, $true)
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.AddAccessRule($rule)
        Set-Acl -Path $InstallDir -AclObject $acl -ErrorAction SilentlyContinue
    }
} catch {}
Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Desinstalacao completa!" -ForegroundColor Green
Write-Host "Todos os componentes foram removidos." -ForegroundColor Gray
Read-Host "Pressione Enter para fechar"
`;
}

// ============================================================
// Template do Agente Python (mantido para quem preferir)
// ============================================================
function generateAgentPython(apiUrl: string, companyToken: string): string {
  return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agente RMM - Winner Tecnologia
Coleta dados da maquina e envia para o servidor.
Requer: pip install psutil requests wmi (wmi apenas Windows)
"""
import platform, psutil, os, requests, time, subprocess, socket, json
from datetime import datetime

# ======= CONFIGURACAO (NAO ALTERAR) =======
API_URL = "${apiUrl}"
COMPANY_TOKEN = "${companyToken}"
CHECKIN_INTERVAL = 60  # segundos
# ===========================================

def get_disk_info():
    try:
        if platform.system() == 'Windows':
            import wmi
            c = wmi.WMI()
            disk = c.Win32_DiskDrive()[0]
            return disk.Model, f"{round(int(disk.Size) / (1024**3), 2)} GB"
        else:
            total = psutil.disk_usage('/').total
            return "Disco Local", f"{round(total / (1024**3), 2)} GB"
    except Exception:
        return "Desconhecido", "Desconhecido"

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "0.0.0.0"

def get_public_ip():
    try:
        return requests.get("https://api.ipify.org?format=json", timeout=5).json().get("ip")
    except Exception:
        return None

def get_cpu_model():
    try:
        if platform.system() == 'Windows':
            import wmi
            c = wmi.WMI()
            return c.Win32_Processor()[0].Name.strip()
        else:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if "model name" in line:
                        return line.split(":")[1].strip()
    except Exception:
        pass
    return "Desconhecido"

def get_antivirus():
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(
                ["powershell", "-Command",
                 "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object -ExpandProperty displayName"],
                capture_output=True, text=True, timeout=10
            )
            names = [n.strip() for n in result.stdout.strip().split("\\n") if n.strip()]
            return ", ".join(names) if names else "Nenhum detectado"
    except Exception:
        pass
    return "Nao identificado"

def get_logged_user():
    try:
        username = os.getlogin()
        if platform.system() == 'Windows':
            result = subprocess.run(["dsregcmd", "/status"], capture_output=True, text=True, timeout=10)
            if "AzureAdJoined : YES" in result.stdout:
                for line in result.stdout.split("\\n"):
                    if "TenantName" in line:
                        tenant = line.split(":")[1].strip()
                        return f"{username} (Entra ID: {tenant})"
            import wmi
            c = wmi.WMI()
            cs = c.Win32_ComputerSystem()[0]
            if cs.DomainRole >= 3 or (cs.Domain and cs.Domain != platform.node()):
                return f"{username} (AD: {cs.Domain})"
        return f"{username} (Local)"
    except Exception:
        return os.getenv("USERNAME", "desconhecido")

def get_top_processes():
    try:
        procs = []
        for p in sorted(psutil.process_iter(['pid','name','cpu_percent','memory_info','username']),
                        key=lambda x: (x.info.get('memory_info') or type('',(),{'rss':0})).rss, reverse=True)[:50]:
            info = p.info
            mem = info.get('memory_info')
            procs.append({"pid": info['pid'], "name": info['name'],
                         "cpu": info.get('cpu_percent',0), "mem": mem.rss if mem else 0,
                         "user": info.get('username','')})
        return procs
    except Exception:
        return []

def get_services():
    try:
        if platform.system() == 'Windows':
            import wmi
            c = wmi.WMI()
            return [{"name": s.Name, "displayName": s.DisplayName,
                     "status": s.State, "startType": s.StartMode}
                    for s in c.Win32_Service()[:200]]
    except Exception:
        pass
    return []

def get_teamviewer_id():
    try:
        if platform.system() == 'Windows':
            import winreg
            for hive_path in [r"SOFTWARE\\TeamViewer", r"SOFTWARE\\WOW6432Node\\TeamViewer"]:
                try:
                    key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, hive_path)
                    val, _ = winreg.QueryValueEx(key, "ClientID")
                    winreg.CloseKey(key)
                    if val: return str(val)
                except: pass
        try:
            import requests as rq
            resp = rq.get("http://localhost:5939/api/v1/status", timeout=3)
            data = resp.json()
            if data.get("teamviewer_id"): return str(data["teamviewer_id"])
        except: pass
    except: pass
    return None

def get_installed_apps():
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(
                ["powershell", "-Command",
                 "Get-ItemProperty 'HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\*','HKLM:\\\\SOFTWARE\\\\Wow6432Node\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\*' | Where-Object {$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30
            )
            if result.stdout.strip():
                apps = json.loads(result.stdout.strip())
                if isinstance(apps, dict): apps = [apps]
                return [{"name":a.get("DisplayName",""), "version":a.get("DisplayVersion",""), "publisher":a.get("Publisher","")} for a in apps[:300]]
    except Exception:
        pass
    return []

def collect_data():
    disk_model, disk_size = get_disk_info()
    cpu_pct = psutil.cpu_percent(interval=1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    boot = datetime.fromtimestamp(psutil.boot_time())
    return {
        "token": COMPANY_TOKEN,
        "hostname": platform.node(),
        "user": get_logged_user(),
        "os": platform.platform(),
        "ram": f"{round(mem.total / (1024**3), 2)} GB",
        "disk_model": disk_model,
        "disk_size": disk_size,
        "status": "Ligado",
        "last_login": boot.strftime("%Y-%m-%d %H:%M:%S"),
        "ip_address": get_local_ip(),
        "public_ip": get_public_ip(),
        "cpu_model": get_cpu_model(),
        "cpu_usage": round(cpu_pct, 1),
        "ram_usage": round(mem.percent, 1),
        "disk_usage": round(disk.percent, 1),
        "gpu_info": None,
        "antivirus_status": get_antivirus(),
        "last_boot_time": boot.strftime("%Y-%m-%dT%H:%M:%S"),
        "teamviewer_id": get_teamviewer_id(),
        "services": get_services(),
        "installed_apps": get_installed_apps(),
    }

def send_snapshot(machine_id):
    try:
        snapshot = {
            "machineId": machine_id,
            "cpuPercent": round(psutil.cpu_percent(interval=0), 1),
            "memoryPercent": round(psutil.virtual_memory().percent, 1),
            "processesJson": json.dumps(get_top_processes()),
            "servicesJson": json.dumps(get_services()),
            "installedAppsJson": json.dumps(get_installed_apps()),
        }
        requests.post(f"{API_URL}/snapshots", json=snapshot, timeout=30)
    except Exception:
        pass

def get_desktop_path():
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(["powershell", "-Command",
                "try { $u = (quser 2>$null | Select -Skip 1 | Select -First 1) -replace '\\\\s{2,}',',' | ConvertFrom-Csv -Header U; $n=$u.U -replace '^>',''; [IO.Path]::Combine('C:\\\\Users',$n,'Desktop') } catch { [Environment]::GetFolderPath('Desktop') }"],
                capture_output=True, text=True, timeout=5)
            p = result.stdout.strip()
            if p and os.path.isdir(p): return p
    except Exception: pass
    return os.path.join(os.path.expanduser("~"), "Desktop")

def detect_script_type(content):
    import re
    m = re.match(r'^@@SCRIPTTYPE:(\\w+)@@', content)
    if m: return m.group(1)
    trimmed = content.lstrip()
    if re.match(r'^@echo\\s+off', trimmed, re.I) or re.match(r'^rem\\s', trimmed, re.I) or re.match(r'^set\\s+\\w+=', trimmed): return 'cmd'
    if re.match(r"^'\\s*VBScript", trimmed) or re.match(r'^(Dim|Set|WScript|Option\\s+Explicit|Const)\\s', trimmed): return 'vbscript'
    if re.match(r'^(import |from |def |print\\(|#!/usr/bin.*python)', trimmed): return 'python'
    return 'powershell'

def execute_script_content(raw_command, server_script_type=None):
    import re, tempfile
    clean = re.sub(r'^\\s*@@SCRIPTTYPE:\\w+@@\\s*', '', raw_command)
    script_type = server_script_type if server_script_type and server_script_type != 'auto' else detect_script_type(clean)
    desktop = get_desktop_path()
    temp_dir = os.path.join(tempfile.gettempdir(), "WinnerRMM_Scripts")
    os.makedirs(temp_dir, exist_ok=True)
    
    ext_map = {'cmd': '.bat', 'vbscript': '.vbs', 'python': '.py', 'powershell': '.ps1'}
    ext = ext_map.get(script_type, '.ps1')
    temp_file = os.path.join(temp_dir, f"task_{int(time.time())}{ext}")
    
    try:
        with open(temp_file, 'w', encoding='utf-8') as f:
            if script_type == 'cmd':
                f.write(f'@echo off\\nset "DesktopPath={desktop}"\\n')
            elif script_type == 'python':
                f.write(f"import os\\nDesktopPath = r'{desktop}'\\nos.environ['DESKTOP_PATH'] = DesktopPath\\n")
            elif script_type == 'powershell':
                f.write(f"$DesktopPath = '{desktop}'\\n")
            f.write(clean)
        
        cmd_map = {
            'cmd': ["cmd.exe", "/c", temp_file],
            'vbscript': ["cscript.exe", "//NoLogo", temp_file],
            'python': ["python", temp_file] if platform.system() == 'Windows' else ["python3", temp_file],
            'powershell': ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", temp_file],
        }
        cmd = cmd_map.get(script_type, ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", temp_file])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        output = ""
        if result.stdout: output += result.stdout
        if result.stderr: output += f"\\n[STDERR]\\n{result.stderr}"
        if not output.strip(): output = f"(sem saida - exit code: {result.returncode})"
        return output, script_type
    except subprocess.TimeoutExpired:
        return f"Timeout: script {script_type} excedeu 120 segundos", script_type
    except Exception as e:
        return f"Erro [{script_type}]: {str(e)}", script_type
    finally:
        try: os.remove(temp_file)
        except: pass

def check_and_execute_tasks(machine_id):
    try:
        resp = requests.get(
            f"{API_URL}/tasks/{machine_id}",
            headers={"Authorization": f"Bearer {COMPANY_TOKEN}"},
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            task = data.get('task')
            if task:
                task_id = task['id']
                raw_command = task['command']
                server_type = task.get('scriptType', 'auto')
                try:
                    output, stype = execute_script_content(raw_command, server_type)
                    requests.post(f"{API_URL}/report/{task_id}", json={"output": output}, timeout=30)
                except Exception as e:
                    requests.post(f"{API_URL}/report/{task_id}", json={"error": str(e)}, timeout=15)
    except Exception:
        pass

def main():
    machine_id = None
    loop_count = 0
    while True:
        try:
            data = collect_data()
            resp = requests.post(f"{API_URL}/checkin", json=data, timeout=15)
            if resp.status_code == 200:
                result = resp.json()
                machine_id = result.get('machine_id', machine_id)
                if machine_id:
                    check_and_execute_tasks(machine_id)
                    if loop_count % 5 == 0:
                        send_snapshot(machine_id)
            loop_count += 1
        except Exception:
            pass
        time.sleep(CHECKIN_INTERVAL)

if __name__ == "__main__":
    main()
`;
}

// POST /api/rmm/agent — Gerar e baixar agente/instalador
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { companyId, format } = body; // format: 'installer' | 'agent_ps1' | 'agent_py' | 'uninstall'

    if (!companyId) {
      return NextResponse.json({ error: 'Empresa obrigatória' }, { status: 400 });
    }

    let company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Gerar token se não existir
    if (!company.rmmToken) {
      const token = crypto.randomBytes(32).toString('hex');
      company = await prisma.company.update({
        where: { id: companyId },
        data: { rmmToken: token },
      });
    }

    // Derivar URL da API a partir do request (funciona em qualquer ambiente: Abacus, VPS, etc.)
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost || request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${proto}://${host}`;
    const apiUrl = (baseUrl || process.env.NEXTAUTH_URL || 'https://www.wticorp.com.br') + '/api/rmm';
    const safeName = company.name.replace(/[^a-zA-Z0-9]/g, '_');

    if (format === 'uninstall') {
      const content = generateUninstaller();
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="desinstalar_rmm.ps1"`,
        },
      });
    }

    if (format === 'agent_ps1') {
      const fallbackApiUrl = apiUrl.includes('wticorp.com.br')
        ? 'https://winner-tecnologia-si-aq2c13.abacusai.app/api/rmm'
        : apiUrl.includes('abacusai.app') ? 'https://www.wticorp.com.br/api/rmm' : '';
      const content = loadAgentV3(apiUrl, company.rmmToken!, fallbackApiUrl);
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="agente_rmm_v3_${safeName}.ps1"`,
        },
      });
    }

    // Melhoria H: Script para compilar agente como EXE (ps2exe)
    if (format === 'ps2exe') {
      const fallbackApiUrl = apiUrl.includes('wticorp.com.br')
        ? 'https://winner-tecnologia-si-aq2c13.abacusai.app/api/rmm'
        : apiUrl.includes('abacusai.app') ? 'https://www.wticorp.com.br/api/rmm' : '';
      const agentContent = loadAgentV3(apiUrl, company.rmmToken!, fallbackApiUrl);
      const escapedForPs2exe = agentContent.replace(/^'@/gm, '`@');
      const ps2exeScript = `# ============================================================
# Compilador de Agente RMM para EXE - Winner Tecnologia
# Empresa: ${company.name}
# Requer: Install-Module ps2exe (executar uma vez)
# Execute como Administrador
# ============================================================

$ErrorActionPreference = "Stop"
$OutputDir = "$env:TEMP\\WinnerRMM_Build"
$AgentPs1 = "$OutputDir\\agente_rmm.ps1"
$AgentExe = "$OutputDir\\WinnerRMM_Agent.exe"

Write-Host "Winner Tecnologia - Compilador de Agente RMM" -ForegroundColor Cyan
Write-Host ""

# Verificar/instalar ps2exe
if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Write-Host "Instalando ps2exe..." -ForegroundColor Yellow
    Install-Module ps2exe -Force -Scope CurrentUser
}

# Criar diretorio de build
New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null

# Gravar agente
$agentContent = @'
${escapedForPs2exe}
'@
Set-Content -LiteralPath $AgentPs1 -Value $agentContent -Encoding UTF8 -Force

# Compilar para EXE
Write-Host "Compilando para EXE..." -ForegroundColor Cyan
Invoke-ps2exe -inputFile $AgentPs1 -outputFile $AgentExe \`
    -title "Winner RMM Agent" \`
    -description "Agente de monitoramento remoto - Winner Tecnologia" \`
    -company "Winner Tecnologia" \`
    -version "3.0.0" \`
    -noConsole \`
    -requireAdmin

if (Test-Path $AgentExe) {
    Write-Host ""
    Write-Host "Compilacao concluida!" -ForegroundColor Green
    Write-Host "EXE gerado em: $AgentExe" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Para instalar como service, copie o EXE para C:\\ProgramData\\WinnerRMM\\" -ForegroundColor Yellow
    Write-Host "e use NSSM: nssm install WinnerRMMService $AgentExe" -ForegroundColor Yellow
    explorer.exe /select, $AgentExe
} else {
    Write-Host "Erro na compilacao!" -ForegroundColor Red
}

Read-Host "Pressione Enter para fechar"
`;
      return new NextResponse(ps2exeScript, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="Compilar_Agente_EXE_${safeName}.ps1"`,
        },
      });
    }

    // Download do watchdog separado
    if (format === 'watchdog') {
      const fallbackApiUrl = apiUrl.includes('wticorp.com.br')
        ? 'https://winner-tecnologia-si-aq2c13.abacusai.app/api/rmm'
        : apiUrl.includes('abacusai.app') ? 'https://www.wticorp.com.br/api/rmm' : '';
      const content = loadWatchdogV3(apiUrl, company.rmmToken!, fallbackApiUrl);
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="watchdog_${safeName}.ps1"`,
        },
      });
    }

    if (format === 'agent_py') {
      const content = generateAgentPython(apiUrl, company.rmmToken!);
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="agente_rmm_${safeName}.py"`,
        },
      });
    }

    // Default: Instalador completo (PowerShell autossuficiente)
    const content = generateFullInstaller(apiUrl, company.rmmToken!, company.name);
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="Instalar_RMM_Winner_${safeName}.ps1"`,
      },
    });
  } catch (error) {
    console.error('RMM agent gen error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET /api/rmm/agent — Obter token da empresa e status
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'companyId obrigatório' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, rmmToken: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      companyId: company.id,
      companyName: company.name,
      hasToken: !!company.rmmToken,
      token: company.rmmToken || null,
    });
  } catch (error) {
    console.error('RMM agent info error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}