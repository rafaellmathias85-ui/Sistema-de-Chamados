# ============================================
# Watchdog RMM v3.0 - Winner Tecnologia
# Verifica se o Windows Service esta rodando
# Se nao: recria NSSM + service + reinicia
# Reporta health ao servidor (Melhoria D)
# ============================================

$ErrorActionPreference = "SilentlyContinue"

# ======= CONFIGURACAO (PREENCHIDO PELO SERVIDOR) =======
$API_URL = "{{API_URL}}"
$COMPANY_TOKEN = "{{COMPANY_TOKEN}}"
$FALLBACK_API_URL = "{{FALLBACK_API_URL}}"
# ========================================================

$InstallDir = "C:\ProgramData\WinnerRMM"
$LogFile = "$InstallDir\watchdog.log"
$NssmExe = "$InstallDir\nssm.exe"
$AgentFile = "$InstallDir\agente_rmm.ps1"
$ServiceName = "WinnerRMMService"
$VersionFile = "$InstallDir\agent_version"
# Extrair base URL (sem /api/rmm) para assets estaticos
$BASE_SITE_URL = $API_URL -replace '/api/rmm/?$', ''
$FALLBACK_SITE_URL = $FALLBACK_API_URL -replace '/api/rmm/?$', ''
$NssmUrls = @(
    "$BASE_SITE_URL/rmm/nssm-2.24-win64.zip",
    "$FALLBACK_SITE_URL/rmm/nssm-2.24-win64.zip",
    "https://github.com/ONLYOFFICE/nssm/releases/download/v2.24/nssm_x64.zip",
    "https://nssm.cc/release/nssm-2.24.zip"
)

# Forcar TLS 1.2+
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 } catch {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
}

function Write-WatchdogLog($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue
    # Rotacao: max 2MB
    try {
        $item = Get-Item $LogFile -ErrorAction SilentlyContinue
        if ($item -and $item.Length -gt 2MB) {
            $content = Get-Content $LogFile -Tail 500
            Set-Content -Path $LogFile -Value $content -Force
        }
    } catch {}
}

