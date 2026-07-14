# ============================================
# Agente RMM v3.0 - Winner Tecnologia
# Arquitetura: Windows Service via NSSM + Auto-Healing
# Melhorias: Write-Log global, DACL, dual-server fallback,
#            self-update, anti-tamper, agentVersion reporting
# ============================================

$ErrorActionPreference = "SilentlyContinue"

# ======= CONFIGURACAO (PREENCHIDO PELO SERVIDOR) =======
$AGENT_VERSION = "3.0.1"
$API_URL = "{{API_URL}}"
$COMPANY_TOKEN = "{{COMPANY_TOKEN}}"
$FALLBACK_API_URL = "{{FALLBACK_API_URL}}"
$CHECKIN_INTERVAL = 60
$GOVERNANCE_INTERVAL = 300     # 5 min
$DRIVER_SCAN_INTERVAL = 86400  # 24h
$DISK_HEALTH_INTERVAL = 3600   # 1h
$NETWORK_DIAG_INTERVAL = 300   # 5 min
# ========================================================

$InstallDir = "C:\ProgramData\WinnerRMM"
$ModulesDir = "$InstallDir\modules"
$LogFile = "$InstallDir\rmm_agent.log"
$LogFileOld = "$InstallDir\rmm_agent_old.log"
$MachineIdFile = "$InstallDir\machine_id"
$VersionFile = "$InstallDir\agent_version"
$StagingDir = "$InstallDir\staging"
$NssmExe = "$InstallDir\nssm.exe"
$ServiceName = "WinnerRMMService"
$WatchdogTaskName = "WinnerRMMWatchdog"

New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
New-Item -Path $ModulesDir -ItemType Directory -Force | Out-Null
New-Item -Path $StagingDir -ItemType Directory -Force | Out-Null

# Forcar TLS 1.2+
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 } catch {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
}

# ============ LOGGING (GLOBAL SCOPE) ============
# Melhoria A do V3: Write-Log como funcao global para que .psm1 modules consigam acessar
function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue
    # Rotacao automatica: manter max 5MB com arquivo rotacionado
    try {
        $logItem = Get-Item $LogFile -ErrorAction SilentlyContinue
        if ($logItem -and $logItem.Length -gt 5MB) {
            if (Test-Path $LogFileOld) { Remove-Item $LogFileOld -Force -ErrorAction SilentlyContinue }
            Rename-Item -Path $LogFile -NewName $LogFileOld -Force -ErrorAction SilentlyContinue
            $null = New-Item -Path $LogFile -ItemType File -Force -ErrorAction SilentlyContinue
            Add-Content -Path $LogFile -Value "[$ts] [LogRotation] Log rotacionado" -ErrorAction SilentlyContinue
        }
    } catch {}
}

# CRITICO: Exportar Write-Log para escopo global para que modulos .psm1 consigam chamar
Set-Item -Path "function:global:Write-Log" -Value ${function:Write-Log}

# ============ MELHORIA F: ANTI-TAMPER DACL ============
function Set-InstallDirProtection {
    try {
        $acl = New-Object System.Security.AccessControl.DirectorySecurity
        # Desabilitar heranca e remover regras herdadas
        $acl.SetAccessRuleProtection($true, $false)
        # SYSTEM = Full Control
        $ruleSystem = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "NT AUTHORITY\SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.AddAccessRule($ruleSystem)
        # Administrators = Read & Execute (podem ver logs, mas nao alterar agente facilmente)
        $ruleAdmins = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "BUILTIN\Administrators", "ReadAndExecute", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.AddAccessRule($ruleAdmins)
        Set-Acl -Path $InstallDir -AclObject $acl -ErrorAction Stop
        Write-Log "[AntiTamper] DACL aplicado em $InstallDir"
    } catch {
        Write-Log "[AntiTamper] Erro ao aplicar DACL: $($_.Exception.Message)"
    }
}

# ============ MACHINE ID PERSISTENCE ============
function Get-StoredMachineId {
    if (Test-Path $MachineIdFile) {
        return (Get-Content $MachineIdFile -ErrorAction SilentlyContinue).Trim()
    }
    return $null
}

function Set-StoredMachineId($id) {
    Set-Content -Path $MachineIdFile -Value $id -Force -ErrorAction SilentlyContinue
}

# Salvar versao atual no disco
Set-Content -Path $VersionFile -Value $AGENT_VERSION -Force -ErrorAction SilentlyContinue

