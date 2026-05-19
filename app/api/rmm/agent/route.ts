export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ============================================================
// Carrega o Agente V2 do disco e substitui placeholders
// O template fica em public/rmm/WinnerRMM-AgentV2.ps1
// Isso permite atualizar o agente sem rebuild da aplicacao
// ============================================================
function loadAgentV2(apiUrl: string, companyToken: string): string {
  const templatePath = path.join(process.cwd(), 'public', 'rmm', 'WinnerRMM-AgentV2.ps1');
  const template = fs.readFileSync(templatePath, 'utf-8');
  return template
    .replace(/\{\{API_URL\}\}/g, apiUrl)
    .replace(/\{\{COMPANY_TOKEN\}\}/g, companyToken);
}

// ============================================================
// Instalador Completo PowerShell (autossuficiente)
// Embute o agente + registra como Tarefa Agendada do Windows
// ============================================================
function generateFullInstaller(apiUrl: string, companyToken: string, companyName: string): string {
  const agentContent = loadAgentV2(apiUrl, companyToken);

  // ATENCAO: o agente e embutido como here-string PowerShell @' ... '@ (literal, sem expansao
  // de variaveis). NAO usar Base64+FromBase64String pois EDR/AV (Bitdefender, Defender ATP,
  // SentinelOne, CrowdStrike) detectam esse padrao como assinatura de loader malicioso.
  // O delimitador @'...'@ preserva o conteudo do agente exatamente como string literal.
  // Caso o agente contenha a sequencia '@ no inicio de linha, ela e escapada para ` @.
  const escapedAgent = agentContent.replace(/^'@/gm, '`@');

  return `# ============================================================
# Instalador RMM - Winner Tecnologia
# Empresa: ${companyName}
# Execute como Administrador (Botao direito > Executar como Admin)
# ============================================================

$ErrorActionPreference = "Stop"
$InstallDir = "C:\\ProgramData\\WinnerRMM"
$TaskName = "WinnerRMMAgent"
$AgentFile = "$InstallDir\\agente_rmm.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Winner Tecnologia - Instalador RMM" -ForegroundColor Cyan
Write-Host "  Empresa: ${companyName}" -ForegroundColor Yellow
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

Write-Host "[1/4] Criando diretorio de instalacao..." -ForegroundColor Cyan
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
}

Write-Host "[2/4] Gravando agente RMM..." -ForegroundColor Cyan
# Conteudo do agente embutido como here-string literal (sem ofuscacao Base64).
# Isso evita falsos positivos de antivirus / EDR que tratam padroes
# 'Base64 -> FromBase64String -> Invoke' como loader malicioso (heuristica AMSI).
$agentContent = @'
${escapedAgent}
'@
Set-Content -LiteralPath $AgentFile -Value $agentContent -Encoding UTF8 -Force

Write-Host "[3/4] Registrando tarefa agendada do Windows..." -ForegroundColor Cyan

# Remove tarefa anterior se existir
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "       Removendo instalacao anterior..." -ForegroundColor Yellow
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Start-Sleep -Seconds 2
}

