export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import crypto from 'crypto';

// ============================================================
// Template do Agente PowerShell (roda como Tarefa Agendada)
// ============================================================
function generateAgentPs1(apiUrl: string, companyToken: string): string {
  return `# ============================================
# Agente RMM - Winner Tecnologia
# Coleta dados da maquina e envia para o servidor
# Roda como Tarefa Agendada do Windows (SYSTEM)
# ============================================

$ErrorActionPreference = "SilentlyContinue"

# ======= CONFIGURACAO (NAO ALTERAR) =======
$API_URL = "${apiUrl}"
$COMPANY_TOKEN = "${companyToken}"
$CHECKIN_INTERVAL = 60
# ===========================================

# Forcar TLS 1.2+ (obrigatorio para HTTPS em servidores com certificado moderno)
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 } catch {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
}

$LogFile = "C:\\ProgramData\\WinnerRMM\\rmm_agent.log"

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue
}

function Get-DiskInfo {
    try {
        $disk = Get-WmiObject Win32_DiskDrive | Select-Object -First 1
        return @{
            model = $disk.Model
            size  = "$([math]::Round([long]$disk.Size / 1GB, 2)) GB"
        }
    } catch {
        return @{ model = "Desconhecido"; size = "Desconhecido" }
    }
}

function Get-LocalIP {
    try {
        $adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown"
        }
        $best = $adapters | Where-Object { $_.InterfaceAlias -match "Ethernet|Wi-Fi|LAN" } | Select-Object -First 1
        if (-not $best) { $best = $adapters | Select-Object -First 1 }
        if ($best) { return $best.IPAddress }
        return "0.0.0.0"
    } catch { return "0.0.0.0" }
}

function Get-PublicIP {
    try {
        $resp = Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 5
        return $resp.ip
    } catch {
        try { return (Invoke-RestMethod -Uri "https://ifconfig.me/ip" -TimeoutSec 5).Trim() } catch { return $null }
    }
}

function Get-CpuModel {
    try {
        $cpu = Get-WmiObject Win32_Processor | Select-Object -First 1
        return $cpu.Name.Trim()
    } catch { return "Desconhecido" }
}

function Get-AntivirusStatus {
    try {
        $av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop
        if ($av) {
            $names = ($av | ForEach-Object { $_.displayName }) -join ", "
            return $names
        }
        return "Nenhum detectado"
    } catch {
        try {
            $defender = Get-MpComputerStatus -ErrorAction Stop
            if ($defender) {
                $status = if ($defender.RealTimeProtectionEnabled) { "Ativo" } else { "Desativado" }
                return "Windows Defender ($status)"
            }
        } catch {}
        return "Nao identificado"
    }
}

function Get-LoggedUser {
    try {
        # Check for interactive logged user via quser
        $quserOutput = quser 2>&1
        if ($quserOutput -and $quserOutput.Count -gt 1) {
            $line = $quserOutput[1].ToString().Trim()
            $parts = $line -split '\\s{2,}'
            $username = $parts[0].TrimStart('>')
        } else {
            $username = $env:USERNAME
        }

        # Detect user source: Entra ID (AzureAD), AD Domain, or Local
        $cs = Get-WmiObject Win32_ComputerSystem
        $domainRole = $cs.DomainRole
        $domain = $cs.Domain

        # Check AzureAD / Entra ID join
        try {
            $dsregOutput = dsregcmd /status 2>&1 | Out-String
            $isAzureJoined = $dsregOutput -match "AzureAdJoined\\s*:\\s*YES"
            if ($isAzureJoined -and $dsregOutput -match "TenantName\\s*:\\s*(.+)") {
                $tenantName = $Matches[1].Trim()
                return "$username (Entra ID: $tenantName)"
            }
        } catch {}

        # Check AD domain join
        if ($domainRole -ge 3 -or ($domain -and $domain -ne $env:COMPUTERNAME)) {
            return "$username (AD: $domain)"
        }

        return "$username (Local)"
    } catch { return $env:USERNAME }
}

function Get-TeamViewerId {
    try {
        # Tentar ler do registro (TeamViewer Host)
        $paths = @(
            "HKLM:\\SOFTWARE\\TeamViewer",
            "HKLM:\\SOFTWARE\\WOW6432Node\\TeamViewer"
        )
        foreach ($p in $paths) {
            if (Test-Path $p) {
                $clientId = (Get-ItemProperty $p -ErrorAction SilentlyContinue).ClientID
                if ($clientId) { return $clientId.ToString() }
            }
        }
        # Tentar via API local do TeamViewer
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:5939/api/v1/status" -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($resp.teamviewer_id) { return $resp.teamviewer_id.ToString() }
        } catch {}
        return $null
    } catch { return $null }
}

function Get-CpuUsage {
    try {
        $cpu = Get-WmiObject Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq "_Total" }
        return [math]::Round([double]$cpu.PercentProcessorTime, 1)
    } catch { return $null }
}

function Get-RamUsage {
    try {
        $os = Get-WmiObject Win32_OperatingSystem
        $total = [long]$os.TotalVisibleMemorySize
        $free = [long]$os.FreePhysicalMemory
        return [math]::Round((($total - $free) / $total) * 100, 1)
    } catch { return $null }
}

function Get-DiskUsage {
    try {
        $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $total = [long]$disk.Size
        $free = [long]$disk.FreeSpace
        return [math]::Round((($total - $free) / $total) * 100, 1)
    } catch { return $null }
}

function Get-GpuInfo {
    try {
        $gpu = Get-WmiObject Win32_VideoController | Select-Object -First 1
        if ($gpu) { return $gpu.Name }
        return $null
    } catch { return $null }
}

function Get-TopProcesses {
    try {
        $procs = Get-Process | Where-Object { $_.ProcessName -ne "Idle" } |
            Sort-Object -Property WorkingSet64 -Descending |
            Select-Object -First 50 Id, ProcessName, @{N="CPU";E={[math]::Round($_.CPU,1)}}, WorkingSet64
        $result = @()
        foreach ($p in $procs) {
            $result += @{
                pid  = $p.Id
                name = $p.ProcessName
                cpu  = $p.CPU
                mem  = $p.WorkingSet64
            }
        }
        return $result
    } catch { return @() }
}

function Get-WindowsServices {
    try {
        $svcs = Get-Service | Select-Object -First 200 Name, DisplayName, Status, StartType
        $result = @()
        foreach ($s in $svcs) {
            $result += @{
                name        = $s.Name
                displayName = $s.DisplayName
                status      = $s.Status.ToString()
                startType   = $s.StartType.ToString()
            }
        }
        return $result
    } catch { return @() }
}

function Get-InstalledApps {
    try {
        $paths = @(
            "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
            "HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
        )
        $apps = Get-ItemProperty $paths | Where-Object { $_.DisplayName } |
            Select-Object DisplayName, DisplayVersion, Publisher -Unique |
            Sort-Object DisplayName | Select-Object -First 300
        $result = @()
        foreach ($a in $apps) {
            $result += @{
                name      = $a.DisplayName
                version   = $a.DisplayVersion
                publisher = $a.Publisher
            }
        }
        return $result
    } catch { return @() }
}

function Get-SerialNumber {
    try {
        $bios = Get-WmiObject Win32_BIOS -ErrorAction Stop
        if ($bios -and $bios.SerialNumber) {
            $sn = $bios.SerialNumber.ToString().Trim()
            if ($sn -and $sn -ne "To be filled by O.E.M." -and $sn -ne "Default string") {
                return $sn
            }
        }
        # Fallback: via Win32_ComputerSystemProduct
        $csp = Get-WmiObject Win32_ComputerSystemProduct -ErrorAction SilentlyContinue
        if ($csp -and $csp.IdentifyingNumber) { return $csp.IdentifyingNumber.ToString().Trim() }
        return $null
    } catch { return $null }
}

function Get-Manufacturer {
    try {
        $cs = Get-WmiObject Win32_ComputerSystem -ErrorAction Stop
        if ($cs -and $cs.Manufacturer) { return $cs.Manufacturer.ToString().Trim() }
        return $null
    } catch { return $null }
}

function Get-MachineModel {
    try {
        $cs = Get-WmiObject Win32_ComputerSystem -ErrorAction Stop
        if ($cs -and $cs.Model) { return $cs.Model.ToString().Trim() }
        return $null
    } catch { return $null }
}

function Get-MemorySlots {
    try {
        # Total slots: Win32_PhysicalMemoryArray.MemoryDevices
        $total = 0
        $arrays = Get-WmiObject Win32_PhysicalMemoryArray -ErrorAction SilentlyContinue
        if ($arrays) {
            foreach ($a in $arrays) { $total += [int]$a.MemoryDevices }
        }
        # Used slots: count of Win32_PhysicalMemory entries with Capacity > 0
        $mods = @(Get-WmiObject Win32_PhysicalMemory -ErrorAction SilentlyContinue | Where-Object { $_.Capacity -gt 0 })
        $used = $mods.Count
        # Se nao detectar total, fallback = used (ao menos os slots usados)
        if ($total -lt $used -or $total -eq 0) { $total = $used }
        $modules = @()
        foreach ($m in $mods) {
            $modules += @{
                slot         = $m.DeviceLocator
                capacity_gb  = [math]::Round([double]$m.Capacity / 1GB, 2)
                speed        = $m.Speed
                manufacturer = $m.Manufacturer
                partNumber   = $m.PartNumber
            }
        }
        return @{ total = $total; used = $used; modules = $modules }
    } catch {
        return @{ total = $null; used = $null; modules = @() }
    }
}

function Collect-Data {
    $os = Get-WmiObject Win32_OperatingSystem
    $cs = Get-WmiObject Win32_ComputerSystem
    $disk = Get-DiskInfo
    $lastBoot = $os.ConvertToDateTime($os.LastBootUpTime)
    $memInfo = Get-MemorySlots

    $data = @{
        token              = $COMPANY_TOKEN
        hostname           = $env:COMPUTERNAME
        user               = Get-LoggedUser
        os                 = "$($os.Caption) $($os.Version)"
        ram                = "$([math]::Round($cs.TotalPhysicalMemory / 1GB, 2)) GB"
        disk_model         = $disk.model
        disk_size          = $disk.size
        status             = "Ligado"
        last_login         = $lastBoot.ToString("yyyy-MM-dd HH:mm:ss")
        ip_address         = Get-LocalIP
        public_ip          = Get-PublicIP
        cpu_model          = Get-CpuModel
        cpu_usage          = Get-CpuUsage
        ram_usage          = Get-RamUsage
        disk_usage         = Get-DiskUsage
        gpu_info           = Get-GpuInfo
        antivirus_status   = Get-AntivirusStatus
        last_boot_time     = $lastBoot.ToString("yyyy-MM-ddTHH:mm:ss")
        teamviewer_id      = Get-TeamViewerId
        services           = Get-WindowsServices
        installed_apps     = Get-InstalledApps
        # Hardware extras
        serial_number      = Get-SerialNumber
        manufacturer       = Get-Manufacturer
        machine_model      = Get-MachineModel
        memory_slots_total = $memInfo.total
        memory_slots_used  = $memInfo.used
        memory_modules     = $memInfo.modules
    }

    return $data
}

function Send-Snapshot($machineId) {
    try {
        $snapshot = @{
            machineId     = $machineId
            cpuPercent    = Get-CpuUsage
            memoryPercent = Get-RamUsage
            processesJson = (Get-TopProcesses | ConvertTo-Json -Depth 3 -Compress)
            servicesJson  = (Get-WindowsServices | ConvertTo-Json -Depth 3 -Compress)
            installedAppsJson = (Get-InstalledApps | ConvertTo-Json -Depth 3 -Compress)
            gpuJson       = Get-GpuInfo
        }
        $body = $snapshot | ConvertTo-Json -Depth 3
        Invoke-RestMethod -Uri "$API_URL/snapshots" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30 -ErrorAction Stop
    } catch {
        Write-Log "Erro ao enviar snapshot: $($_.Exception.Message)"
    }
}

function Send-Checkin($data) {
    $body = $data | ConvertTo-Json -Depth 3
    $maxRetries = 3
    $retryDelay = 5
    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        try {
            $resp = Invoke-RestMethod -Uri "$API_URL/checkin" \`
                -Method POST \`
                -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) \`
                -ContentType "application/json; charset=utf-8" \`
                -TimeoutSec 30 \`
                -ErrorAction Stop
            return $resp
        } catch {
            Write-Log "Checkin tentativa $attempt/$maxRetries falhou: $($_.Exception.Message)"
            if ($attempt -lt $maxRetries) {
                Start-Sleep -Seconds ($retryDelay * $attempt)
            }
        }
    }
    Write-Log "ERRO: Checkin falhou apos $maxRetries tentativas"
    return $null
}

function Get-DesktopPath {
    try {
        $explorerProc = Get-Process -Name explorer -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($explorerProc) {
            $sid = (Get-WmiObject Win32_Process -Filter "ProcessId=$($explorerProc.Id)").GetOwnerSid().Sid
            $userProfile = (Get-ItemProperty "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
            if ($userProfile) { return Join-Path $userProfile "Desktop" }
        }
    } catch {}
    try {
        $loggedUser = (quser 2>$null | Select-Object -Skip 1 | Select-Object -First 1) -replace '\\s{2,}', ',' | ConvertFrom-Csv -Header 'User','Session','ID','State','Idle','LogonTime' -ErrorAction SilentlyContinue
        if ($loggedUser.User) {
            $uname = $loggedUser.User -replace '^>', ''
            $profile = "C:\\Users\\$uname"
            if (Test-Path "$profile\\Desktop") { return "$profile\\Desktop" }
        }
    } catch {}
    return [Environment]::GetFolderPath('Desktop')
}

function Get-WingetPath {
    # 1) WindowsApps (machine wide) - a pasta real do executavel (funciona sob SYSTEM)
    try {
        $wingetPkg = Get-ChildItem "C:\\Program Files\\WindowsApps" -Directory -Filter "Microsoft.DesktopAppInstaller_*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($wingetPkg) {
            $exe = Join-Path $wingetPkg.FullName 'winget.exe'
            if (Test-Path $exe) { return $exe }
        }
    } catch {}

    # 2) Caminhos conhecidos
    $paths = @(
        "$env:LOCALAPPDATA\\Microsoft\\WindowsApps\\winget.exe",
        "C:\\Program Files\\WindowsApps\\Microsoft.DesktopAppInstaller_*_x64__8wekyb3d8bbwe\\winget.exe",
        "C:\\Program Files\\WindowsApps\\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\\winget.exe"
    )
    foreach ($p in $paths) {
        try {
            $resolved = Resolve-Path $p -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($resolved) { return $resolved.Path }
        } catch {}
    }

    # 3) Perfis de usuarios (SYSTEM nao tem o seu - tentar o usuario logado)
    try {
        $explorerProc = Get-Process -Name explorer -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($explorerProc) {
            $sid = (Get-WmiObject Win32_Process -Filter "ProcessId=$($explorerProc.Id)").GetOwnerSid().Sid
            $userProfile = (Get-ItemProperty "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
            if ($userProfile) {
                $userWinget = "$userProfile\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe"
                if (Test-Path $userWinget) { return $userWinget }
            }
        }
    } catch {}

    # 4) Fallback: varrer todos os perfis e pegar o primeiro com winget
    try {
        $users = Get-ChildItem 'C:\\Users' -Directory -ErrorAction SilentlyContinue
        foreach ($u in $users) {
            $candidate = Join-Path $u.FullName 'AppData\\Local\\Microsoft\\WindowsApps\\winget.exe'
            if (Test-Path $candidate) { return $candidate }
        }
    } catch {}

    return $null
}

function Rewrite-WingetCommands($content, $wingetPath, $scriptType) {
    if (-not $wingetPath) { return $content }
    $safe = $wingetPath -replace '\\\\','\\\\'
    switch ($scriptType) {
        'powershell' {
            # Substitui chamadas "winget <args>" por "& '<path>' <args>"
            return ($content -replace '(?mi)(^|\\s|;|\\|)winget(\\s)', ('$1& "' + $safe + '"$2'))
        }
        'cmd' {
            return ($content -replace '(?mi)(^|\\s|&|&&|\\|)winget(\\s)', ('$1"' + $wingetPath + '"$2'))
        }
        default {
            return $content
        }
    }
}

function Detect-ScriptType($content) {
    $trimmed = $content.TrimStart()
    if ($trimmed -match '^@@SCRIPTTYPE:(\\w+)@@') { return $Matches[1] }
    if ($trimmed -match '^@echo\\s+off' -or $trimmed -match '^rem\\s' -or $trimmed -match '^set\\s+\\w+=') { return 'cmd' }
    if ($trimmed -match "^'\\s*VBScript" -or $trimmed -match '^(Dim|Set|WScript|Option\\s+Explicit|Const)\\s') { return 'vbscript' }
    if ($trimmed -match '^(import |from |def |print\\(|#!/usr/bin.*python)') { return 'python' }
    return 'powershell'
}

function Execute-ScriptContent($content, $scriptType) {
    # Remove the type prefix if present
    $cleanContent = $content -replace '^@@SCRIPTTYPE:\\w+@@', ''
    
    # Inject helper variables
    $DesktopPath = Get-DesktopPath
    $WingetExe = Get-WingetPath
    
    # Auto-rewrite 'winget' references to full path (SYSTEM fix)
    $cleanContent = Rewrite-WingetCommands $cleanContent $WingetExe $scriptType
    
    $tempDir = Join-Path $env:TEMP "WinnerRMM_Scripts"
    if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }
    
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $stdoutFile = Join-Path $tempDir "stdout.txt"
    $stderrFile = Join-Path $tempDir "stderr.txt"
    
    switch ($scriptType) {
        'cmd' {
            $tempFile = Join-Path $tempDir "task_\$timestamp.bat"
            $nl = [Environment]::NewLine
            $header = "@echo off" + $nl + "set \`"DesktopPath=$DesktopPath\`"" + $nl
            if ($WingetExe) {
                $header += "set \`"WINGET=$WingetExe\`"" + $nl
                $wingetDir = Split-Path $WingetExe -Parent
                $header += "set \`"PATH=$wingetDir;%PATH%\`"" + $nl
            }
            Set-Content -Path $tempFile -Value ($header + $cleanContent) -Encoding ASCII
            $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c \`"$tempFile\`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        'vbscript' {
            $tempFile = Join-Path $tempDir "task_\$timestamp.vbs"
            Set-Content -Path $tempFile -Value $cleanContent -Encoding ASCII
            $proc = Start-Process -FilePath "cscript.exe" -ArgumentList "//NoLogo \`"$tempFile\`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        'python' {
            $tempFile = Join-Path $tempDir "task_\$timestamp.py"
            $nl = [Environment]::NewLine
            $header = "import os" + $nl + "DesktopPath = r'$DesktopPath'" + $nl + "os.environ['DESKTOP_PATH'] = DesktopPath" + $nl
            Set-Content -Path $tempFile -Value ($header + $cleanContent) -Encoding UTF8
            $pythonExe = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } elseif (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
            $proc = Start-Process -FilePath $pythonExe -ArgumentList "\`"$tempFile\`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        default {
            # PowerShell
            $tempFile = Join-Path $tempDir "task_\$timestamp.ps1"
            $nl = [Environment]::NewLine
            $header = "\`$DesktopPath = '$DesktopPath'" + $nl
            if ($WingetExe) {
                $header += "\`$WingetExe = '$WingetExe'" + $nl
                # Adiciona diretorio do winget ao PATH para que invocacoes nao re-escritas tambem funcionem
                $wingetDir = Split-Path $WingetExe -Parent
                $header += "\`$env:Path = '$wingetDir;' + \`$env:Path" + $nl
                # Expoe funcao winget() fallback
                $header += "if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { function global:winget { & \`$WingetExe @args } }" + $nl
            } else {
                $header += "\`$WingetExe = \`$null" + $nl
            }
            Set-Content -Path $tempFile -Value ($header + $cleanContent) -Encoding UTF8
            $proc = Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File \`"$tempFile\`"" -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
    }
    
    $stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }
    $stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { "" }
    $exitCode = if ($proc) { $proc.ExitCode } else { -1 }
    
    # Cleanup temp files
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    Remove-Item $stdoutFile -Force -ErrorAction SilentlyContinue
    Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue
    
    $result = ""
    if ($stdout) { $result += $stdout }
    if ($stderr) { $result += [Environment]::NewLine + "[STDERR]" + [Environment]::NewLine + $stderr }
    if (-not $result.Trim()) { $result = "(sem saida - exit code: $exitCode)" }
    
    return $result
}

function Check-Tasks($machineId) {
    try {
        $headers = @{ Authorization = "Bearer $COMPANY_TOKEN" }
        $resp = Invoke-RestMethod -Uri "$API_URL/tasks/$machineId" -Headers $headers -TimeoutSec 15 -ErrorAction Stop

        if ($resp.task -and $resp.task.id) {
            $taskId = $resp.task.id
            $rawCommand = $resp.task.command
            
            # Strip legacy @@SCRIPTTYPE:xxx@@ prefix if present
            $rawCommand = $rawCommand -replace '^\s*@@SCRIPTTYPE:\w+@@\s*', ''
            
            # Use scriptType from server response, fallback to auto-detection
            $scriptType = if ($resp.task.scriptType -and $resp.task.scriptType -ne 'auto') { $resp.task.scriptType } else { Detect-ScriptType $rawCommand }
            Write-Log "Executando tarefa $taskId (tipo: $scriptType)"

            try {
                $output = Execute-ScriptContent $rawCommand $scriptType
                $reportBody = @{ output = $output } | ConvertTo-Json -Depth 3
                Invoke-RestMethod -Uri "$API_URL/report/$taskId" -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($reportBody)) -ContentType "application/json; charset=utf-8" -TimeoutSec 30
                Write-Log "Tarefa $taskId concluida"
            } catch {
                $errBody = @{ error = "[$scriptType] $($_.Exception.Message)" } | ConvertTo-Json
                Invoke-RestMethod -Uri "$API_URL/report/$taskId" -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($errBody)) -ContentType "application/json; charset=utf-8" -TimeoutSec 15
                Write-Log "Erro na tarefa $taskId : $($_.Exception.Message)"
            }
        }
    } catch {
        Write-Log "Erro ao buscar tarefas: $($_.Exception.Message)"
    }
}

# === Coleta de Eventos de Seguranca ===
$lastSecurityCheck = Get-Date

function Collect-SecurityEvents($machineId) {
    try {
        $since = $script:lastSecurityCheck
        $script:lastSecurityCheck = Get-Date
        $eventIds = @(4625, 4624, 4672, 4688)
        $events = @()
        
        foreach ($eid in $eventIds) {
            try {
                $logs = Get-WinEvent -FilterHashtable @{
                    LogName = 'Security'
                    Id = $eid
                    StartTime = $since
                } -MaxEvents 20 -ErrorAction SilentlyContinue
                
                foreach ($log in $logs) {
                    $xml = [xml]$log.ToXml()
                    $evtData = $xml.Event.EventData.Data
                    $username = ($evtData | Where-Object { $_.Name -eq 'TargetUserName' }).'#text'
                    if (-not $username) { $username = ($evtData | Where-Object { $_.Name -eq 'SubjectUserName' }).'#text' }
                    $ipAddr = ($evtData | Where-Object { $_.Name -eq 'IpAddress' }).'#text'
                    if ($ipAddr -eq '-') { $ipAddr = $null }
                    
                    $events += @{
                        machine_id = $machineId
                        event_id = $eid
                        timestamp = $log.TimeCreated.ToString("o")
                        username = $username
                        ip_address = $ipAddr
                        message = $log.Message.Substring(0, [Math]::Min($log.Message.Length, 200))
                    }
                }
            } catch { }
        }
        
        if ($events.Count -gt 0) {
            $body = $events | ConvertTo-Json -Depth 3
            if ($events.Count -eq 1) { $body = "[$body]" }
            $headers = @{
                Authorization = "Bearer $COMPANY_TOKEN"
                'Content-Type' = 'application/json; charset=utf-8'
            }
            Invoke-RestMethod -Uri "$API_URL/../security/events" -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -Headers $headers -TimeoutSec 15
            Write-Log "Enviados $($events.Count) eventos de seguranca"
        }
    } catch {
        Write-Log "Erro ao coletar eventos de seguranca: $($_.Exception.Message)"
    }
}

# === Loop Principal ===
Write-Log "Agente RMM iniciado - Token: $($COMPANY_TOKEN.Substring(0,8))..."
Write-Log "API URL: $API_URL"
$machineId = $null
$loopCount = 0
$consecutiveFailures = 0

# Forcar TLS 1.2 (necessario para HTTPS em VPS com certificado moderno)
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

while ($true) {
    try {
        $data = Collect-Data
        $resp = Send-Checkin $data
        if ($resp -and $resp.machine_id) {
            $machineId = $resp.machine_id
            $consecutiveFailures = 0
        } else {
            $consecutiveFailures++
            Write-Log "Checkin sem resposta (falha consecutiva #$consecutiveFailures)"
        }
        if ($machineId) {
            Check-Tasks $machineId
            # Enviar snapshot a cada 5 ciclos (5 min)
            if ($loopCount % 5 -eq 0) {
                Send-Snapshot $machineId
            }
            # Coletar eventos de seguranca a cada 1 minuto
            Collect-SecurityEvents $machineId
        }
        $loopCount++
    } catch {
        $consecutiveFailures++
        Write-Log "Erro no loop (#$consecutiveFailures): $($_.Exception.Message)"
    }
    # Backoff: se muitas falhas consecutivas, esperar mais para nao sobrecarregar
    if ($consecutiveFailures -gt 5) {
        $waitTime = [Math]::Min($CHECKIN_INTERVAL * 2, 300)
        Write-Log "Muitas falhas consecutivas, aguardando $($waitTime)s..."
        Start-Sleep -Seconds $waitTime
    } else {
        Start-Sleep -Seconds $CHECKIN_INTERVAL
    }
}
`;
}

// ============================================================
// Instalador Completo PowerShell (autossuficiente)
// Embute o agente + registra como Tarefa Agendada do Windows
// ============================================================
function generateFullInstaller(apiUrl: string, companyToken: string, companyName: string): string {
  const agentContent = generateAgentPs1(apiUrl, companyToken);
  // Encode agent to Base64 to embed safely inside the installer
  const agentBase64 = Buffer.from(agentContent, 'utf-8').toString('base64');

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

Write-Host "[2/4] Extraindo agente RMM..." -ForegroundColor Cyan
$agentBase64 = "${agentBase64}"
$agentBytes = [System.Convert]::FromBase64String($agentBase64)
$agentContent = [System.Text.Encoding]::UTF8.GetString($agentBytes)
Set-Content -Path $AgentFile -Value $agentContent -Encoding UTF8 -Force

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
    if (!session?.user || session.user.role !== 'ADMIN') {
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
      const content = generateAgentPs1(apiUrl, company.rmmToken!);
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
    if (!session?.user || session.user.role !== 'ADMIN') {
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