# ============ MELHORIA C: DUAL-SERVER COMMUNICATION ============
function Invoke-ApiRequest {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [object]$Body = $null,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 30,
        [switch]$UseBaseUrl
    )
    $servers = @($API_URL)
    if ($FALLBACK_API_URL -and $FALLBACK_API_URL -ne '' -and $FALLBACK_API_URL -ne '{{FALLBACK_API_URL}}') {
        $servers += $FALLBACK_API_URL
    }

    foreach ($serverUrl in $servers) {
        $url = if ($UseBaseUrl) {
            $base = $serverUrl -replace '/api/rmm$', ''
            "$base$Endpoint"
        } else {
            "$serverUrl$Endpoint"
        }
        try {
            $params = @{
                Uri = $url
                Method = $Method
                TimeoutSec = $TimeoutSec
                ContentType = "application/json; charset=utf-8"
                ErrorAction = "Stop"
            }
            if ($Headers.Count -gt 0) { $params['Headers'] = $Headers }
            if ($Body) {
                if ($Body -is [string]) {
                    $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes($Body)
                } else {
                    $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5))
                }
            }
            $resp = Invoke-RestMethod @params
            return $resp
        } catch {
            Write-Log "[Fallback] Falha em ${url}: $($_.Exception.Message)"
            continue
        }
    }
    return $null
}

# ============ HELPER FUNCTIONS ============
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

function Get-MacAddress {
    try {
        $adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown"
        }
        $best = $adapters | Where-Object { $_.InterfaceAlias -match "Ethernet|Wi-Fi|LAN" } | Select-Object -First 1
        if (-not $best) { $best = $adapters | Select-Object -First 1 }
        if ($best) {
            $adapter = Get-NetAdapter -Name $best.InterfaceAlias -ErrorAction SilentlyContinue
            if ($adapter) { return $adapter.MacAddress }
        }
    } catch {}
    return $null
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
        $quserOutput = quser 2>&1
        if ($quserOutput -and $quserOutput.Count -gt 1) {
            $line = $quserOutput[1].ToString().Trim()
            $parts = $line -split '\s{2,}'
            $username = $parts[0].TrimStart('>')
        } else {
            $username = $env:USERNAME
        }
        $cs = Get-WmiObject Win32_ComputerSystem
        $domainRole = $cs.DomainRole
        $domain = $cs.Domain
        try {
            $dsregOutput = dsregcmd /status 2>&1 | Out-String
            $isAzureJoined = $dsregOutput -match "AzureAdJoined\s*:\s*YES"
            if ($isAzureJoined -and $dsregOutput -match "TenantName\s*:\s*(.+)") {
                $tenantName = $Matches[1].Trim()
                return "$username (Entra ID: $tenantName)"
            }
        } catch {}
        if ($domainRole -ge 3 -or ($domain -and $domain -ne $env:COMPUTERNAME)) {
            return "$username (AD: $domain)"
        }
        return "$username (Local)"
    } catch { return $env:USERNAME }
}

function Get-TeamViewerId {
    try {
        $paths = @("HKLM:\SOFTWARE\TeamViewer", "HKLM:\SOFTWARE\WOW6432Node\TeamViewer")
        foreach ($p in $paths) {
            if (Test-Path $p) {
                $clientId = (Get-ItemProperty $p -ErrorAction SilentlyContinue).ClientID
                if ($clientId) { return $clientId.ToString() }
            }
        }
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
            $result += @{ pid = $p.Id; name = $p.ProcessName; cpu = $p.CPU; mem = $p.WorkingSet64 }
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
                name = $s.Name; displayName = $s.DisplayName
                status = $s.Status.ToString(); startType = $s.StartType.ToString()
            }
        }
        return $result
    } catch { return @() }
}

function Get-InstalledApps {
    try {
        $paths = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        $apps = Get-ItemProperty $paths | Where-Object { $_.DisplayName } |
            Select-Object DisplayName, DisplayVersion, Publisher -Unique |
            Sort-Object DisplayName | Select-Object -First 300
        $result = @()
        foreach ($a in $apps) {
            $result += @{ name = $a.DisplayName; version = $a.DisplayVersion; publisher = $a.Publisher }
        }
        return $result
    } catch { return @() }
}

