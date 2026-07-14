# ============================================================
#  Watchdog RMM v4.0 - Winner Tecnologia
#  Cliente-agnostico (config.json + token DPAPI). Assine uma vez.
#
#  Recupera 3 cenarios (o V3.1 so cobria o 1o):
#   1. Servico parado/inexistente  -> start / reinstala (NSSM)
#   2. Servico "Running" mas TRAVADO (heartbeat velho) -> restart forcado
#   3. NSSM/agente sumiram          -> re-baixa / reinstala
#  Alem de: re-registrar a si mesmo e reportar heartbeat ao servidor.
# ============================================================

$ErrorActionPreference = "SilentlyContinue"

$InstallDir   = "C:\Program Files\WinnerRMM"
$SecureDir    = Join-Path $InstallDir "secure"
$HealthDir    = Join-Path $InstallDir "health"
$LogFile      = Join-Path $InstallDir "watchdog.log"
$NssmExe      = Join-Path $InstallDir "nssm.exe"
$AgentFile    = Join-Path $InstallDir "agente_rmm_v4.ps1"
$WatchdogFile = Join-Path $InstallDir "watchdog_v4.ps1"
$VersionFile  = Join-Path $InstallDir "agent_version"
$ConfigFile   = Join-Path $InstallDir "config.json"
$TokenFile    = Join-Path $SecureDir  "token.dat"
$HeartbeatFile= Join-Path $HealthDir  "heartbeat.json"
$ServiceName  = "WinnerRMMService"
$WatchdogTaskName = "WinnerRMMWatchdog"

# ---------- Config ----------
$API_URL = "https://wticorp.com.br/api/rmm"; $FALLBACK_API_URL = ""; $CHECKIN_INTERVAL = 60
if (Test-Path $ConfigFile) {
    try { $c = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if ($c.API_URL) { $API_URL = $c.API_URL }
        if ($c.FALLBACK_API_URL) { $FALLBACK_API_URL = $c.FALLBACK_API_URL }
        if ($c.CHECKIN_INTERVAL) { $CHECKIN_INTERVAL = [int]$c.CHECKIN_INTERVAL }
    } catch {}
}
# limite de "heartbeat velho" = 3x o intervalo de checkin, minimo 180s
$HB_STALE_SEC = [Math]::Max($CHECKIN_INTERVAL * 3, 180)

$BASE_SITE_URL = $API_URL -replace '/api/rmm/?$',''
$NssmUrls = @(
    "$BASE_SITE_URL/rmm/nssm-2.24-win64.zip",
    "https://github.com/ONLYOFFICE/nssm/releases/download/v2.24/nssm_x64.zip",
    "https://nssm.cc/release/nssm-2.24.zip"
)

try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 }
catch { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {} }

function Write-WatchdogLog($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue
    try { $i = Get-Item $LogFile -EA SilentlyContinue; if ($i -and $i.Length -gt 2MB) { Set-Content -Path $LogFile -Value (Get-Content $LogFile -Tail 500) -Force } } catch {}
}

function Get-CompanyToken {
    if (Test-Path $TokenFile) {
        try {
            Add-Type -AssemblyName System.Security -EA SilentlyContinue
            $enc = [Convert]::FromBase64String((Get-Content $TokenFile -Raw).Trim())
            $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($enc,$null,'LocalMachine')
            return [System.Text.Encoding]::UTF8.GetString($bytes)
        } catch {}
    }
    if (Test-Path $ConfigFile) { try { $c = Get-Content $ConfigFile -Raw | ConvertFrom-Json; if ($c.COMPANY_TOKEN) { return $c.COMPANY_TOKEN } } catch {} }
    return ""
}
$COMPANY_TOKEN = Get-CompanyToken

