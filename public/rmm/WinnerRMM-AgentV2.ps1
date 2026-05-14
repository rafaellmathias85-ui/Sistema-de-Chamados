# ============================================
# Agente RMM v2.0 - Winner Tecnologia
# Orquestrador modular com suporte a Governance
# Roda como Tarefa Agendada do Windows (SYSTEM)
# ============================================

$ErrorActionPreference = "SilentlyContinue"

# ======= CONFIGURACAO (PREENCHIDO PELO SERVIDOR) =======
$AGENT_VERSION = "2.0.0"
$API_URL = "{{API_URL}}"
$COMPANY_TOKEN = "{{COMPANY_TOKEN}}"
$AGENT_TYPE = "ps1"            # ps1 ou msi
$UPDATE_CHANNEL = "stable"     # stable, beta, canary
$CHECKIN_INTERVAL = 60         # segundos entre check-ins
$GOVERNANCE_INTERVAL = 300     # segundos entre coletas governance (5min)
$DRIVER_SCAN_INTERVAL = 86400  # segundos entre scans de drivers (24h)
# ========================================================

$InstallDir = "C:\ProgramData\WinnerRMM"
$ModulesDir = "$InstallDir\modules"
$LogFile = "$InstallDir\rmm_agent_v2.log"
$MachineIdFile = "$InstallDir\machine_id"

# Criar diretorios
New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
New-Item -Path $ModulesDir -ItemType Directory -Force | Out-Null

# Forcar TLS 1.2+
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 } catch {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
}

# ============ LOGGING ============
function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    # Rotacao: manter max 5MB
    if ((Get-Item $LogFile -ErrorAction SilentlyContinue).Length -gt 5MB) {
        $content = Get-Content $LogFile -Tail 1000
        Set-Content -Path $LogFile -Value $content -Force
    }
}

# ============ DOWNLOAD DE MODULOS ============
function Update-Modules {
    $moduleFiles = @(
        "WinnerRMM-Governance.psm1",
        "WinnerRMM-WebFilter.psm1",
        "WinnerRMM-Relay.psm1",
        "WinnerRMM-Update.psm1",
        "WinnerRMM-PolicyEngine.psm1"
    )
    
    foreach ($mod in $moduleFiles) {
        $localPath = "$ModulesDir\$mod"
        $remoteUrl = "$API_URL/rmm/modules/$mod"
        
        try {
            Invoke-WebRequest -Uri $remoteUrl -OutFile $localPath -UseBasicParsing -TimeoutSec 30
            Write-Log "[Modules] Updated: $mod"
        } catch {
            Write-Log "[Modules] Failed to download $mod : $($_.Exception.Message)"
        }
    }
}

function Import-AllModules {
    $moduleFiles = Get-ChildItem -Path $ModulesDir -Filter "*.psm1" -ErrorAction SilentlyContinue
    foreach ($mod in $moduleFiles) {
        try {
            Import-Module $mod.FullName -Force -Global -DisableNameChecking
            Write-Log "[Modules] Imported: $($mod.Name)"
        } catch {
            Write-Log "[Modules] Error importing $($mod.Name): $($_.Exception.Message)"
        }
    }
}

# ============ MACHINE ID ============
function Get-StoredMachineId {
    if (Test-Path $MachineIdFile) {
        return (Get-Content $MachineIdFile -ErrorAction SilentlyContinue).Trim()
    }
    return $null
}

function Set-StoredMachineId($id) {
    Set-Content -Path $MachineIdFile -Value $id -Force
}

# ============ MAIN LOOP ============
Write-Log "======================================="
Write-Log "Agente RMM v$AGENT_VERSION iniciando..."
Write-Log "API: $API_URL"
Write-Log "Token: $($COMPANY_TOKEN.Substring(0,8))..."
Write-Log "Tipo: $AGENT_TYPE | Canal: $UPDATE_CHANNEL"
Write-Log "======================================="

# Download/update dos modulos na inicializacao
Update-Modules
Import-AllModules

$lastGovernanceRun = (Get-Date).AddSeconds(-$GOVERNANCE_INTERVAL)
$lastDriverScan = (Get-Date).AddSeconds(-$DRIVER_SCAN_INTERVAL)
$lastUpdateCheck = (Get-Date).AddHours(-1)
$machineId = Get-StoredMachineId