function Get-SerialNumber {
    try {
        $bios = Get-WmiObject Win32_BIOS -ErrorAction Stop
        if ($bios -and $bios.SerialNumber) {
            $sn = $bios.SerialNumber.ToString().Trim()
            if ($sn -and $sn -ne "To be filled by O.E.M." -and $sn -ne "Default string") { return $sn }
        }
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
        $total = 0
        $arrays = Get-WmiObject Win32_PhysicalMemoryArray -ErrorAction SilentlyContinue
        if ($arrays) { foreach ($a in $arrays) { $total += [int]$a.MemoryDevices } }
        $mods = @(Get-WmiObject Win32_PhysicalMemory -ErrorAction SilentlyContinue | Where-Object { $_.Capacity -gt 0 })
        $used = $mods.Count
        if ($total -lt $used -or $total -eq 0) { $total = $used }
        $modules = @()
        foreach ($m in $mods) {
            $modules += @{
                slot = $m.DeviceLocator; capacity_gb = [math]::Round([double]$m.Capacity / 1GB, 2)
                speed = $m.Speed; manufacturer = $m.Manufacturer; partNumber = $m.PartNumber
            }
        }
        return @{ total = $total; used = $used; modules = $modules }
    } catch { return @{ total = $null; used = $null; modules = @() } }
}

# ============ DATA COLLECTION ============
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
        mac_address        = Get-MacAddress
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
        serial_number      = Get-SerialNumber
        manufacturer       = Get-Manufacturer
        machine_model      = Get-MachineModel
        memory_slots_total = $memInfo.total
        memory_slots_used  = $memInfo.used
        memory_modules     = $memInfo.modules
        agent_version      = $AGENT_VERSION
    }
    return $data
}

# ============ COMMUNICATION ============
function Send-Checkin($data) {
    $body = $data | ConvertTo-Json -Depth 3
    $maxRetries = 3
    $retryDelay = 5
    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        $resp = Invoke-ApiRequest -Endpoint "/checkin" -Method "POST" -Body $body
        if ($resp) { return $resp }
        Write-Log "Checkin tentativa $attempt/$maxRetries falhou"
        if ($attempt -lt $maxRetries) { Start-Sleep -Seconds ($retryDelay * $attempt) }
    }
    Write-Log "ERRO: Checkin falhou apos $maxRetries tentativas"
    return $null
}

function Send-Snapshot($machineId) {
    try {
        $snapshot = @{
            machineId     = $machineId
            agentToken    = $COMPANY_TOKEN
            cpuPercent    = Get-CpuUsage
            memoryPercent = Get-RamUsage
            processesJson = (Get-TopProcesses | ConvertTo-Json -Depth 3 -Compress)
            servicesJson  = (Get-WindowsServices | ConvertTo-Json -Depth 3 -Compress)
            installedAppsJson = (Get-InstalledApps | ConvertTo-Json -Depth 3 -Compress)
            gpuJson       = Get-GpuInfo
        }
        Invoke-ApiRequest -Endpoint "/snapshots" -Method "POST" -Body ($snapshot | ConvertTo-Json -Depth 3)
    } catch {
        Write-Log "Erro ao enviar snapshot: $($_.Exception.Message)"
    }
}