# ============ ZIP / NSSM ============
function Extract-ZipCompat {
    param([string]$ZipFile,[string]$Destination)
    if (Test-Path $Destination) { Remove-Item $Destination -Recurse -Force -EA SilentlyContinue }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    if (Get-Command Expand-Archive -EA SilentlyContinue) { Expand-Archive -Path $ZipFile -DestinationPath $Destination -Force; return }
    try { Add-Type -AssemblyName System.IO.Compression.FileSystem -EA Stop; [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipFile,$Destination); return } catch {}
    $shell = New-Object -ComObject Shell.Application
    $shell.NameSpace((Resolve-Path $Destination).Path).CopyHere($shell.NameSpace((Resolve-Path $ZipFile).Path).Items(),0x14)
}
function Ensure-Nssm {
    if (Test-Path $NssmExe) { return $true }
    Write-WatchdogLog "NSSM ausente. Baixando..."
    foreach ($u in $NssmUrls) {
        try {
            $zip = Join-Path $InstallDir "nssm.zip"
            Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            if ((Get-Item $zip).Length -lt 10000) { throw "download corrompido" }
            $ex = Join-Path $InstallDir "nssm_extract"; Extract-ZipCompat -ZipFile $zip -Destination $ex
            $found = Get-ChildItem $ex -Recurse -Filter "nssm.exe" | Where-Object { $_.DirectoryName -match "win64" } | Select-Object -First 1
            if (-not $found) { $found = Get-ChildItem $ex -Recurse -Filter "nssm.exe" | Select-Object -First 1 }
            if ($found) { Copy-Item $found.FullName $NssmExe -Force; Write-WatchdogLog "NSSM instalado." }
            Remove-Item $zip -Force -EA SilentlyContinue; Remove-Item $ex -Recurse -Force -EA SilentlyContinue
            if (Test-Path $NssmExe) { return $true }
        } catch { Write-WatchdogLog "Falha ${u}: $($_.Exception.Message)"; Remove-Item (Join-Path $InstallDir "nssm.zip") -Force -EA SilentlyContinue }
    }
    Write-WatchdogLog "ERRO: nenhuma URL do NSSM funcionou"; return $false
}
function Install-WinnerService {
    if (-not (Test-Path $AgentFile)) { Write-WatchdogLog "ERRO: agente ausente em $AgentFile"; return $false }
    if (-not (Ensure-Nssm)) { return $false }
    try {
        if (Get-Service -Name $ServiceName -EA SilentlyContinue) { & $NssmExe stop $ServiceName 2>&1 | Out-Null; Start-Sleep 2; & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null; Start-Sleep 2 }
        & $NssmExe install $ServiceName "powershell.exe" "-ExecutionPolicy Bypass -NonInteractive -File `"$AgentFile`"" 2>&1 | Out-Null
        & $NssmExe set $ServiceName DisplayName "Winner RMM Agent" 2>&1 | Out-Null
        & $NssmExe set $ServiceName Description "Agente de monitoramento remoto - Winner Tecnologia" 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppDirectory "$InstallDir" 2>&1 | Out-Null
        & $NssmExe set $ServiceName Start SERVICE_AUTO_START 2>&1 | Out-Null
        & $NssmExe set $ServiceName ObjectName LocalSystem 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppExit Default Restart 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppRestartDelay 5000 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppThrottle 5000 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppStdout "$InstallDir\service_stdout.log" 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppStderr "$InstallDir\service_stderr.log" 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppRotateFiles 1 2>&1 | Out-Null
        & $NssmExe set $ServiceName AppRotateBytes 5242880 2>&1 | Out-Null
        # SCM retry infinito: reset curto (120s) -> nunca "desiste"
        & sc.exe failure $ServiceName reset= 120 actions= restart/15000/restart/30000/restart/60000 2>&1 | Out-Null
        & sc.exe failureflag $ServiceName 1 2>&1 | Out-Null
        & $NssmExe start $ServiceName 2>&1 | Out-Null
        Write-WatchdogLog "Servico $ServiceName instalado e iniciado."
        return $true
    } catch { Write-WatchdogLog "Erro ao instalar servico: $($_.Exception.Message)"; return $false }
}

# ============ HEALTH ============
function Get-HeartbeatAgeSec {
    if (-not (Test-Path $HeartbeatFile)) { return $null }
    try {
        $hb = Get-Content $HeartbeatFile -Raw | ConvertFrom-Json
        if ($hb.timestamp) { return ((Get-Date) - [datetime]$hb.timestamp).TotalSeconds }
    } catch {}
    # fallback: mtime do arquivo
    try { return ((Get-Date) - (Get-Item $HeartbeatFile).LastWriteTime).TotalSeconds } catch { return $null }
}
function Get-ServiceHealth {
    $h = @{ service_exists=$false; service_running=$false; nssm_exists=(Test-Path $NssmExe); agent_exists=(Test-Path $AgentFile); agent_version=$null; heartbeat_age=$null; hung=$false }
    $svc = Get-Service -Name $ServiceName -EA SilentlyContinue
    if ($svc) { $h.service_exists=$true; $h.service_running=($svc.Status -eq 'Running') }
    if (Test-Path $VersionFile) { $h.agent_version=(Get-Content $VersionFile -EA SilentlyContinue).Trim() }
    $h.heartbeat_age = Get-HeartbeatAgeSec
    if ($h.service_running -and $null -ne $h.heartbeat_age -and $h.heartbeat_age -gt $HB_STALE_SEC) { $h.hung = $true }
    return $h
}
function Restart-HungService {
    Write-WatchdogLog "HANG detectado (heartbeat > ${HB_STALE_SEC}s). Reiniciando servico..."
    try {
        # mata qualquer processo do agente que tenha ficado orfao/travado
        if (Test-Path $NssmExe) { & $NssmExe restart $ServiceName 2>&1 | Out-Null } else { Restart-Service -Name $ServiceName -Force -EA SilentlyContinue }
        Start-Sleep 5
        $svc = Get-Service -Name $ServiceName -EA SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') { return "hung_restarted" }
        return "hung_restart_failed"
    } catch { Write-WatchdogLog "Erro no restart de hang: $($_.Exception.Message)"; return "hung_restart_error" }
}

# ============ AUTO-HEAL: re-registrar a propria task ============
function Ensure-Self {
    try {
        $wd = Get-ScheduledTask -TaskName $WatchdogTaskName -EA SilentlyContinue
        if ($wd) { return }
        if (-not (Test-Path $WatchdogFile)) { return }
        $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$WatchdogFile`""
        $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
        $trgBoot = New-ScheduledTaskTrigger -AtStartup
        $set = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
        $prc = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
        Register-ScheduledTask -TaskName $WatchdogTaskName -Action $act -Trigger @($trg,$trgBoot) -Settings $set -Principal $prc -Description "Watchdog RMM V4" -Force | Out-Null
        Write-WatchdogLog "Watchdog task re-registrada (auto-heal)."
    } catch {}
}