while ($true) {
    try {
        # ====== CHECK-IN (a cada $CHECKIN_INTERVAL segundos) ======
        # O check-in envia dados da maquina e recebe tarefas
        # (Reutiliza a logica do agente v1 - mantida no servidor)
        
        $hostname = $env:COMPUTERNAME
        $user = (Get-WmiObject Win32_ComputerSystem).UserName
        $os = (Get-WmiObject Win32_OperatingSystem).Caption
        $ram = [math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
        
        $disk = Get-WmiObject Win32_DiskDrive | Select-Object -First 1
        $diskModel = $disk.Model
        $diskSize = "$([math]::Round([long]$disk.Size / 1GB, 2)) GB"
        
        $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match "Ethernet|Wi-Fi" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1).IPAddress
        
        $cpuModel = (Get-WmiObject Win32_Processor | Select-Object -First 1).Name
        $cpuUsage = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        $ramUsage = [math]::Round((1 - (Get-WmiObject Win32_OperatingSystem).FreePhysicalMemory / (Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory * 1024) * 100, 1)
        $diskUsage = (Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'" | ForEach-Object { [math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 1) })
        
        # TeamViewer ID
        $tvId = $null
        $tvReg = Get-ItemProperty "HKLM:\SOFTWARE\TeamViewer" -ErrorAction SilentlyContinue
        if ($tvReg -and $tvReg.ClientID) { $tvId = $tvReg.ClientID.ToString() }
        if (-not $tvId) {
            $tvReg = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\TeamViewer" -ErrorAction SilentlyContinue
            if ($tvReg -and $tvReg.ClientID) { $tvId = $tvReg.ClientID.ToString() }
        }
        
        $checkinBody = @{
            token = $COMPANY_TOKEN
            hostname = $hostname
            username = $user
            os = $os
            ram = "$ram GB"
            diskModel = $diskModel
            diskSize = $diskSize
            ipAddress = $ip
            cpuModel = $cpuModel
            cpuUsage = $cpuUsage
            ramUsage = $ramUsage
            diskUsage = $diskUsage
            teamviewerId = $tvId
        } | ConvertTo-Json -Depth 3
        
        $checkinRes = Invoke-RestMethod -Uri "$API_URL/api/rmm/checkin" -Method POST -Body $checkinBody -ContentType "application/json" -TimeoutSec 15
        
        if ($checkinRes.ok -and $checkinRes.machine_id) {
            if (-not $machineId -or $machineId -ne $checkinRes.machine_id) {
                $machineId = $checkinRes.machine_id
                Set-StoredMachineId $machineId
                Write-Log "[CheckIn] Machine ID: $machineId"
            }
        }
        
        # ====== GOVERNANCE (a cada $GOVERNANCE_INTERVAL) ======
        if ($machineId -and ((Get-Date) - $lastGovernanceRun).TotalSeconds -ge $GOVERNANCE_INTERVAL) {
            Write-Log "[Governance] Running governance collection..."
            
            # Atividade do endpoint
            if (Get-Command Send-ActivitySession -ErrorAction SilentlyContinue) {
                Send-ActivitySession -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId
            }
            
            # Eventos USB
            if (Get-Command Send-UsbEvents -ErrorAction SilentlyContinue) {
                Send-UsbEvents -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId
            }
            
            # Web Activity + Web Filter logs
            if (Get-Command Send-WebActivity -ErrorAction SilentlyContinue) {
                Send-WebActivity -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId
            }
            if (Get-Command Send-WebFilterLogs -ErrorAction SilentlyContinue) {
                Send-WebFilterLogs -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId
            }
            
            # Enforce politicas
            if (Get-Command Enforce-UsbPolicies -ErrorAction SilentlyContinue) {
                Enforce-UsbPolicies -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId
            }
            if (Get-Command Enforce-ProductivityPolicies -ErrorAction SilentlyContinue) {
                Enforce-ProductivityPolicies -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId
            }
            
            $lastGovernanceRun = Get-Date
        }
        
        # ====== DRIVER SCAN (a cada $DRIVER_SCAN_INTERVAL) ======
        if ($machineId -and ((Get-Date) - $lastDriverScan).TotalSeconds -ge $DRIVER_SCAN_INTERVAL) {
            if (Get-Command Send-DriverInventory -ErrorAction SilentlyContinue) {
                Write-Log "[Governance] Running driver inventory..."
                Send-DriverInventory -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId
            }
            $lastDriverScan = Get-Date
        }
        
        # ====== UPDATE CHECK (a cada 1 hora) ======
        if (((Get-Date) - $lastUpdateCheck).TotalHours -ge 1) {
            if (Get-Command Start-UpdateCheck -ErrorAction SilentlyContinue) {
                Start-UpdateCheck -ApiUrl $API_URL -Token $COMPANY_TOKEN -MachineId $machineId -CurrentVersion $AGENT_VERSION -AgentType $AGENT_TYPE -Channel $UPDATE_CHANNEL
            }
            $lastUpdateCheck = Get-Date
        }
        
    } catch {
        Write-Log "[MainLoop] Error: $($_.Exception.Message)"
    }
    
    Start-Sleep -Seconds $CHECKIN_INTERVAL
}