# ============ TASK EXECUTION ENGINE ============
function Get-DesktopPath {
    try {
        $explorerProc = Get-Process -Name explorer -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($explorerProc) {
            $sid = (Get-WmiObject Win32_Process -Filter "ProcessId=$($explorerProc.Id)").GetOwnerSid().Sid
            $userProfile = (Get-ItemProperty "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
            if ($userProfile) { return Join-Path $userProfile "Desktop" }
        }
    } catch {}
    try {
        $loggedUser = (quser 2>$null | Select-Object -Skip 1 | Select-Object -First 1) -replace '\s{2,}', ',' | ConvertFrom-Csv -Header 'User','Session','ID','State','Idle','LogonTime' -ErrorAction SilentlyContinue
        if ($loggedUser.User) {
            $uname = $loggedUser.User -replace '^>', ''
            $profile = "C:\Users\$uname"
            if (Test-Path "$profile\Desktop") { return "$profile\Desktop" }
        }
    } catch {}
    return [Environment]::GetFolderPath('Desktop')
}

function Get-WingetPath {
    try {
        $wingetPkg = Get-ChildItem "C:\Program Files\WindowsApps" -Directory -Filter "Microsoft.DesktopAppInstaller_*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($wingetPkg) {
            $exe = Join-Path $wingetPkg.FullName 'winget.exe'
            if (Test-Path $exe) { return $exe }
        }
    } catch {}
    $paths = @(
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\winget.exe",
        "C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_*_x64__8wekyb3d8bbwe\winget.exe",
        "C:\Program Files\WindowsApps\Microsoft.DesktopAppInstaller_*__8wekyb3d8bbwe\winget.exe"
    )
    foreach ($p in $paths) {
        try {
            $resolved = Resolve-Path $p -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($resolved) { return $resolved.Path }
        } catch {}
    }
    try {
        $explorerProc = Get-Process -Name explorer -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($explorerProc) {
            $sid = (Get-WmiObject Win32_Process -Filter "ProcessId=$($explorerProc.Id)").GetOwnerSid().Sid
            $userProfile = (Get-ItemProperty "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
            if ($userProfile) {
                $userWinget = "$userProfile\AppData\Local\Microsoft\WindowsApps\winget.exe"
                if (Test-Path $userWinget) { return $userWinget }
            }
        }
    } catch {}
    try {
        $users = Get-ChildItem 'C:\Users' -Directory -ErrorAction SilentlyContinue
        foreach ($u in $users) {
            $candidate = Join-Path $u.FullName 'AppData\Local\Microsoft\WindowsApps\winget.exe'
            if (Test-Path $candidate) { return $candidate }
        }
    } catch {}
    return $null
}

function Rewrite-WingetCommands($content, $wingetPath, $scriptType) {
    if (-not $wingetPath) { return $content }
    $safe = $wingetPath -replace '\\','\\\\'
    switch ($scriptType) {
        'powershell' { return ($content -replace '(?mi)(^|\s|;|\|)winget(\s)', ('$1& "' + $safe + '"$2')) }
        'cmd'        { return ($content -replace '(?mi)(^|\s|&|&&|\|)winget(\s)', ('$1"' + $wingetPath + '"$2')) }
        default      { return $content }
    }
}

function Detect-ScriptType($content) {
    $trimmed = $content.TrimStart()
    if ($trimmed -match '^@@SCRIPTTYPE:(\w+)@@') { return $Matches[1] }
    if ($trimmed -match '^@echo\s+off' -or $trimmed -match '^rem\s' -or $trimmed -match '^set\s+\w+=') { return 'cmd' }
    if ($trimmed -match "^'\s*VBScript" -or $trimmed -match '^(Dim|Set|WScript|Option\s+Explicit|Const)\s') { return 'vbscript' }
    if ($trimmed -match '^(import |from |def |print\(|#!/usr/bin.*python)') { return 'python' }
    return 'powershell'
}

function Send-Chunk($taskId, $chunk, $started) {
    try {
        $headers = @{ Authorization = "Bearer $COMPANY_TOKEN" }
        $body = @{ chunk = $chunk; started = $started } | ConvertTo-Json -Depth 3
        Invoke-ApiRequest -Endpoint "/report/$taskId/append" -Method "POST" -Body $body -Headers $headers -TimeoutSec 10
    } catch { }
}

function Execute-ScriptContent($content, $scriptType, $taskId) {
    $cleanContent = $content -replace '^@@SCRIPTTYPE:\w+@@', ''
    $DesktopPath = Get-DesktopPath
    $WingetExe = Get-WingetPath
    $cleanContent = Rewrite-WingetCommands $cleanContent $WingetExe $scriptType

    $tempDir = Join-Path $env:TEMP "WinnerRMM_Scripts"
    if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $stdoutFile = Join-Path $tempDir "stdout.txt"
    $stderrFile = Join-Path $tempDir "stderr.txt"

    switch ($scriptType) {
        'cmd' {
            $tempFile = Join-Path $tempDir "task_$timestamp.bat"
            $nl = [Environment]::NewLine
            # chcp 65001 ativa UTF-8 no cmd.exe — necessario para acentos em comandos/caminhos
            $header = "@echo off" + $nl + "chcp 65001 > nul" + $nl + "set `"DesktopPath=$DesktopPath`"" + $nl
            if ($WingetExe) {
                $header += "set `"WINGET=$WingetExe`"" + $nl
                $wingetDir = Split-Path $WingetExe -Parent
                $header += "set `"PATH=$wingetDir;%PATH%`"" + $nl
            }
            # UTF-8 sem BOM — cmd.exe + chcp 65001 interpretam corretamente
            [System.IO.File]::WriteAllText($tempFile, $header + $cleanContent, (New-Object System.Text.UTF8Encoding $false))
            $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        'vbscript' {
            $tempFile = Join-Path $tempDir "task_$timestamp.vbs"
            [System.IO.File]::WriteAllText($tempFile, $cleanContent, (New-Object System.Text.UTF8Encoding $false))
            $proc = Start-Process -FilePath "cscript.exe" -ArgumentList "//NoLogo `"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        'python' {
            $tempFile = Join-Path $tempDir "task_$timestamp.py"
            $nl = [Environment]::NewLine
            $header = "import os" + $nl + "DesktopPath = r'$DesktopPath'" + $nl + "os.environ['DESKTOP_PATH'] = DesktopPath" + $nl
            Set-Content -Path $tempFile -Value ($header + $cleanContent) -Encoding UTF8
            $pythonExe = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } elseif (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }
            $proc = Start-Process -FilePath $pythonExe -ArgumentList "`"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        default {
            $tempFile = Join-Path $tempDir "task_$timestamp.ps1"
            $nl = [Environment]::NewLine
            $header = "`$DesktopPath = '$DesktopPath'" + $nl
            if ($WingetExe) {
                $header += "`$WingetExe = '$WingetExe'" + $nl
                $wingetDir = Split-Path $WingetExe -Parent
                $header += "`$env:Path = '$wingetDir;' + `$env:Path" + $nl
                $header += "if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { function global:winget { & `$WingetExe @args } }" + $nl
            } else {
                $header += "`$WingetExe = `$null" + $nl
            }
            Set-Content -Path $tempFile -Value ($header + $cleanContent) -Encoding UTF8
            $proc = Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -NonInteractive -File `"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
    }

    # Streaming: monitora o processo e envia chunks ao servidor
    if ($taskId -and $proc) {
        Send-Chunk $taskId "" $true
        $stdoutPos = 0
        $stderrPos = 0
        $streamTimeout = [TimeSpan]::FromMinutes(10)
        $streamStart = [DateTime]::Now
        while (-not $proc.HasExited) {
            if (([DateTime]::Now - $streamStart) -gt $streamTimeout) {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                Send-Chunk $taskId "`n[TIMEOUT] Execucao interrompida apos 10 minutos." $false
                break
            }
            Start-Sleep -Seconds 2
            try {
                if (Test-Path $stdoutFile) {
                    $fs = [IO.File]::Open($stdoutFile, 'Open', 'Read', 'ReadWrite')
                    try {
                        if ($fs.Length -gt $stdoutPos) {
                            $fs.Seek($stdoutPos, 'Begin') | Out-Null
                            $buf = New-Object byte[] ($fs.Length - $stdoutPos)
                            $fs.Read($buf, 0, $buf.Length) | Out-Null
                            $chunkText = [System.Text.Encoding]::UTF8.GetString($buf)
                            if ($chunkText) { Send-Chunk $taskId $chunkText $false }
                            $stdoutPos = $fs.Length
                        }
                    } finally { $fs.Close() }
                }
                if (Test-Path $stderrFile) {
                    $fs2 = [IO.File]::Open($stderrFile, 'Open', 'Read', 'ReadWrite')
                    try {
                        if ($fs2.Length -gt $stderrPos) {
                            $fs2.Seek($stderrPos, 'Begin') | Out-Null
                            $buf2 = New-Object byte[] ($fs2.Length - $stderrPos)
                            $fs2.Read($buf2, 0, $buf2.Length) | Out-Null
                            $chunkText2 = [System.Text.Encoding]::UTF8.GetString($buf2)
                            if ($chunkText2) { Send-Chunk $taskId "[STDERR] $chunkText2" $false }
                            $stderrPos = $fs2.Length
                        }
                    } finally { $fs2.Close() }
                }
            } catch { }
        }
    } elseif ($proc) {
        $proc.WaitForExit()
    }

    $stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }
    $stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { "" }
    $exitCode = if ($proc) { $proc.ExitCode } else { -1 }

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
    $maxPerCycle = 3
    $processed = 0
    while ($processed -lt $maxPerCycle) {
        try {
            $headers = @{ Authorization = "Bearer $COMPANY_TOKEN" }
            $resp = Invoke-ApiRequest -Endpoint "/tasks/$machineId" -Method "GET" -Headers $headers -TimeoutSec 15
            if ($resp -and $resp.task -and $resp.task.id) {
                $taskId = $resp.task.id
                $rawCommand = $resp.task.command
                $rawCommand = $rawCommand -replace '^\s*@@SCRIPTTYPE:\w+@@\s*', ''
                $scriptType = if ($resp.task.scriptType -and $resp.task.scriptType -ne 'auto') { $resp.task.scriptType } else { Detect-ScriptType $rawCommand }
                Write-Log "Executando tarefa $taskId (tipo: $scriptType)"
                try {
                    $output = Execute-ScriptContent $rawCommand $scriptType $taskId
                    $reportBody = @{ output = $output } | ConvertTo-Json -Depth 3
                    Invoke-ApiRequest -Endpoint "/report/$taskId" -Method "POST" -Body $reportBody -TimeoutSec 30
                    Write-Log "Tarefa $taskId concluida"
                } catch {
                    $errBody = @{ error = "[$scriptType] $($_.Exception.Message)" } | ConvertTo-Json
                    Invoke-ApiRequest -Endpoint "/report/$taskId" -Method "POST" -Body $errBody -TimeoutSec 15
                    Write-Log "Erro na tarefa $taskId : $($_.Exception.Message)"
                }
                $processed++
            } else {
                break
            }
        } catch {
            Write-Log "Erro ao buscar tarefas: $($_.Exception.Message)"
            break
        }
    }
}