# ============ HEARTBEAT AO SERVIDOR ============
function Send-WatchdogHeartbeat($h,$action) {
    try {
        $body = @{ hostname=$env:COMPUTERNAME; token=$COMPANY_TOKEN; service_exists=$h.service_exists; service_running=$h.service_running
            nssm_exists=$h.nssm_exists; agent_exists=$h.agent_exists; agent_version=$h.agent_version
            heartbeat_age_sec=$h.heartbeat_age; hung=$h.hung; watchdog_action=$action; timestamp=(Get-Date).ToString("o") } | ConvertTo-Json -Depth 3
        $servers = @($API_URL); if ($FALLBACK_API_URL -and $FALLBACK_API_URL -ne '' -and $FALLBACK_API_URL -ne $API_URL) { $servers += $FALLBACK_API_URL }
        foreach ($s in $servers) {
            $url = ($s -replace '/api/rmm$','') + "/api/rmm/agent/watchdog-heartbeat"
            try { Invoke-RestMethod -Uri $url -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json; charset=utf-8" -TimeoutSec 15 -ErrorAction Stop | Out-Null; return } catch { continue }
        }
    } catch { Write-WatchdogLog "Erro heartbeat servidor: $($_.Exception.Message)" }
}

# ============ MAIN ============
Write-WatchdogLog "=== Watchdog v4 executado (HB stale limite ${HB_STALE_SEC}s) ==="
Ensure-Self
$health = Get-ServiceHealth
$action = "none"

if (-not $health.agent_exists) {
    Write-WatchdogLog "CRITICO: agente ausente em $AgentFile. Watchdog nao pode recuperar (precisa reinstalar)."
    $action = "agent_missing"
} elseif (-not $health.service_exists) {
    Write-WatchdogLog "Servico inexistente. Recriando..."
    $action = if (Install-WinnerService) { "service_recreated" } else { "service_recreate_failed" }
    $health = Get-ServiceHealth
} elseif (-not $health.service_running) {
    Write-WatchdogLog "Servico parado. Iniciando..."
    try {
        Start-Service -Name $ServiceName -ErrorAction Stop; Start-Sleep 3
        $svc = Get-Service -Name $ServiceName -EA SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') { $action = "service_started" }
        else { $action = if (Install-WinnerService) { "service_reinstalled" } else { "service_reinstall_failed" } }
    } catch { $action = if (Install-WinnerService) { "service_reinstalled" } else { "service_reinstall_failed" } }
    $health = Get-ServiceHealth
} elseif ($health.hung) {
    # CENARIO NOVO no V4: vivo mas travado
    $action = Restart-HungService
    $health = Get-ServiceHealth
} else {
    $hbTxt = if ($null -ne $health.heartbeat_age) { "$([int]$health.heartbeat_age)s" } else { "n/a" }
    Write-WatchdogLog "Servico OK (Running, heartbeat $hbTxt)"
    $action = "healthy"
}

if (-not $health.nssm_exists -and $health.agent_exists) { Write-WatchdogLog "NSSM ausente. Re-baixando..."; Ensure-Nssm }

Send-WatchdogHeartbeat $health $action
Write-WatchdogLog "Watchdog concluido. Acao: $action"

# SIG # Begin signature block
# MIIdrwYJKoZIhvcNAQcCoIIdoDCCHZwCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCB85x4ENQuTWQ6T
# 39PhHpxIkhiL8oZI8u28losg6BRRo6CCF2gwggQqMIICkqADAgECAhBz5g8PdNx1
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
# gjcCARUwLwYJKoZIhvcNAQkEMSIEIOxXk/bz8SlE6yFmr8hya+cHo80/iwnLuYYH
# 4sVNSu89MA0GCSqGSIb3DQEBAQUABIIBgI1Qs1WxyMTzChHedNuE3nRRPw6Ai1wT
# +R8BgNIzj8xqwsxeRcBpgzPiMw7k5XlUkHhR0UB/IJD8C/ZN/Dw4MQdq48c4HMB6
# X5PEePRlgMd8+xvrSvaAkWTWB58JOODTBlkvSVmhGJ2SsG9pPFEiu2QOAngbRvL6
# XRqiEMkGHrnsB0NWVcKOxQAlWYCeEEz83dYxJ8hOrhO8tZnh/jP/Oodv4zcq3Zvd
# IJDpAZeFOrF5UI65QtqKlv1C8DozByh6ko+xxQc7azkXSwbkPVEQutyixn0YQFUt
# Afa4vI2ztEOL85noE1y11UzJeWZHehNHNA1exA3VFs6LQNwiHHmEHJFGEPsIUf+A
# ytzrvj3KQ3lllqxKUx8dePKd9ur5/cWrWwnUgeW9mUFItae1pnB72HDwZ1J1ZfF1
# qxGc/fcHUhqTX9kMie7EQpPugBnP0z/6cIOh/0cMS2fgCXHLN3UaVEXn+D3pAOP5
# UVTlfkOSqT4YR9rk8kg13qchhCqr0WY4OqGCAyYwggMiBgkqhkiG9w0BCQYxggMT
# MIIDDwIBATB9MGkxCzAJBgNVBAYTAlVTMRcwFQYDVQQKEw5EaWdpQ2VydCwgSW5j
# LjFBMD8GA1UEAxM4RGlnaUNlcnQgVHJ1c3RlZCBHNCBUaW1lU3RhbXBpbmcgUlNB
# NDA5NiBTSEEyNTYgMjAyNSBDQTECEAqA7xhLjfEFgtHEdqeVdGgwDQYJYIZIAWUD
# BAIBBQCgaTAYBgkqhkiG9w0BCQMxCwYJKoZIhvcNAQcBMBwGCSqGSIb3DQEJBTEP
# Fw0yNjA3MTQxODI0MDhaMC8GCSqGSIb3DQEJBDEiBCAZab4pZNLAD5VXPQGIXdxV
# gWvZcNB6Nf6pEkX9cuRZ2TANBgkqhkiG9w0BAQEFAASCAgBAx2my/0RDWJdivpYv
# i7A3HOpBHw1PQlZpPBn30XxoxqG2LDSWZSyFRUI5SRMjyZTloAosrzKqWDlqPVd9
# Z5ElX6LrDj7f6TGMIMPcjaSWvUBMGN0Fvq6j9EOYwqNA502S11RQW496XHJQ8jRF
# 6dDtNF/AJSdDsskxiQMcCVQx3K/gGvfp2Zl5oIIS15RJ5tUAsB1JBmTgsirRvZSI
# spb3ukBtVirrgEUijq6ww8tKpV/L/FYnhndzTlTUiLqp0dwwxS80LXSr/foy5ADl
# 3tGcbHcEjRCAD9YF4YMiTJcY03IJkPNWmtI8IG8t21zrU+ON1dNgBRb7ZIoTQWc+
# aVMofbJZyepj6wvq2tG7X2fyUP0u3P9D5mbLYDQCUZ7jFTZ9OAVb8wCfsEDgbHEf
# nFS1YIRvDRIY2KqjbcGtqEHqctH67+V5LmzNYjuhULLs7VTOEUEq/QIspiYBE/Zz
# iJvYpJGnfTixp0edulAz1Mm5M+HycmCSDQ8/hBAAUoPkwmSvIl2E5FiMNd8p+VQ0
# oGGFsiwN2APXy0u+POJWWXz+OJDbcGcy69Vjujr9SJung/52Jf5uit5u4JuHjtl5
# 0Qp0Tc2F+1OP+X3U4LV2swaoZdcZYcX7csWZhhS4uwViC+etO8IObJBCfBaCN/go
# khRpPewRkRmyZvOMQBMPeFMIPw==
# SIG # End signature block