# ============ NSSM MANAGEMENT ============
function Ensure-Nssm {
    if (Test-Path $NssmExe) { return $true }
    Write-WatchdogLog "NSSM nao encontrado. Tentando download com fallback..."
    foreach ($nssmUrl in $NssmUrls) {
        try {
            Write-WatchdogLog "Tentando: $nssmUrl"
            $zipPath = "$InstallDir\nssm.zip"
            Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            if ((Get-Item $zipPath).Length -lt 10000) {
                throw "Download corrompido"
            }
            $extractDir = "$InstallDir\nssm_extract"
            Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
            $found = Get-ChildItem -Path $extractDir -Recurse -Filter "nssm.exe" | Where-Object {
                $_.DirectoryName -match "win64"
            } | Select-Object -First 1
            if (-not $found) {
                $found = Get-ChildItem -Path $extractDir -Recurse -Filter "nssm.exe" | Select-Object -First 1
            }
            if ($found) {
                Copy-Item -Path $found.FullName -Destination $NssmExe -Force
                Write-WatchdogLog "NSSM instalado: $NssmExe"
            }
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
            if (Test-Path $NssmExe) { return $true }
        } catch {
            Write-WatchdogLog "Falha em ${nssmUrl}: $($_.Exception.Message)"
            Remove-Item "$InstallDir\nssm.zip" -Force -ErrorAction SilentlyContinue
            Remove-Item "$InstallDir\nssm_extract" -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    Write-WatchdogLog "ERRO: Nenhuma URL do NSSM funcionou"
    return $false
}

function Install-WinnerService {
    if (-not (Test-Path $AgentFile)) {
        Write-WatchdogLog "ERRO: Agente nao encontrado em $AgentFile"
        return $false
    }
    if (-not (Ensure-Nssm)) {
        Write-WatchdogLog "ERRO: Nao foi possivel obter NSSM"
        return $false
    }
    try {
        # Remover service anterior se existir
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svc) {
            & $NssmExe stop $ServiceName 2>&1 | Out-Null
            Start-Sleep -Seconds 2
            & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
            Start-Sleep -Seconds 2
        }
        # Instalar novo service
        & $NssmExe install $ServiceName "powershell.exe" "-ExecutionPolicy Bypass -NonInteractive -File `"$AgentFile`"" 2>&1 | Out-Null
        & $NssmExe set $ServiceName DisplayName "Winner RMM Agent" 2>&1 | Out-Null
        & $NssmExe set $ServiceName Description "Agente de monitoramento remoto - Winner Tecnologia" 2>&1 | Out-Null
        & $NssmExe set $ServiceName Start SERVICE_AUTO_START 2>&1 | Out-Null
        & $NssmExe set $ServiceName ObjectName LocalSystem 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppStdout "$InstallDir\service_stdout.log" 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppStderr "$InstallDir\service_stderr.log" 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppRotateFiles 1 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppRotateBytes 5242880 2>&1 | Out-Null

        # Melhoria A: Configurar SCM failure recovery
        # Restart apos 10s na 1a falha, 30s na 2a, 60s na 3a. Reset counter apos 24h.
        & sc.exe failure $ServiceName reset= 86400 actions= restart/10000/restart/30000/restart/60000 2>&1 | Out-Null

        # Iniciar o servico
        & $NssmExe start $ServiceName 2>&1 | Out-Null
        Write-WatchdogLog "Service $ServiceName instalado e iniciado com sucesso"
        return $true
    } catch {
        Write-WatchdogLog "Erro ao instalar service: $($_.Exception.Message)"
        return $false
    }
}

# ============ HEALTH CHECK ============
function Get-ServiceHealth {
    $health = @{
        service_exists = $false
        service_running = $false
        nssm_exists = (Test-Path $NssmExe)
        agent_exists = (Test-Path $AgentFile)
        agent_version = $null
    }
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        $health.service_exists = $true
        $health.service_running = ($svc.Status -eq 'Running')
    }
    if (Test-Path $VersionFile) {
        $health.agent_version = (Get-Content $VersionFile -ErrorAction SilentlyContinue).Trim()
    }
    return $health
}

# ============ MELHORIA D: HEARTBEAT PARA O SERVIDOR ============
function Send-WatchdogHeartbeat($health, $action) {
    try {
        $body = @{
            hostname = $env:COMPUTERNAME
            token = $COMPANY_TOKEN
            service_exists = $health.service_exists
            service_running = $health.service_running
            nssm_exists = $health.nssm_exists
            agent_exists = $health.agent_exists
            agent_version = $health.agent_version
            watchdog_action = $action
            timestamp = (Get-Date).ToString("o")
        } | ConvertTo-Json -Depth 3

        $servers = @($API_URL)
        if ($FALLBACK_API_URL -and $FALLBACK_API_URL -ne '' -and $FALLBACK_API_URL -ne '{{FALLBACK_API_URL}}') {
            $servers += $FALLBACK_API_URL
        }
        foreach ($serverUrl in $servers) {
            $url = ($serverUrl -replace '/api/rmm$', '') + "/api/rmm/agent/watchdog-heartbeat"
            try {
                Invoke-RestMethod -Uri $url -Method POST `
                    -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
                    -ContentType "application/json; charset=utf-8" `
                    -TimeoutSec 15 -ErrorAction Stop | Out-Null
                return
            } catch { continue }
        }
    } catch {
        Write-WatchdogLog "Erro ao enviar heartbeat: $($_.Exception.Message)"
    }
}

# ============ MAIN WATCHDOG LOGIC ============
Write-WatchdogLog "=== Watchdog executado ==="

$health = Get-ServiceHealth
$action = "none"

if (-not $health.agent_exists) {
    Write-WatchdogLog "CRITICO: Agente nao encontrado em $AgentFile! Watchdog nao pode recuperar."
    $action = "agent_missing"
} elseif (-not $health.service_exists) {
    Write-WatchdogLog "Service $ServiceName nao existe. Recriando..."
    $success = Install-WinnerService
    $action = if ($success) { "service_recreated" } else { "service_recreate_failed" }
    $health = Get-ServiceHealth
} elseif (-not $health.service_running) {
    Write-WatchdogLog "Service $ServiceName parado. Tentando iniciar..."
    try {
        Start-Service -Name $ServiceName -ErrorAction Stop
        Start-Sleep -Seconds 3
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') {
            Write-WatchdogLog "Service reiniciado com sucesso"
            $action = "service_restarted"
        } else {
            Write-WatchdogLog "Service nao iniciou. Reinstalando..."
            $success = Install-WinnerService
            $action = if ($success) { "service_reinstalled" } else { "service_reinstall_failed" }
        }
    } catch {
        Write-WatchdogLog "Erro ao iniciar service: $($_.Exception.Message). Reinstalando..."
        $success = Install-WinnerService
        $action = if ($success) { "service_reinstalled" } else { "service_reinstall_failed" }
    }
    $health = Get-ServiceHealth
} else {
    Write-WatchdogLog "Service $ServiceName OK (Running)"
    $action = "healthy"
}

# Verificar se NSSM existe (pode ter sido deletado)
if (-not $health.nssm_exists -and $health.agent_exists) {
    Write-WatchdogLog "NSSM ausente. Re-baixando..."
    Ensure-Nssm
}

# Enviar heartbeat ao servidor (Melhoria D)
Send-WatchdogHeartbeat $health $action

Write-WatchdogLog "Watchdog concluido. Acao: $action"