# ============ SECURITY EVENTS ============
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
                    LogName = 'Security'; Id = $eid; StartTime = $since
                } -MaxEvents 20 -ErrorAction SilentlyContinue
                foreach ($log in $logs) {
                    $xml = [xml]$log.ToXml()
                    $evtData = $xml.Event.EventData.Data
                    $username = ($evtData | Where-Object { $_.Name -eq 'TargetUserName' }).'#text'
                    if (-not $username) { $username = ($evtData | Where-Object { $_.Name -eq 'SubjectUserName' }).'#text' }
                    $ipAddr = ($evtData | Where-Object { $_.Name -eq 'IpAddress' }).'#text'
                    if ($ipAddr -eq '-') { $ipAddr = $null }
                    $events += @{
                        machine_id = $machineId; event_id = $eid
                        timestamp = $log.TimeCreated.ToString("o")
                        username = $username; ip_address = $ipAddr
                        message = $log.Message.Substring(0, [Math]::Min($log.Message.Length, 200))
                    }
                }
            } catch { }
        }
        if ($events.Count -gt 0) {
            $body = $events | ConvertTo-Json -Depth 3
            if ($events.Count -eq 1) { $body = "[$body]" }
            $headers = @{ Authorization = "Bearer $COMPANY_TOKEN"; 'Content-Type' = 'application/json; charset=utf-8' }
            # FIX V3: Endpoint correto para security events (era ../security/events no V1, corrigido)
            Invoke-ApiRequest -Endpoint "/api/rmm/security/events" -Method "POST" -Body $body -Headers $headers -TimeoutSec 15 -UseBaseUrl
            Write-Log "Enviados $($events.Count) eventos de seguranca"
        }
    } catch {
        Write-Log "Erro ao coletar eventos de seguranca: $($_.Exception.Message)"
    }
}