# Criar tarefa agendada com privilegios SYSTEM
# Triggers: At Startup + A cada 5 minutos para garantir que o agente esteja rodando
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
# IMPORTANTE: NAO usar [TimeSpan]::MaxValue aqui pois gera XML invalido (P99999999DT23H59M59S) no Task Scheduler.
# Usamos 825 dias que eh o maximo seguro aceito pelo XML xs:duration do Task Scheduler.
$triggerPeriodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) \`
    -RepetitionInterval (New-TimeSpan -Minutes 5) \`
    -RepetitionDuration (New-TimeSpan -Days 825)

$action = New-ScheduledTaskAction -Execute "powershell.exe" \`
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$AgentFile\`""

$settings = New-ScheduledTaskSettingsSet \`
    -Hidden \`
    -AllowStartIfOnBatteries \`
    -DontStopIfGoingOnBatteries \`
    -StartWhenAvailable \`
    -RestartCount 5 \`
    -RestartInterval (New-TimeSpan -Minutes 1) \`
    -MultipleInstances IgnoreNew \`
    -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal \`
    -UserId "SYSTEM" \`
    -RunLevel Highest \`
    -LogonType ServiceAccount

Register-ScheduledTask \`
    -TaskName $TaskName \`
    -Action $action \`
    -Trigger @($triggerStartup, $triggerPeriodic) \`
    -Settings $settings \`
    -Principal $principal \`
    -Description "Agente de monitoramento remoto - Winner Tecnologia" \`
    -Force | Out-Null

# Watchdog: tarefa separada que verifica a cada 10 min se o agente esta rodando,
# caso nao esteja, reinicia-o automaticamente.
$watchdogScript = @'
$TaskName = "WinnerRMMAgent"
$AgentFile = "C:\ProgramData\WinnerRMM\agente_rmm.ps1"
$LogFile = "C:\ProgramData\WinnerRMM\watchdog.log"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
try {
    $proc = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*$AgentFile*" }
    if (-not $proc) {
        Add-Content -Path $LogFile -Value "[$ts] Agente nao esta rodando. Reiniciando..." -ErrorAction SilentlyContinue
        Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    } else {
        Add-Content -Path $LogFile -Value "[$ts] Agente OK (PID $($proc.ProcessId))" -ErrorAction SilentlyContinue
    }
} catch {
    Add-Content -Path $LogFile -Value "[$ts] Watchdog erro: $($_.Exception.Message)" -ErrorAction SilentlyContinue
}
'@
$watchdogFile = "$InstallDir\watchdog.ps1"
Set-Content -Path $watchdogFile -Value $watchdogScript -Encoding UTF8 -Force

$watchdogTaskName = "WinnerRMMWatchdog"
$existingWatchdog = Get-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue
if ($existingWatchdog) {
    Unregister-ScheduledTask -TaskName $watchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
}
$wdAction = New-ScheduledTaskAction -Execute "powershell.exe" \`
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$watchdogFile\`""
$wdTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) \`
    -RepetitionInterval (New-TimeSpan -Minutes 10) \`
    -RepetitionDuration (New-TimeSpan -Days 825)
$wdSettings = New-ScheduledTaskSettingsSet \`
    -Hidden \`
    -AllowStartIfOnBatteries \`
    -DontStopIfGoingOnBatteries \`
    -StartWhenAvailable \`
    -MultipleInstances IgnoreNew
Register-ScheduledTask \`
    -TaskName $watchdogTaskName \`
    -Action $wdAction \`
    -Trigger $wdTrigger \`
    -Settings $wdSettings \`
    -Principal $principal \`
    -Description "Watchdog do agente RMM - Winner Tecnologia" \`
    -Force | Out-Null

Write-Host "[4/4] Iniciando agente e watchdog..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Instalacao concluida com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Diretorio: $InstallDir" -ForegroundColor Gray
Write-Host "Tarefa: $TaskName" -ForegroundColor Gray
Write-Host "Log: $InstallDir\\rmm_agent.log" -ForegroundColor Gray
Write-Host ""

# Para deploy silencioso via GPO/Intune, remova a linha abaixo:
Read-Host "Pressione Enter para fechar"
`;
}

// Script de desinstalação
function generateUninstaller(): string {
  return `# ============================================================
# Desinstalador RMM - Winner Tecnologia
# Execute como Administrador
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$InstallDir = "C:\\ProgramData\\WinnerRMM"
$TaskName = "WinnerRMMAgent"
$WatchdogTaskName = "WinnerRMMWatchdog"

Write-Host ""
Write-Host "Winner Tecnologia - Desinstalador RMM" -ForegroundColor Yellow
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERRO] Execute como Administrador!" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "Parando tarefas agendadas..." -ForegroundColor Cyan
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $WatchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "Removendo arquivos..." -ForegroundColor Cyan
Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Desinstalacao concluida!" -ForegroundColor Green
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
      const content = loadAgentV2(apiUrl, company.rmmToken!);
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="agente_rmm_${safeName}.ps1"`,
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