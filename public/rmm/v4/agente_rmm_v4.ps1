# ============================================================
#  Agente RMM v4.0 - Winner Tecnologia
#  Cliente-agnostico: configuracao vem de config.json + token DPAPI.
#  O MESMO arquivo (mesmo hash) roda em toda a frota -> assine uma vez.
#
#  Resiliencia:
#   - Heartbeat em disco (deteccao de HANG pelo watchdog)
#   - Recycle programado do processo (sem leak/hang de vida longa)
#   - Coleta escalonada + WMI com timeout
#   - Sem self Restart-Service (auto-update por staging + exit 0)
#   - Auto-heal cruzado: re-registra o watchdog se a task sumir
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$AGENT_VERSION = "4.0.0"

# ---------- Caminhos base ----------
$InstallDir   = "C:\Program Files\WinnerRMM"
$ModulesDir   = Join-Path $InstallDir "modules"
$StagingDir   = Join-Path $InstallDir "staging"
$SecureDir    = Join-Path $InstallDir "secure"
$HealthDir    = Join-Path $InstallDir "health"
$LogFile      = Join-Path $InstallDir "rmm_agent.log"
$LogFileOld   = Join-Path $InstallDir "rmm_agent_old.log"
$MachineIdFile= Join-Path $InstallDir "machine_id"
$VersionFile  = Join-Path $InstallDir "agent_version"
$ConfigFile   = Join-Path $InstallDir "config.json"
$TokenFile    = Join-Path $SecureDir  "token.dat"
$HeartbeatFile= Join-Path $HealthDir  "heartbeat.json"
$AgentFile    = Join-Path $InstallDir "agente_rmm_v4.ps1"
$WatchdogFile = Join-Path $InstallDir "watchdog_v4.ps1"
$ServiceName  = "WinnerRMMService"
$WatchdogTaskName = "WinnerRMMWatchdog"