# ============ MODULE MANAGEMENT ============
$BASE_URL = $API_URL -replace '/api/rmm$', ''

function Update-GovernanceModules {
    $moduleFiles = @(
        "WinnerRMM-Governance.psm1",
        "WinnerRMM-WebFilter.psm1",
        "WinnerRMM-Relay.psm1",
        "WinnerRMM-Update.psm1",
        "WinnerRMM-PolicyEngine.psm1",
        "WinnerRMM-DiskHealth.psm1",
        "WinnerRMM-NetworkDiag.psm1"
    )
    foreach ($mod in $moduleFiles) {
        $localPath = "$ModulesDir\$mod"
        $remoteUrl = "$BASE_URL/rmm/modules/$mod"
        try {
            Invoke-WebRequest -Uri $remoteUrl -OutFile $localPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            Write-Log "[Modules] Downloaded: $mod"
        } catch {
            Write-Log "[Modules] Failed $mod : $($_.Exception.Message)"
        }
    }
}

function Import-GovernanceModules {
    $mods = Get-ChildItem -Path $ModulesDir -Filter "*.psm1" -ErrorAction SilentlyContinue
    foreach ($m in $mods) {
        try {
            Import-Module $m.FullName -Force -Global -DisableNameChecking
            Write-Log "[Modules] Imported: $($m.Name)"
        } catch {
            Write-Log "[Modules] Error importing $($m.Name): $($_.Exception.Message)"
        }
    }
}