foreach ($d in @($InstallDir,$ModulesDir,$StagingDir,$SecureDir,$HealthDir)) {
    if (!(Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}

# ---------- TLS ----------
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 }
catch { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {} }

# ============ LOGGING (GLOBAL) ============
function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue
    try {
        $logItem = Get-Item $LogFile -ErrorAction SilentlyContinue
        if ($logItem -and $logItem.Length -gt 5MB) {
            if (Test-Path $LogFileOld) { Remove-Item $LogFileOld -Force -ErrorAction SilentlyContinue }
            Rename-Item -Path $LogFile -NewName $LogFileOld -Force -ErrorAction SilentlyContinue
            $null = New-Item -Path $LogFile -ItemType File -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}
Set-Item -Path "function:global:Write-Log" -Value ${function:Write-Log}

# ============ CONFIGURACAO (config.json) ============
# Defaults seguros; sobrescritos por config.json (por cliente).
$cfg = @{
    API_URL             = "https://wticorp.com.br/api/rmm"
    FALLBACK_API_URL    = ""
    CHECKIN_INTERVAL    = 60
    INVENTORY_INTERVAL  = 900      # 15 min (coleta pesada)
    GOVERNANCE_INTERVAL = 300      # 5 min
    DRIVER_SCAN_INTERVAL= 86400    # 24 h
    DISK_HEALTH_INTERVAL= 3600     # 1 h
    NETWORK_DIAG_INTERVAL = 300    # 5 min
    RECYCLE_HOURS       = 8        # recicla o processo a cada 8h (anti-leak/hang)
    MODULE_UPDATE_HOURS = 1
    SELFUPDATE_HOURS    = 6
    WMI_TIMEOUT_SEC     = 20       # timeout duro para chamadas WMI/CIM
}
if (Test-Path $ConfigFile) {
    try {
        $loaded = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        foreach ($k in @($cfg.Keys)) { if ($null -ne $loaded.$k) { $cfg[$k] = $loaded.$k } }
    } catch { Write-Log "[Config] Falha ao ler config.json, usando defaults: $($_.Exception.Message)" }
}
$API_URL          = $cfg.API_URL
$FALLBACK_API_URL = $cfg.FALLBACK_API_URL
$BASE_URL         = $API_URL -replace '/api/rmm$',''

# ============ TOKEN (DPAPI em repouso) ============
function Get-CompanyToken {
    # 1) token.dat cifrado com DPAPI (LocalMachine)
    if (Test-Path $TokenFile) {
        try {
            Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
            $enc = [Convert]::FromBase64String((Get-Content $TokenFile -Raw).Trim())
            $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, 'LocalMachine')
            return [System.Text.Encoding]::UTF8.GetString($bytes)
        } catch { Write-Log "[Token] Falha ao decifrar token.dat: $($_.Exception.Message)" }
    }
    # 2) fallback: token em texto no config (bootstrap/1a execucao)
    if (Test-Path $ConfigFile) {
        try {
            $loaded = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            if ($loaded.COMPANY_TOKEN) { return $loaded.COMPANY_TOKEN }
        } catch {}
    }
    return ""
}
$COMPANY_TOKEN = Get-CompanyToken
if (-not $COMPANY_TOKEN) { Write-Log "[Token] AVISO: token vazio. Checkin ira falhar ate configurar." }

Set-Content -Path $VersionFile -Value $AGENT_VERSION -Force -ErrorAction SilentlyContinue

# ============ WMI COM TIMEOUT (anti-hang R7) ============
# Executa um scriptblock em runspace separado com timeout. Se estourar, retorna $default.
function Invoke-WithTimeout {
    param([scriptblock]$Script, [int]$TimeoutSec = 20, $Default = $null)
    $ps = [PowerShell]::Create()
    $null = $ps.AddScript($Script)
    $async = $ps.BeginInvoke()
    if ($async.AsyncWaitHandle.WaitOne([TimeSpan]::FromSeconds($TimeoutSec))) {
        try { $res = $ps.EndInvoke($async); $ps.Dispose(); return $res } catch { $ps.Dispose(); return $Default }
    } else {
        try { $ps.Stop() } catch {}
        try { $ps.Dispose() } catch {}
        Write-Log "[Timeout] Coletor excedeu ${TimeoutSec}s e foi abortado."
        return $Default
    }
}

# ============ HEARTBEAT EM DISCO (deteccao de HANG R2) ============
function Write-Heartbeat($loopCount, $stage) {
    try {
        $hb = @{
            pid          = $PID
            version      = $AGENT_VERSION
            loop         = $loopCount
            stage        = $stage
            timestamp    = (Get-Date).ToString("o")
            epoch        = [int][double]::Parse((Get-Date -UFormat %s))
        } | ConvertTo-Json -Compress
        Set-Content -Path $HeartbeatFile -Value $hb -Force -ErrorAction SilentlyContinue
    } catch {}
}

# ============ MACHINE ID ============
function Get-StoredMachineId { if (Test-Path $MachineIdFile) { return (Get-Content $MachineIdFile -EA SilentlyContinue).Trim() } return $null }
function Set-StoredMachineId($id) { Set-Content -Path $MachineIdFile -Value $id -Force -EA SilentlyContinue }

# ============ AUTO-HEAL CRUZADO: garantir watchdog task ============
function Ensure-WatchdogTask {
    try {
        $wd = Get-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
        if ($wd) { return }
        if (-not (Test-Path $WatchdogFile)) { return }
        Write-Log "[AutoHeal] Watchdog task ausente. Re-registrando..."
        $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$WatchdogFile`""
        $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
        $trgBoot = New-ScheduledTaskTrigger -AtStartup
        $set = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
        $prc = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
        Register-ScheduledTask -TaskName $WatchdogTaskName -Action $act -Trigger @($trg,$trgBoot) -Settings $set -Principal $prc -Description "Watchdog RMM V4" -Force | Out-Null
        Write-Log "[AutoHeal] Watchdog re-registrado."
    } catch { Write-Log "[AutoHeal] Falha ao re-registrar watchdog: $($_.Exception.Message)" }
}

# ============ COMUNICACAO (dual-endpoint) ============
function Invoke-ApiRequest {
    param([string]$Endpoint,[string]$Method="GET",[object]$Body=$null,[hashtable]$Headers=@{},[int]$TimeoutSec=30,[switch]$UseBaseUrl)
    $servers = @($API_URL)
    if ($FALLBACK_API_URL -and $FALLBACK_API_URL -ne '' -and $FALLBACK_API_URL -ne $API_URL) { $servers += $FALLBACK_API_URL }
    foreach ($serverUrl in $servers) {
        $url = if ($UseBaseUrl) { ($serverUrl -replace '/api/rmm$','') + $Endpoint } else { "$serverUrl$Endpoint" }
        try {
            $params = @{ Uri=$url; Method=$Method; TimeoutSec=$TimeoutSec; ContentType="application/json; charset=utf-8"; ErrorAction="Stop" }
            if ($Headers.Count -gt 0) { $params['Headers'] = $Headers }
            if ($Body) {
                if ($Body -is [string]) { $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes($Body) }
                else { $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5)) }
            }
            return Invoke-RestMethod @params
        } catch { Write-Log "[Comms] Falha em ${url}: $($_.Exception.Message)"; continue }
    }
    return $null
}

# ============ COLETORES (WMI/registro) ============
function Get-DiskInfo { Invoke-WithTimeout { $d = Get-CimInstance Win32_DiskDrive | Select-Object -First 1; @{ model=$d.Model; size="$([math]::Round([long]$d.Size/1GB,2)) GB" } } $cfg.WMI_TIMEOUT_SEC @{model="Desconhecido";size="Desconhecido"} }
function Get-LocalIP {
    try {
        $a = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" }
        $best = $a | Where-Object { $_.InterfaceAlias -match "Ethernet|Wi-Fi|LAN" } | Select-Object -First 1
        if (-not $best) { $best = $a | Select-Object -First 1 }
        if ($best) { return $best.IPAddress }
    } catch {}
    return "0.0.0.0"
}
function Get-PublicIP {
    try {
        $cacheFile = Join-Path $InstallDir "public_ip.cache"
        if (Test-Path $cacheFile) {
            $item = Get-Item $cacheFile -EA SilentlyContinue
            if ($item -and ((Get-Date)-$item.LastWriteTime).TotalMinutes -lt 30) {
                $c = (Get-Content $cacheFile -EA SilentlyContinue | Select-Object -First 1); if ($c) { return $c.Trim() }
            }
        }
        $ip = $null
        try { $ip = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 5).ip } catch { try { $ip = (Invoke-RestMethod -Uri "https://ifconfig.me/ip" -TimeoutSec 5).Trim() } catch {} }
        if ($ip) { Set-Content -Path $cacheFile -Value $ip -Force -EA SilentlyContinue; return $ip }
    } catch {}
    return $null
}
function Get-CpuModel { Invoke-WithTimeout { (Get-CimInstance Win32_Processor | Select-Object -First 1).Name.Trim() } $cfg.WMI_TIMEOUT_SEC "Desconhecido" }
function Get-CpuUsage { Invoke-WithTimeout { $c = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq "_Total" }; [math]::Round([double]$c.PercentProcessorTime,1) } $cfg.WMI_TIMEOUT_SEC $null }
function Get-RamUsage { Invoke-WithTimeout { $os=Get-CimInstance Win32_OperatingSystem; $t=[long]$os.TotalVisibleMemorySize; $f=[long]$os.FreePhysicalMemory; [math]::Round((($t-$f)/$t)*100,1) } $cfg.WMI_TIMEOUT_SEC $null }
function Get-DiskUsage { Invoke-WithTimeout { $d=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"; $t=[long]$d.Size; $f=[long]$d.FreeSpace; [math]::Round((($t-$f)/$t)*100,1) } $cfg.WMI_TIMEOUT_SEC $null }
function Get-GpuInfo { Invoke-WithTimeout { (Get-CimInstance Win32_VideoController | Select-Object -First 1).Name } $cfg.WMI_TIMEOUT_SEC $null }
function Get-AntivirusStatus {
    Invoke-WithTimeout {
        try {
            $av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop
            if ($av) { return (($av | ForEach-Object { $_.displayName }) -join ", ") }
        } catch {
            try { $d = Get-MpComputerStatus -ErrorAction Stop; if ($d) { return "Windows Defender ($(if($d.RealTimeProtectionEnabled){'Ativo'}else{'Desativado'}))" } } catch {}
        }
        return "Nao identificado"
    } $cfg.WMI_TIMEOUT_SEC "Nao identificado"
}
function Get-LoggedUser {
    Invoke-WithTimeout {
        try {
            $q = quser 2>&1
            if ($q -and $q.Count -gt 1) { $username = (($q[1].ToString().Trim() -split '\s{2,}')[0]).TrimStart('>') } else { $username = $env:USERNAME }
            $cs = Get-CimInstance Win32_ComputerSystem
            try {
                $ds = dsregcmd /status 2>&1 | Out-String
                if ($ds -match "AzureAdJoined\s*:\s*YES" -and $ds -match "TenantName\s*:\s*(.+)") { return "$username (Entra ID: $($Matches[1].Trim()))" }
            } catch {}
            if ($cs.DomainRole -ge 3 -or ($cs.Domain -and $cs.Domain -ne $env:COMPUTERNAME)) { return "$username (AD: $($cs.Domain))" }
            return "$username (Local)"
        } catch { return $env:USERNAME }
    } $cfg.WMI_TIMEOUT_SEC $env:USERNAME
}
function Get-TeamViewerId {
    try {
        foreach ($p in @("HKLM:\SOFTWARE\TeamViewer","HKLM:\SOFTWARE\WOW6432Node\TeamViewer")) {
            if (Test-Path $p) { $id = (Get-ItemProperty $p -EA SilentlyContinue).ClientID; if ($id) { return $id.ToString() } }
        }
    } catch {}
    return $null
}
function Get-SerialNumber {
    Invoke-WithTimeout {
        try {
            $b = Get-CimInstance Win32_BIOS -ErrorAction Stop
            if ($b -and $b.SerialNumber) { $sn=$b.SerialNumber.ToString().Trim(); if ($sn -and $sn -ne "To be filled by O.E.M." -and $sn -ne "Default string") { return $sn } }
            $c = Get-CimInstance Win32_ComputerSystemProduct -EA SilentlyContinue; if ($c -and $c.IdentifyingNumber) { return $c.IdentifyingNumber.ToString().Trim() }
        } catch {}
        return $null
    } $cfg.WMI_TIMEOUT_SEC $null
}
function Get-Manufacturer { Invoke-WithTimeout { (Get-CimInstance Win32_ComputerSystem).Manufacturer.ToString().Trim() } $cfg.WMI_TIMEOUT_SEC $null }
function Get-MachineModel { Invoke-WithTimeout { (Get-CimInstance Win32_ComputerSystem).Model.ToString().Trim() } $cfg.WMI_TIMEOUT_SEC $null }
function Get-MemorySlots {
    Invoke-WithTimeout {
        $total=0; $arrays=Get-CimInstance Win32_PhysicalMemoryArray -EA SilentlyContinue
        if ($arrays) { foreach ($a in $arrays) { $total += [int]$a.MemoryDevices } }
        $mods=@(Get-CimInstance Win32_PhysicalMemory -EA SilentlyContinue | Where-Object { $_.Capacity -gt 0 })
        $used=$mods.Count; if ($total -lt $used -or $total -eq 0) { $total=$used }
        $modules=@(); foreach ($m in $mods) { $modules += @{ slot=$m.DeviceLocator; capacity_gb=[math]::Round([double]$m.Capacity/1GB,2); speed=$m.Speed; manufacturer=$m.Manufacturer; partNumber=$m.PartNumber } }
        @{ total=$total; used=$used; modules=$modules }
    } $cfg.WMI_TIMEOUT_SEC @{ total=$null; used=$null; modules=@() }
}
function Get-TopProcesses {
    try {
        $procs = Get-Process | Where-Object { $_.ProcessName -ne "Idle" } | Sort-Object WorkingSet64 -Descending | Select-Object -First 50
        $r=@(); foreach ($p in $procs) { $r += @{ pid=$p.Id; name=$p.ProcessName; cpu=$p.CPU; mem=$p.WorkingSet64 } }
        return $r
    } catch { return @() }
}
function Get-WindowsServices {
    try {
        $r=@(); foreach ($s in (Get-Service | Select-Object -First 200)) { $r += @{ name=$s.Name; displayName=$s.DisplayName; status=$s.Status.ToString(); startType=$s.StartType.ToString() } }
        return $r
    } catch { return @() }
}
function Get-InstalledApps {
    try {
        $paths=@("HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*","HKLM:\SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")
        $apps=Get-ItemProperty $paths -EA SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName,DisplayVersion,Publisher -Unique | Sort-Object DisplayName | Select-Object -First 300
        $r=@(); foreach ($a in $apps) { $r += @{ name=$a.DisplayName; version=$a.DisplayVersion; publisher=$a.Publisher } }
        return $r
    } catch { return @() }
}

# ============ COLETA: leve (60s) vs pesada (15min) ============
$script:cachedInventory = $null
function Collect-LightData {
    $os = Invoke-WithTimeout { Get-CimInstance Win32_OperatingSystem } $cfg.WMI_TIMEOUT_SEC $null
    $cs = Invoke-WithTimeout { Get-CimInstance Win32_ComputerSystem } $cfg.WMI_TIMEOUT_SEC $null
    $lastBoot = if ($os) { $os.LastBootUpTime } else { $null }
    $data = @{
        token=$COMPANY_TOKEN; hostname=$env:COMPUTERNAME; status="Ligado"
        os= if ($os) { "$($os.Caption) $($os.Version)" } else { $null }
        ram= if ($cs) { "$([math]::Round($cs.TotalPhysicalMemory/1GB,2)) GB" } else { $null }
        user=Get-LoggedUser; ip_address=Get-LocalIP; public_ip=Get-PublicIP
        cpu_usage=Get-CpuUsage; ram_usage=Get-RamUsage; disk_usage=Get-DiskUsage
        last_boot_time= if ($lastBoot) { $lastBoot.ToString("yyyy-MM-ddTHH:mm:ss") } else { $null }
        last_login= if ($lastBoot) { $lastBoot.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
        antivirus_status=Get-AntivirusStatus; agent_version=$AGENT_VERSION
    }
    # anexa inventario pesado em cache (atualizado a cada INVENTORY_INTERVAL)
    if ($script:cachedInventory) { foreach ($k in $script:cachedInventory.Keys) { $data[$k] = $script:cachedInventory[$k] } }
    return $data
}
function Refresh-Inventory {
    $disk = Get-DiskInfo; $mem = Get-MemorySlots
    $script:cachedInventory = @{
        disk_model=$disk.model; disk_size=$disk.size; cpu_model=Get-CpuModel; gpu_info=Get-GpuInfo
        teamviewer_id=Get-TeamViewerId; serial_number=Get-SerialNumber; manufacturer=Get-Manufacturer
        machine_model=Get-MachineModel; memory_slots_total=$mem.total; memory_slots_used=$mem.used
        memory_modules=$mem.modules; services=Get-WindowsServices; installed_apps=Get-InstalledApps
    }
    Write-Log "[Inventory] Inventario pesado atualizado."
}

function Send-Checkin($data) {
    $body = $data | ConvertTo-Json -Depth 4
    for ($i=1; $i -le 3; $i++) {
        $resp = Invoke-ApiRequest -Endpoint "/checkin" -Method "POST" -Body $body
        if ($resp) { return $resp }
        Write-Log "Checkin tentativa $i/3 falhou"
        if ($i -lt 3) { Start-Sleep -Seconds (5*$i) }
    }
    Write-Log "ERRO: Checkin falhou apos 3 tentativas"; return $null
}
function Send-Snapshot($machineId) {
    try {
        $snap = @{ machineId=$machineId; agentToken=$COMPANY_TOKEN; cpuPercent=Get-CpuUsage; memoryPercent=Get-RamUsage
            processesJson=(Get-TopProcesses | ConvertTo-Json -Depth 3 -Compress)
            servicesJson=(Get-WindowsServices | ConvertTo-Json -Depth 3 -Compress)
            installedAppsJson=(Get-InstalledApps | ConvertTo-Json -Depth 3 -Compress); gpuJson=Get-GpuInfo }
        Invoke-ApiRequest -Endpoint "/snapshots" -Method "POST" -Body ($snap | ConvertTo-Json -Depth 3)
    } catch { Write-Log "Erro snapshot: $($_.Exception.Message)" }
}

# ============ SECURITY EVENTS ============
$script:lastSecurityCheck = Get-Date
function Collect-SecurityEvents($machineId) {
    try {
        $since = $script:lastSecurityCheck; $script:lastSecurityCheck = Get-Date
        $events=@()
        foreach ($eid in @(4625,4624,4672,4688)) {
            try {
                $logs = Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=$eid; StartTime=$since } -MaxEvents 20 -EA SilentlyContinue
                foreach ($log in $logs) {
                    $xml=[xml]$log.ToXml(); $ed=$xml.Event.EventData.Data
                    $u=($ed|Where-Object{$_.Name -eq 'TargetUserName'}).'#text'; if (-not $u) { $u=($ed|Where-Object{$_.Name -eq 'SubjectUserName'}).'#text' }
                    $ip=($ed|Where-Object{$_.Name -eq 'IpAddress'}).'#text'; if ($ip -eq '-') { $ip=$null }
                    $events += @{ machine_id=$machineId; event_id=$eid; timestamp=$log.TimeCreated.ToString("o"); username=$u; ip_address=$ip; message=$log.Message.Substring(0,[Math]::Min($log.Message.Length,200)) }
                }
            } catch {}
        }
        if ($events.Count -gt 0) {
            $body = $events | ConvertTo-Json -Depth 3; if ($events.Count -eq 1) { $body="[$body]" }
            $h = @{ Authorization="Bearer $COMPANY_TOKEN"; 'Content-Type'='application/json; charset=utf-8' }
            Invoke-ApiRequest -Endpoint "/api/rmm/security/events" -Method "POST" -Body $body -Headers $h -TimeoutSec 15 -UseBaseUrl
            Write-Log "Enviados $($events.Count) eventos de seguranca"
        }
    } catch { Write-Log "Erro security events: $($_.Exception.Message)" }
}

# ============ MODULOS (com verificacao de hash) R6 ============
function Update-GovernanceModules {
    # Servidor deve expor um manifesto JSON: [{name, sha256}] em /rmm/modules/manifest.json
    $manifestUrl = "$BASE_URL/rmm/modules/manifest.json"
    $manifest = $null
    try { $manifest = Invoke-RestMethod -Uri $manifestUrl -TimeoutSec 20 -ErrorAction Stop } catch { Write-Log "[Modules] Sem manifesto ($manifestUrl). Mantendo modulos atuais."; return }
    foreach ($entry in $manifest) {
        if (-not $entry.name) { continue }
        $localPath = Join-Path $ModulesDir $entry.name
        $tmpPath   = Join-Path $StagingDir  ("_dl_" + $entry.name)
        $remoteUrl = "$BASE_URL/rmm/modules/$($entry.name)"
        try {
            Invoke-WebRequest -Uri $remoteUrl -OutFile $tmpPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            if ((Get-Item $tmpPath).Length -lt 50) { throw "download vazio/HTML" }
            if ($entry.sha256) {
                $h = (Get-FileHash -Path $tmpPath -Algorithm SHA256).Hash
                if ($h -ne $entry.sha256) { throw "hash divergente (esperado $($entry.sha256), obtido $h)" }
            }
            Move-Item -Path $tmpPath -Destination $localPath -Force
            Write-Log "[Modules] OK: $($entry.name)"
        } catch {
            Write-Log "[Modules] Rejeitado $($entry.name): $($_.Exception.Message)"
            Remove-Item $tmpPath -Force -EA SilentlyContinue
        }
    }
}
function Import-GovernanceModules {
    foreach ($m in (Get-ChildItem -Path $ModulesDir -Filter "*.psm1" -EA SilentlyContinue)) {
        try { Import-Module $m.FullName -Force -Global -DisableNameChecking; Write-Log "[Modules] Importado: $($m.Name)" }
        catch { Write-Log "[Modules] Erro import $($m.Name): $($_.Exception.Message)" }
    }
}

# ============ TASK EXECUTION (mantido do V3.1, endurecido) ============
function Get-DesktopPath {
    # Servico roda como SYSTEM -> resolver o Desktop do usuario logado, nao do SYSTEM.
    try {
        $ep = Get-Process -Name explorer -EA SilentlyContinue | Select-Object -First 1
        if ($ep) {
            $owner = (Get-CimInstance Win32_Process -Filter "ProcessId=$($ep.Id)" -EA SilentlyContinue | Invoke-CimMethod -MethodName GetOwner -EA SilentlyContinue)
            if ($owner -and $owner.User) {
                $prof = "C:\Users\$($owner.User)"
                if (Test-Path "$prof\Desktop") { return "$prof\Desktop" }
            }
        }
    } catch {}
    try {
        $u = (quser 2>$null | Select-Object -Skip 1 | Select-Object -First 1) -replace '\s{2,}',',' | ConvertFrom-Csv -Header 'User','Session','ID','State','Idle','LogonTime' -EA SilentlyContinue
        if ($u.User) { $un=$u.User -replace '^>',''; if (Test-Path "C:\Users\$un\Desktop") { return "C:\Users\$un\Desktop" } }
    } catch {}
    return [Environment]::GetFolderPath('Desktop')
}
function Get-WingetPath {
    try {
        $pkg = Get-ChildItem "C:\Program Files\WindowsApps" -Directory -Filter "Microsoft.DesktopAppInstaller_*" -EA SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if ($pkg) { $exe = Join-Path $pkg.FullName 'winget.exe'; if (Test-Path $exe) { return $exe } }
    } catch {}
    try { $users = Get-ChildItem 'C:\Users' -Directory -EA SilentlyContinue; foreach ($u in $users) { $c = Join-Path $u.FullName 'AppData\Local\Microsoft\WindowsApps\winget.exe'; if (Test-Path $c) { return $c } } } catch {}
    return $null
}
function Rewrite-WingetCommands($content,$wingetPath,$scriptType) {
    if (-not $wingetPath) { return $content }
    $safe = $wingetPath -replace '\\','\\\\'
    switch ($scriptType) {
        'powershell' { return ($content -replace '(?mi)(^|\s|;|\|)winget(\s)', ('$1& "'+$safe+'"$2')) }
        'cmd'        { return ($content -replace '(?mi)(^|\s|&|&&|\|)winget(\s)', ('$1"'+$wingetPath+'"$2')) }
        default      { return $content }
    }
}
function Detect-ScriptType($content) {
    $t = $content.TrimStart()
    if ($t -match '^@@SCRIPTTYPE:(\w+)@@') { return $Matches[1] }
    if ($t -match '^@echo\s+off' -or $t -match '^rem\s' -or $t -match '^set\s+\w+=') { return 'cmd' }
    if ($t -match "^'\s*VBScript" -or $t -match '^(Dim|Set|WScript|Option\s+Explicit|Const)\s') { return 'vbscript' }
    if ($t -match '^(import |from |def |print\(|#!/usr/bin.*python)') { return 'python' }
    return 'powershell'
}
function Send-Chunk($taskId,$chunk,$started) {
    try { $h=@{ Authorization="Bearer $COMPANY_TOKEN" }; $b=@{ chunk=$chunk; started=$started } | ConvertTo-Json -Depth 3; Invoke-ApiRequest -Endpoint "/report/$taskId/append" -Method "POST" -Body $b -Headers $h -TimeoutSec 10 } catch {}
}
function Execute-ScriptContent($content,$scriptType,$taskId) {
    $clean = $content -replace '^@@SCRIPTTYPE:\w+@@',''
    $DesktopPath = Get-DesktopPath; $WingetExe = Get-WingetPath
    $clean = Rewrite-WingetCommands $clean $WingetExe $scriptType
    $tempDir = Join-Path $env:TEMP "WinnerRMM_Scripts"; if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }
    $ts = Get-Date -Format "yyyyMMddHHmmss"
    $stdoutFile = Join-Path $tempDir "stdout.txt"; $stderrFile = Join-Path $tempDir "stderr.txt"
    switch ($scriptType) {
        'cmd' {
            $tempFile = Join-Path $tempDir "task_$ts.bat"; $nl=[Environment]::NewLine
            $header = "@echo off"+$nl+"chcp 65001 > nul"+$nl+"set `"DesktopPath=$DesktopPath`""+$nl
            if ($WingetExe) { $header += "set `"WINGET=$WingetExe`""+$nl+"set `"PATH=$(Split-Path $WingetExe -Parent);%PATH%`""+$nl }
            [System.IO.File]::WriteAllText($tempFile,$header+$clean,(New-Object System.Text.UTF8Encoding $false))
            $proc = Start-Process "cmd.exe" -ArgumentList "/c `"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        'vbscript' {
            $tempFile = Join-Path $tempDir "task_$ts.vbs"
            [System.IO.File]::WriteAllText($tempFile,$clean,(New-Object System.Text.UTF8Encoding $false))
            $proc = Start-Process "cscript.exe" -ArgumentList "//NoLogo `"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        'python' {
            $tempFile = Join-Path $tempDir "task_$ts.py"; $nl=[Environment]::NewLine
            $header = "import os"+$nl+"DesktopPath = r'$DesktopPath'"+$nl+"os.environ['DESKTOP_PATH'] = DesktopPath"+$nl
            Set-Content -Path $tempFile -Value ($header+$clean) -Encoding UTF8
            $py = if (Get-Command python -EA SilentlyContinue) { "python" } elseif (Get-Command python3 -EA SilentlyContinue) { "python3" } else { "python" }
            $proc = Start-Process $py -ArgumentList "`"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        default {
            $tempFile = Join-Path $tempDir "task_$ts.ps1"; $nl=[Environment]::NewLine
            $header = "`$DesktopPath = '$DesktopPath'"+$nl
            if ($WingetExe) { $header += "`$WingetExe = '$WingetExe'"+$nl+"`$env:Path = '$(Split-Path $WingetExe -Parent);' + `$env:Path"+$nl+"if (-not (Get-Command winget -EA SilentlyContinue)) { function global:winget { & `$WingetExe @args } }"+$nl } else { $header += "`$WingetExe = `$null"+$nl }
            Set-Content -Path $tempFile -Value ($header+$clean) -Encoding UTF8
            $proc = Start-Process "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -NonInteractive -File `"$tempFile`"" -NoNewWindow -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
    }
    if ($taskId -and $proc) {
        Send-Chunk $taskId "" $true
        $soPos=0; $sePos=0; $streamStart=[DateTime]::Now; $streamTimeout=[TimeSpan]::FromMinutes(10)
        while (-not $proc.HasExited) {
            if (([DateTime]::Now-$streamStart) -gt $streamTimeout) { Stop-Process -Id $proc.Id -Force -EA SilentlyContinue; Send-Chunk $taskId "`n[TIMEOUT] Interrompido apos 10 min." $false; break }
            Start-Sleep -Seconds 2
            try {
                if (Test-Path $stdoutFile) { $fs=[IO.File]::Open($stdoutFile,'Open','Read','ReadWrite'); try { if ($fs.Length -gt $soPos) { $fs.Seek($soPos,'Begin')|Out-Null; $buf=New-Object byte[] ($fs.Length-$soPos); $fs.Read($buf,0,$buf.Length)|Out-Null; $c=[System.Text.Encoding]::UTF8.GetString($buf); if ($c) { Send-Chunk $taskId $c $false }; $soPos=$fs.Length } } finally { $fs.Close() } }
                if (Test-Path $stderrFile) { $fs2=[IO.File]::Open($stderrFile,'Open','Read','ReadWrite'); try { if ($fs2.Length -gt $sePos) { $fs2.Seek($sePos,'Begin')|Out-Null; $buf2=New-Object byte[] ($fs2.Length-$sePos); $fs2.Read($buf2,0,$buf2.Length)|Out-Null; $c2=[System.Text.Encoding]::UTF8.GetString($buf2); if ($c2) { Send-Chunk $taskId "[STDERR] $c2" $false }; $sePos=$fs2.Length } } finally { $fs2.Close() } }
            } catch {}
        }
    } elseif ($proc) { $proc.WaitForExit() }
    $stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }
    $stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { "" }
    $exit = if ($proc) { $proc.ExitCode } else { -1 }
    Remove-Item $tempFile,$stdoutFile,$stderrFile -Force -EA SilentlyContinue
    $result = ""; if ($stdout) { $result += $stdout }; if ($stderr) { $result += [Environment]::NewLine+"[STDERR]"+[Environment]::NewLine+$stderr }
    if (-not $result.Trim()) { $result = "(sem saida - exit code: $exit)" }
    return $result
}
function Check-Tasks($machineId) {
    $processed=0
    while ($processed -lt 3) {
        try {
            $h=@{ Authorization="Bearer $COMPANY_TOKEN" }
            $resp = Invoke-ApiRequest -Endpoint "/tasks/$machineId" -Method "GET" -Headers $h -TimeoutSec 15
            if ($resp -and $resp.task -and $resp.task.id) {
                $taskId=$resp.task.id; $raw=$resp.task.command -replace '^\s*@@SCRIPTTYPE:\w+@@\s*',''
                $st = if ($resp.task.scriptType -and $resp.task.scriptType -ne 'auto') { $resp.task.scriptType } else { Detect-ScriptType $raw }
                Write-Log "Executando tarefa $taskId (tipo: $st)"
                try { $out = Execute-ScriptContent $raw $st $taskId; Invoke-ApiRequest -Endpoint "/report/$taskId" -Method "POST" -Body (@{ output=$out } | ConvertTo-Json -Depth 3) -TimeoutSec 30; Write-Log "Tarefa $taskId concluida" }
                catch { Invoke-ApiRequest -Endpoint "/report/$taskId" -Method "POST" -Body (@{ error="[$st] $($_.Exception.Message)" } | ConvertTo-Json) -TimeoutSec 15; Write-Log "Erro tarefa $taskId : $($_.Exception.Message)" }
                $processed++
            } else { break }
        } catch { Write-Log "Erro buscar tarefas: $($_.Exception.Message)"; break }
    }
}

# ============ SELF-UPDATE (staging, sem self Restart-Service) R5 ============
function Check-AgentUpdate {
    try {
        $h=@{ Authorization="Bearer $COMPANY_TOKEN" }
        $resp = Invoke-ApiRequest -Endpoint "/agent/check-update" -Method "POST" -Body (@{ hostname=$env:COMPUTERNAME; current_version=$AGENT_VERSION } | ConvertTo-Json) -Headers $h -TimeoutSec 15
        if ($resp -and $resp.update_available -eq $true -and $resp.download_url) {
            Write-Log "[SelfUpdate] Nova versao $($resp.new_version). Baixando para staging..."
            $stagingFile = Join-Path $StagingDir "_new_agente.ps1"
            Invoke-WebRequest -Uri $resp.download_url -OutFile $stagingFile -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
            if ($resp.sha256_hash) {
                $fh = (Get-FileHash -Path $stagingFile -Algorithm SHA256).Hash
                if ($fh -ne $resp.sha256_hash) { Write-Log "[SelfUpdate] Hash divergente. Abortando."; Remove-Item $stagingFile -Force -EA SilentlyContinue; return }
            }
            # sinaliza update e sai limpo -> NSSM sobe processo novo que promove o staging
            Set-Content -Path (Join-Path $StagingDir "update.ready") -Value $stagingFile -Force
            Write-Log "[SelfUpdate] Staging pronto. Reciclando processo para aplicar."
            $script:recycleNow = $true
        }
    } catch { Write-Log "[SelfUpdate] Erro: $($_.Exception.Message)" }
}
function Apply-StagedUpdate {
    $ready = Join-Path $StagingDir "update.ready"
    if (Test-Path $ready) {
        try {
            $src = (Get-Content $ready -Raw).Trim()
            if ($src -and (Test-Path $src)) {
                Copy-Item -Path $src -Destination $AgentFile -Force
                Write-Log "[SelfUpdate] Update aplicado a partir de $src"
            }
        } catch { Write-Log "[SelfUpdate] Falha ao aplicar staging: $($_.Exception.Message)" }
        Remove-Item $ready -Force -EA SilentlyContinue
    }
}

# ============ MAIN ============
Apply-StagedUpdate   # promove update pendente antes de tudo

Write-Log "======================================="
Write-Log "Agente RMM v$AGENT_VERSION iniciado (PID $PID)"
Write-Log "API: $API_URL | Fallback: $FALLBACK_API_URL"
Write-Log "Recycle: $($cfg.RECYCLE_HOURS)h | Checkin: $($cfg.CHECKIN_INTERVAL)s"
Write-Log "======================================="

$machineId = Get-StoredMachineId
$loopCount = 0
$consecutiveFailures = 0
$script:recycleNow = $false
$processStart = Get-Date

Ensure-WatchdogTask
Update-GovernanceModules
Import-GovernanceModules
Refresh-Inventory

$lastInventory   = Get-Date
$lastGovernance  = (Get-Date).AddSeconds(-$cfg.GOVERNANCE_INTERVAL)
$lastDriverScan  = (Get-Date).AddSeconds(-$cfg.DRIVER_SCAN_INTERVAL)
$lastDiskHealth  = (Get-Date).AddSeconds(-$cfg.DISK_HEALTH_INTERVAL)
$lastNetworkDiag = (Get-Date).AddSeconds(-$cfg.NETWORK_DIAG_INTERVAL)
$lastModuleUpdate= Get-Date
$lastSelfUpdate  = Get-Date
$lastWatchdogCheck = Get-Date

while ($true) {
    try {
        Write-Heartbeat $loopCount "checkin"

        # RECYCLE: encerra limpo -> NSSM sobe processo novo (anti-leak/hang R1)
        if ($script:recycleNow -or ((Get-Date)-$processStart).TotalHours -ge $cfg.RECYCLE_HOURS) {
            Write-Log "[Recycle] Reciclando processo (uptime $([math]::Round(((Get-Date)-$processStart).TotalHours,1))h). exit 0."
            Write-Heartbeat $loopCount "recycling"
            exit 0
        }

        # atualiza inventario pesado periodicamente
        if (((Get-Date)-$lastInventory).TotalSeconds -ge $cfg.INVENTORY_INTERVAL) { Refresh-Inventory; $lastInventory = Get-Date }

        $data = Collect-LightData
        $resp = Send-Checkin $data
        if ($resp -and $resp.machine_id) {
            if (-not $machineId -or $machineId -ne $resp.machine_id) { $machineId = $resp.machine_id; Set-StoredMachineId $machineId; Write-Log "[CheckIn] Machine ID: $machineId" }
            $consecutiveFailures = 0
        } else { $consecutiveFailures++; Write-Log "Checkin sem resposta (falha #$consecutiveFailures)" }

        if ($machineId) {
            Write-Heartbeat $loopCount "tasks"
            Check-Tasks $machineId
            if ($loopCount % 5 -eq 0) { Send-Snapshot $machineId }
            Collect-SecurityEvents $machineId

            if (((Get-Date)-$lastGovernance).TotalSeconds -ge $cfg.GOVERNANCE_INTERVAL) {
                Write-Heartbeat $loopCount "governance"
                foreach ($fn in @('Send-ActivitySession','Send-UsbEvents','Enforce-UsbPolicies','Enforce-ProductivityPolicies','Enforce-WebFilterPolicies')) {
                    if (Get-Command $fn -EA SilentlyContinue) { & $fn -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId }
                }
                foreach ($fn in @('Send-WebActivity','Send-WebFilterLogs')) {
                    if (Get-Command $fn -EA SilentlyContinue) { & $fn -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -Hostname $env:COMPUTERNAME }
                }
                $lastGovernance = Get-Date
            }
            if (((Get-Date)-$lastDriverScan).TotalSeconds -ge $cfg.DRIVER_SCAN_INTERVAL) { if (Get-Command Send-DriverInventory -EA SilentlyContinue) { Send-DriverInventory -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId }; $lastDriverScan = Get-Date }
            if (((Get-Date)-$lastDiskHealth).TotalSeconds -ge $cfg.DISK_HEALTH_INTERVAL) { if (Get-Command Send-DiskHealth -EA SilentlyContinue) { Send-DiskHealth -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -MachineId $machineId }; $lastDiskHealth = Get-Date }
            if (((Get-Date)-$lastNetworkDiag).TotalSeconds -ge $cfg.NETWORK_DIAG_INTERVAL) { if (Get-Command Send-NetworkDiagData -EA SilentlyContinue) { Send-NetworkDiagData -ApiUrl $BASE_URL -Token $COMPANY_TOKEN -Hostname $env:COMPUTERNAME }; $lastNetworkDiag = Get-Date }
        }

        # auto-heal do watchdog a cada 5 min
        if (((Get-Date)-$lastWatchdogCheck).TotalMinutes -ge 5) { Ensure-WatchdogTask; $lastWatchdogCheck = Get-Date }
        # modulos
        if (((Get-Date)-$lastModuleUpdate).TotalHours -ge $cfg.MODULE_UPDATE_HOURS) { Update-GovernanceModules; Import-GovernanceModules; $lastModuleUpdate = Get-Date }
        # self-update
        if (((Get-Date)-$lastSelfUpdate).TotalHours -ge $cfg.SELFUPDATE_HOURS) { Check-AgentUpdate; $lastSelfUpdate = Get-Date }

        $loopCount++
    } catch {
        $consecutiveFailures++
        Write-Log "Erro no loop (#$consecutiveFailures): $($_.Exception.Message)"
    }

    Write-Heartbeat $loopCount "sleep"
    if ($consecutiveFailures -gt 5) {
        $wait = [Math]::Min($cfg.CHECKIN_INTERVAL * [Math]::Pow(2,[Math]::Min($consecutiveFailures-5,5)), 600)
        Write-Log "Muitas falhas ($consecutiveFailures), aguardando $([int]$wait)s..."
        Start-Sleep -Seconds ([int]$wait)
    } else {
        Start-Sleep -Seconds $cfg.CHECKIN_INTERVAL
    }
}

# SIG # Begin signature block
# MIIdrwYJKoZIhvcNAQcCoIIdoDCCHZwCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCDfc8elVpXizv2M
# SfSg0Ec+r+0r17wIOG+/2+vVE1PoB6CCF2gwggQqMIICkqADAgECAhBz5g8PdNx1
# ukWTcGHAOULUMA0GCSqGSIb3DQEBCwUAMC0xKzApBgNVBAMMIldpbm5lciBUZWNu
# b2xvZ2lhIFJNTSBDb2RlIFNpZ25pbmcwHhcNMjYwNzA3MjI0MDM5WhcNMzEwNzA3
# MjI1MDM5WjAtMSswKQYDVQQDDCJXaW5uZXIgVGVjbm9sb2dpYSBSTU0gQ29kZSBT
# aWduaW5nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEApgjU2orRLrT+
# DNdhb7UCoObUhbIhLCaBOJI3pTKD675CVnTtldA5kO15Dfgr8BS6i9SseEjDP444
# NFuVZe/2uhE6ejlIAOmBDyQ+qDpDf1ulvsXH/ebNATcE/KzLg9/+FYqjodmq6YXB
# A/cxqb+wCQofZP1p/SYkfnXODTCy8Db9fJsZxZY7VhurAc7s1XbWcIR5Gn23TMhv
# qUiIpIPd8KT7/3n5WjFDz0G/B6FpdxW23rb9DzKnslFjfF236fJfKDgi3V5Wsmv2
# SP2i8gu7l8YGDcTRjx8RokQXn10N5qfD9eFsIDfZ1VIp+kUYIpQ50snSxN9qy3Vh
# ItuLsRtJGqKYx+ya00VEvHLqFJBtkY6JR5UPjAcBlCrXlfRDCS1b7r79pCYaWiIT
# lKZ+OTFfzbB9aOML7duphGPAZYAhcAeBllt4nMB4Ylxc7VGBMEHDAu5rIAd9DkhA
# kI9wv7+nvHng0yOVZsnK3LCpICurlL1PDRJRR/MK2WHitsPnL2phAgMBAAGjRjBE
# MA4GA1UdDwEB/wQEAwIHgDATBgNVHSUEDDAKBggrBgEFBQcDAzAdBgNVHQ4EFgQU
# ju7FKy0SNkNIB458eOXu1zrpz2owDQYJKoZIhvcNAQELBQADggGBAIQn3Ran7T0Q
# xDhAf+sre5GM0wMg2ByNdwMlYzvr97pxfGrGk0ss2Y61MQxunfhIF1fjwysM2f/e
# oK/OdpH4AFUP/Ior9vWbpCpcO0clPjdjrgcJOqzjq5zrbnXPezDtAuQsOkl3Dy18
# WU4pV0SG0UvhT3zctGk4wmtwGzyjMl7f+gftMolu+agXKd32YWCSMl1IJroXphay
# N+Fo74sIHTLW3HsJ7bOjQ3M6swACQXvR7Z7Lg7LpQywuGcNqXnUQO2zzvCKjzn2x
# 6hYWKtdQOmbX6XDAihQCQPU0Ew48NN0RK47qCQKtM9UjWt/t02oLq+1ILSXF6/tW
# cHCDA0nP7ThF2kbPHrloxUnj42eQC3E8ee4jQMMe3TH+eNVX+8T5XAIYf0g1rjLQ
# IJcGjp5BqxTHsIL2+/liXp/duwiKFVJ2XSR+HvJVcxkYqolD2332PaE2Qi4yUs3a
# Ag9pst8DXo5CTx/LrkQ2QRUGvuYMMkJItTn0E8irwrHBLltbfxR2LzCCBY0wggR1
# oAMCAQICEA6bGI750C3n79tQ4ghAGFowDQYJKoZIhvcNAQEMBQAwZTELMAkGA1UE
# BhMCVVMxFTATBgNVBAoTDERpZ2lDZXJ0IEluYzEZMBcGA1UECxMQd3d3LmRpZ2lj
# ZXJ0LmNvbTEkMCIGA1UEAxMbRGlnaUNlcnQgQXNzdXJlZCBJRCBSb290IENBMB4X
# DTIyMDgwMTAwMDAwMFoXDTMxMTEwOTIzNTk1OVowYjELMAkGA1UEBhMCVVMxFTAT
# BgNVBAoTDERpZ2lDZXJ0IEluYzEZMBcGA1UECxMQd3d3LmRpZ2ljZXJ0LmNvbTEh
# MB8GA1UEAxMYRGlnaUNlcnQgVHJ1c3RlZCBSb290IEc0MIICIjANBgkqhkiG9w0B
# AQEFAAOCAg8AMIICCgKCAgEAv+aQc2jeu+RdSjwwIjBpM+zCpyUuySE98orYWcLh
# Kac9WKt2ms2uexuEDcQwH/MbpDgW61bGl20dq7J58soR0uRf1gU8Ug9SH8aeFaV+
# vp+pVxZZVXKvaJNwwrK6dZlqczKU0RBEEC7fgvMHhOZ0O21x4i0MG+4g1ckgHWMp
# Lc7sXk7Ik/ghYZs06wXGXuxbGrzryc/NrDRAX7F6Zu53yEioZldXn1RYjgwrt0+n
# MNlW7sp7XeOtyU9e5TXnMcvak17cjo+A2raRmECQecN4x7axxLVqGDgDEI3Y1Dek
# LgV9iPWCPhCRcKtVgkEy19sEcypukQF8IUzUvK4bA3VdeGbZOjFEmjNAvwjXWkmk
# wuapoGfdpCe8oU85tRFYF/ckXEaPZPfBaYh2mHY9WV1CdoeJl2l6SPDgohIbZpp0
# yt5LHucOY67m1O+SkjqePdwA5EUlibaaRBkrfsCUtNJhbesz2cXfSwQAzH0clcOP
# 9yGyshG3u3/y1YxwLEFgqrFjGESVGnZifvaAsPvoZKYz0YkH4b235kOkGLimdwHh
# D5QMIR2yVCkliWzlDlJRR3S+Jqy2QXXeeqxfjT/JvNNBERJb5RBQ6zHFynIWIgnf
# fEx1P2PsIV/EIFFrb7GrhotPwtZFX50g/KEexcCPorF+CiaZ9eRpL5gdLfXZqbId
# 5RsCAwEAAaOCATowggE2MA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFOzX44LS
# cV1kTN8uZz/nupiuHA9PMB8GA1UdIwQYMBaAFEXroq/0ksuCMS1Ri6enIZ3zbcgP
# MA4GA1UdDwEB/wQEAwIBhjB5BggrBgEFBQcBAQRtMGswJAYIKwYBBQUHMAGGGGh0
# dHA6Ly9vY3NwLmRpZ2ljZXJ0LmNvbTBDBggrBgEFBQcwAoY3aHR0cDovL2NhY2Vy
# dHMuZGlnaWNlcnQuY29tL0RpZ2lDZXJ0QXNzdXJlZElEUm9vdENBLmNydDBFBgNV
# HR8EPjA8MDqgOKA2hjRodHRwOi8vY3JsMy5kaWdpY2VydC5jb20vRGlnaUNlcnRB
# c3N1cmVkSURSb290Q0EuY3JsMBEGA1UdIAQKMAgwBgYEVR0gADANBgkqhkiG9w0B
# AQwFAAOCAQEAcKC/Q1xV5zhfoKN0Gz22Ftf3v1cHvZqsoYcs7IVeqRq7IviHGmlU
# Iu2kiHdtvRoU9BNKei8ttzjv9P+Aufih9/Jy3iS8UgPITtAq3votVs/59PesMHqa
# i7Je1M/RQ0SbQyHrlnKhSLSZy51PpwYDE3cnRNTnf+hZqPC/Lwum6fI0POz3A8eH
# qNJMQBk1RmppVLC4oVaO7KTVPeix3P0c2PR3WlxUjG/voVA9/HYJaISfb8rbII01
# YBwCA8sgsKxYoA5AY8WYIsGyWfVVa88nq2x2zm8jLfR+cWojayL/ErhULSd+2DrZ
# 8LaHlv1b0VysGMNNn3O3AamfV6peKOK5lDCCBrQwggScoAMCAQICEA3HrFcF/yGZ
# LkBDIgw6SYYwDQYJKoZIhvcNAQELBQAwYjELMAkGA1UEBhMCVVMxFTATBgNVBAoT
# DERpZ2lDZXJ0IEluYzEZMBcGA1UECxMQd3d3LmRpZ2ljZXJ0LmNvbTEhMB8GA1UE
# AxMYRGlnaUNlcnQgVHJ1c3RlZCBSb290IEc0MB4XDTI1MDUwNzAwMDAwMFoXDTM4
# MDExNDIzNTk1OVowaTELMAkGA1UEBhMCVVMxFzAVBgNVBAoTDkRpZ2lDZXJ0LCBJ
# bmMuMUEwPwYDVQQDEzhEaWdpQ2VydCBUcnVzdGVkIEc0IFRpbWVTdGFtcGluZyBS
# U0E0MDk2IFNIQTI1NiAyMDI1IENBMTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCC
# AgoCggIBALR4MdMKmEFyvjxGwBysddujRmh0tFEXnU2tjQ2UtZmWgyxU7UNqEY81
# FzJsQqr5G7A6c+Gh/qm8Xi4aPCOo2N8S9SLrC6Kbltqn7SWCWgzbNfiR+2fkHUil
# jNOqnIVD/gG3SYDEAd4dg2dDGpeZGKe+42DFUF0mR/vtLa4+gKPsYfwEu7EEbkC9
# +0F2w4QJLVSTEG8yAR2CQWIM1iI5PHg62IVwxKSpO0XaF9DPfNBKS7Zazch8NF5v
# p7eaZ2CVNxpqumzTCNSOxm+SAWSuIr21Qomb+zzQWKhxKTVVgtmUPAW35xUUFREm
# DrMxSNlr/NsJyUXzdtFUUt4aS4CEeIY8y9IaaGBpPNXKFifinT7zL2gdFpBP9qh8
# SdLnEut/GcalNeJQ55IuwnKCgs+nrpuQNfVmUB5KlCX3ZA4x5HHKS+rqBvKWxdCy
# QEEGcbLe1b8Aw4wJkhU1JrPsFfxW1gaou30yZ46t4Y9F20HHfIY4/6vHespYMQmU
# iote8ladjS/nJ0+k6MvqzfpzPDOy5y6gqztiT96Fv/9bH7mQyogxG9QEPHrPV6/7
# umw052AkyiLA6tQbZl1KhBtTasySkuJDpsZGKdlsjg4u70EwgWbVRSX1Wd4+zoFp
# p4Ra+MlKM2baoD6x0VR4RjSpWM8o5a6D8bpfm4CLKczsG7ZrIGNTAgMBAAGjggFd
# MIIBWTASBgNVHRMBAf8ECDAGAQH/AgEAMB0GA1UdDgQWBBTvb1NK6eQGfHrK4pBW
# 9i/USezLTjAfBgNVHSMEGDAWgBTs1+OC0nFdZEzfLmc/57qYrhwPTzAOBgNVHQ8B
# Af8EBAMCAYYwEwYDVR0lBAwwCgYIKwYBBQUHAwgwdwYIKwYBBQUHAQEEazBpMCQG
# CCsGAQUFBzABhhhodHRwOi8vb2NzcC5kaWdpY2VydC5jb20wQQYIKwYBBQUHMAKG
# NWh0dHA6Ly9jYWNlcnRzLmRpZ2ljZXJ0LmNvbS9EaWdpQ2VydFRydXN0ZWRSb290
# RzQuY3J0MEMGA1UdHwQ8MDowOKA2oDSGMmh0dHA6Ly9jcmwzLmRpZ2ljZXJ0LmNv
# bS9EaWdpQ2VydFRydXN0ZWRSb290RzQuY3JsMCAGA1UdIAQZMBcwCAYGZ4EMAQQC
# MAsGCWCGSAGG/WwHATANBgkqhkiG9w0BAQsFAAOCAgEAF877FoAc/gc9EXZxML2+
# C8i1NKZ/zdCHxYgaMH9Pw5tcBnPw6O6FTGNpoV2V4wzSUGvI9NAzaoQk97frPBtI
# j+ZLzdp+yXdhOP4hCFATuNT+ReOPK0mCefSG+tXqGpYZ3essBS3q8nL2UwM+NMvE
# uBd/2vmdYxDCvwzJv2sRUoKEfJ+nN57mQfQXwcAEGCvRR2qKtntujB71WPYAgwPy
# WLKu6RnaID/B0ba2H3LUiwDRAXx1Neq9ydOal95CHfmTnM4I+ZI2rVQfjXQA1WSj
# jf4J2a7jLzWGNqNX+DF0SQzHU0pTi4dBwp9nEC8EAqoxW6q17r0z0noDjs6+BFo+
# z7bKSBwZXTRNivYuve3L2oiKNqetRHdqfMTCW/NmKLJ9M+MtucVGyOxiDf06VXxy
# KkOirv6o02OoXN4bFzK0vlNMsvhlqgF2puE6FndlENSmE+9JGYxOGLS/D284NHNb
# oDGcmWXfwXRy4kbu4QFhOm0xJuF2EZAOk5eCkhSxZON3rGlHqhpB/8MluDezooIs
# 8CVnrpHMiD2wL40mm53+/j7tFaxYKIqL0Q4ssd8xHZnIn/7GELH3IdvG2XlM9q7W
# P/UwgOkw/HQtyRN62JK4S1C8uw3PdBunvAZapsiI5YKdvlarEvf8EA+8hcpSM9LH
# JmyrxaFtoza2zNaQ9k+5t1wwggbtMIIE1aADAgECAhAKgO8YS43xBYLRxHanlXRo
# MA0GCSqGSIb3DQEBCwUAMGkxCzAJBgNVBAYTAlVTMRcwFQYDVQQKEw5EaWdpQ2Vy
# dCwgSW5jLjFBMD8GA1UEAxM4RGlnaUNlcnQgVHJ1c3RlZCBHNCBUaW1lU3RhbXBp
# bmcgUlNBNDA5NiBTSEEyNTYgMjAyNSBDQTEwHhcNMjUwNjA0MDAwMDAwWhcNMzYw
# OTAzMjM1OTU5WjBjMQswCQYDVQQGEwJVUzEXMBUGA1UEChMORGlnaUNlcnQsIElu
# Yy4xOzA5BgNVBAMTMkRpZ2lDZXJ0IFNIQTI1NiBSU0E0MDk2IFRpbWVzdGFtcCBS
# ZXNwb25kZXIgMjAyNSAxMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA
# 0EasLRLGntDqrmBWsytXum9R/4ZwCgHfyjfMGUIwYzKomd8U1nH7C8Dr0cVMF3Bs
# fAFI54um8+dnxk36+jx0Tb+k+87H9WPxNyFPJIDZHhAqlUPt281mHrBbZHqRK71E
# m3/hCGC5KyyneqiZ7syvFXJ9A72wzHpkBaMUNg7MOLxI6E9RaUueHTQKWXymOtRw
# JXcrcTTPPT2V1D/+cFllESviH8YjoPFvZSjKs3SKO1QNUdFd2adw44wDcKgH+JRJ
# E5Qg0NP3yiSyi5MxgU6cehGHr7zou1znOM8odbkqoK+lJ25LCHBSai25CFyD23DZ
# gPfDrJJJK77epTwMP6eKA0kWa3osAe8fcpK40uhktzUd/Yk0xUvhDU6lvJukx7jp
# hx40DQt82yepyekl4i0r8OEps/FNO4ahfvAk12hE5FVs9HVVWcO5J4dVmVzix4A7
# 7p3awLbr89A90/nWGjXMGn7FQhmSlIUDy9Z2hSgctaepZTd0ILIUbWuhKuAeNIeW
# rzHKYueMJtItnj2Q+aTyLLKLM0MheP/9w6CtjuuVHJOVoIJ/DtpJRE7Ce7vMRHoR
# on4CWIvuiNN1Lk9Y+xZ66lazs2kKFSTnnkrT3pXWETTJkhd76CIDBbTRofOsNyEh
# zZtCGmnQigpFHti58CSmvEyJcAlDVcKacJ+A9/z7eacCAwEAAaOCAZUwggGRMAwG
# A1UdEwEB/wQCMAAwHQYDVR0OBBYEFOQ7/PIx7f391/ORcWMZUEPPYYzoMB8GA1Ud
# IwQYMBaAFO9vU0rp5AZ8esrikFb2L9RJ7MtOMA4GA1UdDwEB/wQEAwIHgDAWBgNV
# HSUBAf8EDDAKBggrBgEFBQcDCDCBlQYIKwYBBQUHAQEEgYgwgYUwJAYIKwYBBQUH
# MAGGGGh0dHA6Ly9vY3NwLmRpZ2ljZXJ0LmNvbTBdBggrBgEFBQcwAoZRaHR0cDov
# L2NhY2VydHMuZGlnaWNlcnQuY29tL0RpZ2lDZXJ0VHJ1c3RlZEc0VGltZVN0YW1w
# aW5nUlNBNDA5NlNIQTI1NjIwMjVDQTEuY3J0MF8GA1UdHwRYMFYwVKBSoFCGTmh0
# dHA6Ly9jcmwzLmRpZ2ljZXJ0LmNvbS9EaWdpQ2VydFRydXN0ZWRHNFRpbWVTdGFt
# cGluZ1JTQTQwOTZTSEEyNTYyMDI1Q0ExLmNybDAgBgNVHSAEGTAXMAgGBmeBDAEE
# AjALBglghkgBhv1sBwEwDQYJKoZIhvcNAQELBQADggIBAGUqrfEcJwS5rmBB7NEI
# RJ5jQHIh+OT2Ik/bNYulCrVvhREafBYF0RkP2AGr181o2YWPoSHz9iZEN/FPsLST
# wVQWo2H62yGBvg7ouCODwrx6ULj6hYKqdT8wv2UV+Kbz/3ImZlJ7YXwBD9R0oU62
# PtgxOao872bOySCILdBghQ/ZLcdC8cbUUO75ZSpbh1oipOhcUT8lD8QAGB9lctZT
# TOJM3pHfKBAEcxQFoHlt2s9sXoxFizTeHihsQyfFg5fxUFEp7W42fNBVN4ueLace
# Rf9Cq9ec1v5iQMWTFQa0xNqItH3CPFTG7aEQJmmrJTV3Qhtfparz+BW60OiMEgV5
# GWoBy4RVPRwqxv7Mk0Sy4QHs7v9y69NBqycz0BZwhB9WOfOu/CIJnzkQTwtSSpGG
# hLdjnQ4eBpjtP+XB3pQCtv4E5UCSDag6+iX8MmB10nfldPF9SVD7weCC3yXZi/uu
# hqdwkgVxuiMFzGVFwYbQsiGnoa9F5AaAyBjFBtXVLcKtapnMG3VH3EmAp/jsJ3FV
# F3+d1SVDTmjFjLbNFZUWMXuZyvgLfgyPehwJVxwC+UpX2MSey2ueIu9THFVkT+um
# 1vshETaWyQo8gmBto/m3acaP9QsuLj3FNwFlTxq25+T4QwX9xa6ILs84ZPvmpovq
# 90K8eWyG2N01c4IhSOxqt81nMYIFnTCCBZkCAQEwQTAtMSswKQYDVQQDDCJXaW5u
# ZXIgVGVjbm9sb2dpYSBSTU0gQ29kZSBTaWduaW5nAhBz5g8PdNx1ukWTcGHAOULU
# MA0GCWCGSAFlAwQCAQUAoIGEMBgGCisGAQQBgjcCAQwxCjAIoAKAAKECgAAwGQYJ
# KoZIhvcNAQkDMQwGCisGAQQBgjcCAQQwHAYKKwYBBAGCNwIBCzEOMAwGCisGAQQB
# gjcCARUwLwYJKoZIhvcNAQkEMSIEIANcLr+MolX+sYoPhomn2VMr/2D5hhKZRPEZ
# RH9floWLMA0GCSqGSIb3DQEBAQUABIIBgIPgg7PMp/p2SmlvSW1H6XDna+SO9rKY
# 5kEuR6olC00xNyzsOBsFmCp5d4OiFQlYhxoM8lMrgDxXtw792Da2H9PNz1kIbvOV
# NRvhGiUrAPJiHjbUkZv/zJzxTNeQ+lBFbiutH3UKu1fuPEVBeg9+vnpBy0JbBjTW
# NGbzypT9o8la8/bAgZ0qQ9b3VSbfmAm5Y21YJVn145hQlNHW6PxZ0qicEh3XVPm7
# LhPMJY/d7oF9q+SEFkufqTVyeiO5RYBDLLal7bKpNUxKm2rZn76KVtbuau/YrI9V
# gHhWwKs0a9A3Nlif577J0k3S39kMuWMYTbG++e+DGRfyunVhrY+d6kwUqS8wD4mz
# QabfOjWrhtJQ/b3K6O1SwYyAYVlUMYg3cQpW3HSp8HpS9h6jTGD1xyV8YXVloSI7
# MzMyZ6d88GBhavZYfWZftDau0w9rUNx1LT0phQR1aq4/vBRmj6CYZoBd5kiyqO+U
# gau558U/LYCewdwmm9sexckRlouHSVWZmqGCAyYwggMiBgkqhkiG9w0BCQYxggMT
# MIIDDwIBATB9MGkxCzAJBgNVBAYTAlVTMRcwFQYDVQQKEw5EaWdpQ2VydCwgSW5j
# LjFBMD8GA1UEAxM4RGlnaUNlcnQgVHJ1c3RlZCBHNCBUaW1lU3RhbXBpbmcgUlNB
# NDA5NiBTSEEyNTYgMjAyNSBDQTECEAqA7xhLjfEFgtHEdqeVdGgwDQYJYIZIAWUD
# BAIBBQCgaTAYBgkqhkiG9w0BCQMxCwYJKoZIhvcNAQcBMBwGCSqGSIb3DQEJBTEP
# Fw0yNjA3MDgxMjEwNTVaMC8GCSqGSIb3DQEJBDEiBCDHDozvpxfe0Jj9qjzXpXHP
# BEvKTmHd7BaOhQD1ERib/zANBgkqhkiG9w0BAQEFAASCAgB3zSnMvyLLBPoPxNln
# zdGCFgvHSeHo8rBWnSWgiWeCAHDNpPB/AEgOxZbS/Ml3pengX5GqMkhYGHw2IQoQ
# pZRA1d5wiw5mtKXoY+L/+Ie711rrVu0T7XDMz9LWVEJ5RWMtbErP7SyliZL7elFx
# LOkLE+jS7/odCe/h1tdIMvNgxQvQ77sMAMOcoqsoJuEmvt2oYVFQ3att6kY/LCvB
# l/vk6jd95Hnua/OdRSTBjkHj+gBo9gcPBO/5HBb7rfcLrA7J8JJ6Dhepbww6UT2f
# BT+9w2xm/EnBFAk0vBLU/Y2FNGvkdjQLgNMWSTERyHdmItD76XIdBRtlc5d776yN
# e6sLifJc3u1v+oY5nWqT1WxasqrlS+Xykh+SVUoKoT6+9sOvFOrSYNveWYXT4udA
# iSO9i8MbMcfFEv6/P9OZWNRrJK6ODTiL49k3/taZn8IQNvgBpO16zbo31moc2wQB
# O8wvPRr7umxuCtebNWUeWhq3Vj0Fe5pvi9DRxZjn+7ltKaHkSjG6aU29UNNOVAzC
# kEt751edx3r3DgxwXYQwEdGo2DdFYKehrbhf5M/gydAZ+TXv5Nr6GwQBnctnGBBy
# W9uqeIuX0v1NgyEJYLHIzmInlsjoyn4fD09ZNIduk1Z6BS5IBWVGiM2AU7hAb3A+
# zOiJaCxRsq1Lf7vmzhPWsaNSEQ==
# SIG # End signature block