# ============ MELHORIA G: SELF-UPDATE ============
function Check-AgentUpdate {
    try {
        $headers = @{ Authorization = "Bearer $COMPANY_TOKEN" }
        $resp = Invoke-ApiRequest -Endpoint "/agent/check-update" -Method "POST" -Body (@{
            hostname = $env:COMPUTERNAME
            current_version = $AGENT_VERSION
        } | ConvertTo-Json) -Headers $headers -TimeoutSec 15

        if ($resp -and $resp.update_available -eq $true -and $resp.download_url) {
            Write-Log "[SelfUpdate] Nova versao disponivel: $($resp.new_version). Baixando..."
            $stagingFile = "$StagingDir\_new_agente_rmm.ps1"
            Invoke-WebRequest -Uri $resp.download_url -OutFile $stagingFile -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop

            # Verificar hash se fornecido
            if ($resp.sha256_hash) {
                $fileHash = (Get-FileHash -Path $stagingFile -Algorithm SHA256).Hash
                if ($fileHash -ne $resp.sha256_hash) {
                    Write-Log "[SelfUpdate] ERRO: Hash nao confere! Esperado=$($resp.sha256_hash) Recebido=$fileHash"
                    Remove-Item $stagingFile -Force -ErrorAction SilentlyContinue
                    return
                }
                Write-Log "[SelfUpdate] Hash verificado OK"
            }

            # Substituir agente atual
            $agentFile = "$InstallDir\agente_rmm_v3.ps1"
            Copy-Item -Path $stagingFile -Destination $agentFile -Force
            Remove-Item $stagingFile -Force -ErrorAction SilentlyContinue
            Write-Log "[SelfUpdate] Agente atualizado para $($resp.new_version). Reiniciando servico..."

            # Reiniciar o servico para carregar nova versao
            if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
                Restart-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Log "[SelfUpdate] Erro: $($_.Exception.Message)"
    }
}

# ============ MAIN LOOP ============
Write-Log "======================================="
Write-Log "Agente RMM v$AGENT_VERSION iniciado (Windows Service via NSSM)"
Write-Log "API URL: $API_URL"
Write-Log "Fallback: $FALLBACK_API_URL"
Write-Log "Base URL: $BASE_URL"
Write-Log "Token: $($COMPANY_TOKEN.Substring(0,8))..."
Write-Log "======================================="

# Aplicar protecao anti-tamper no diretorio
Set-InstallDirProtection

$machineId = Get-StoredMachineId
$loopCount = 0
$consecutiveFailures = 0

# Download inicial dos modulos
Write-Log "[Modules] Downloading governance modules..."
Update-GovernanceModules
Import-GovernanceModules

$lastGovernanceRun = (Get-Date).AddSeconds(-$GOVERNANCE_INTERVAL)
$lastDriverScan = (Get-Date).AddSeconds(-$DRIVER_SCAN_INTERVAL)
$lastDiskHealthScan = (Get-Date).AddSeconds(-$DISK_HEALTH_INTERVAL)
$lastNetworkDiagScan = (Get-Date).AddSeconds(-$NETWORK_DIAG_INTERVAL)
$lastModuleUpdate = Get-Date
$lastSelfUpdateCheck = Get-Date

while ($true) {
    try {
        $data = Collect-Data
        $resp = Send-Checkin $data
        if ($resp -and $resp.machine_id) {
            if (-not $machineId -or $machineId -ne $resp.machine_id) {
                $machineId = $resp.machine_id
                Set-StoredMachineId $machineId
                Write-Log "[CheckIn] Machine ID atualizado: $machineId"
            }
            # Reset consecutiveFailures apenas apos checkin BEM-SUCEDIDO (fix V3)
            $consecutiveFailures = 0
        } else {
            $consecutiveFailures++
            Write-Log "Checkin sem resposta (falha consecutiva #$consecutiveFailures)"
        }

        if ($machineId) {
            Check-Tasks $machineId

            # Snapshot a cada 5 ciclos (~5 min)
            if ($loopCount % 5 -eq 0) { Send-Snapshot $machineId }

            # Eventos de seguranca a cada ciclo
            Collect-SecurityEvents $machineId

            # ====== GOVERNANCE ======
            if (((Get-Date) - $lastGovernanceRun).TotalSeconds -ge $GOVERNANCE_INTERVAL) {
                Write-Log "[Governance] Running governance collection..."
                if (Get-Command Send-ActivitySession -ErrorAction SilentlyContinue) {
                    Send-ActivitySession -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId
                }
                if (Get-Command Send-UsbEvents -ErrorAction SilentlyContinue) {
                    Send-UsbEvents -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId
                }
                if (Get-Command Send-WebActivity -ErrorAction SilentlyContinue) {
                    Send-WebActivity -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -Hostname $env:COMPUTERNAME
                }
                if (Get-Command Send-WebFilterLogs -ErrorAction SilentlyContinue) {
                    Send-WebFilterLogs -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -Hostname $env:COMPUTERNAME
                }
                if (Get-Command Enforce-UsbPolicies -ErrorAction SilentlyContinue) {
                    Enforce-UsbPolicies -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId
                }
                if (Get-Command Enforce-ProductivityPolicies -ErrorAction SilentlyContinue) {
                    Enforce-ProductivityPolicies -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId
                }
                if (Get-Command Enforce-WebFilterPolicies -ErrorAction SilentlyContinue) {
                    Enforce-WebFilterPolicies -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId
                }
                $lastGovernanceRun = Get-Date
            }

            # ====== DRIVER SCAN ======
            if (((Get-Date) - $lastDriverScan).TotalSeconds -ge $DRIVER_SCAN_INTERVAL) {
                if (Get-Command Send-DriverInventory -ErrorAction SilentlyContinue) {
                    Write-Log "[Governance] Running driver inventory..."
                    Send-DriverInventory -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId
                }
                $lastDriverScan = Get-Date
            }

            # ====== DISK HEALTH ======
            if (((Get-Date) - $lastDiskHealthScan).TotalSeconds -ge $DISK_HEALTH_INTERVAL) {
                if (Get-Command Send-DiskHealth -ErrorAction SilentlyContinue) {
                    Write-Log "[Governance] Running disk health scan..."
                    Send-DiskHealth -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId
                }
                $lastDiskHealthScan = Get-Date
            }

            # ====== NETWORK DIAGNOSTICS ======
            if (((Get-Date) - $lastNetworkDiagScan).TotalSeconds -ge $NETWORK_DIAG_INTERVAL) {
                if (Get-Command Send-NetworkDiagData -ErrorAction SilentlyContinue) {
                    Write-Log "[Governance] Running network diagnostics..."
                    Send-NetworkDiagData -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -Hostname $env:COMPUTERNAME
                }
                $lastNetworkDiagScan = Get-Date
            }
        }

        # Re-download modulos a cada 1 hora (auto-update)
        if (((Get-Date) - $lastModuleUpdate).TotalHours -ge 1) {
            Write-Log "[Modules] Hourly module update check..."
            Update-GovernanceModules
            Import-GovernanceModules
            $lastModuleUpdate = Get-Date
        }

        # Melhoria G: Verificar atualizacao do agente a cada 6 horas
        if (((Get-Date) - $lastSelfUpdateCheck).TotalHours -ge 6) {
            Write-Log "[SelfUpdate] Checking for agent updates..."
            Check-AgentUpdate
            $lastSelfUpdateCheck = Get-Date
        }

        $loopCount++
    } catch {
        $consecutiveFailures++
        Write-Log "Erro no loop (#$consecutiveFailures): $($_.Exception.Message)"
    }

    # Backoff progressivo em caso de falhas consecutivas
    if ($consecutiveFailures -gt 5) {
        $waitTime = [Math]::Min($CHECKIN_INTERVAL * [Math]::Pow(2, [Math]::Min($consecutiveFailures - 5, 5)), 600)
        Write-Log "Muitas falhas consecutivas ($consecutiveFailures), aguardando $([int]$waitTime)s..."
        Start-Sleep -Seconds ([int]$waitTime)
    } else {
        Start-Sleep -Seconds $CHECKIN_INTERVAL
    }
}
