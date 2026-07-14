# ============================================================
#  Watchdog RMM v4.0 - Winner Tecnologia
#  Cliente-agnostico (config.json + token DPAPI). Assine uma vez.
#
#  Recupera 3 cenarios:
#   1. Task do agente inexistente    -> re-registra e inicia
#   2. Agente nao esta rodando       -> inicia via Start-ScheduledTask
#   3. Agente rodando mas TRAVADO (heartbeat velho) -> mata e reinicia
#  Alem de: re-registrar a si mesmo e reportar heartbeat ao servidor.
# ============================================================

$ErrorActionPreference = "SilentlyContinue"

$InstallDir   = "C:\Program Files\WinnerRMM"
$SecureDir    = Join-Path $InstallDir "secure"
$HealthDir    = Join-Path $InstallDir "health"
$LogFile      = Join-Path $InstallDir "watchdog.log"
$AgentFile    = Join-Path $InstallDir "agente_rmm_v4.ps1"
$WatchdogFile = Join-Path $InstallDir "watchdog_v4.ps1"
$VersionFile  = Join-Path $InstallDir "agent_version"
$ConfigFile   = Join-Path $InstallDir "config.json"
$TokenFile    = Join-Path $SecureDir  "token.dat"
$HeartbeatFile= Join-Path $HealthDir  "heartbeat.json"
$AgentTaskName    = "WinnerRMMAgent"
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

# ============ AGENT TASK / PROCESS ============
function Get-AgentProcess {
    try {
        return Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like "*agente_rmm_v4*" } | Select-Object -First 1
    } catch { return $null }
}

function Invoke-EnsureAgentTask {
    if (-not (Test-Path $AgentFile)) { Write-WatchdogLog "ERRO: agente ausente em $AgentFile"; return $false }
    try {
        $existing = Get-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue
        if (-not $existing) {
            Write-WatchdogLog "Task $AgentTaskName ausente. Re-registrando..."
            $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$AgentFile`""
            $trg = New-ScheduledTaskTrigger -AtStartup
            $set = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 0)
            $prc = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
            Register-ScheduledTask -TaskName $AgentTaskName -Action $act -Trigger $trg -Settings $set -Principal $prc -Description "Agente RMM V4 - Winner Tecnologia" -Force | Out-Null
            Write-WatchdogLog "Task $AgentTaskName re-registrada."
        }
        Start-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        $proc = Get-AgentProcess
        if ($proc) { Write-WatchdogLog "Agente iniciado (PID $($proc.ProcessId))."; return $true }
        Write-WatchdogLog "Task iniciada (processo ainda inicializando)."
        return $true
    } catch { Write-WatchdogLog "Erro ao iniciar agente: $($_.Exception.Message)"; return $false }
}

function Restart-HungAgent {
    Write-WatchdogLog "HANG detectado (heartbeat > ${HB_STALE_SEC}s). Matando processo e reiniciando..."
    try {
        $procs = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like "*agente_rmm_v4*" }
        foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 3
        Start-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        $proc = Get-AgentProcess
        if ($proc) { return "hung_restarted" }
        return "hung_restart_failed"
    } catch { Write-WatchdogLog "Erro no restart de hang: $($_.Exception.Message)"; return "hung_restart_error" }
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
function Get-AgentHealth {
    $h = @{
        task_exists    = $false
        agent_running  = $false
        agent_exists   = (Test-Path $AgentFile)
        agent_version  = $null
        heartbeat_age  = $null
        hung           = $false
    }
    $task = Get-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue
    if ($task) { $h.task_exists = $true }
    $proc = Get-AgentProcess
    if ($proc) { $h.agent_running = $true }
    if (Test-Path $VersionFile) { $h.agent_version = (Get-Content $VersionFile -EA SilentlyContinue).Trim() }
    $h.heartbeat_age = Get-HeartbeatAgeSec
    if ($h.agent_running -and $null -ne $h.heartbeat_age -and $h.heartbeat_age -gt $HB_STALE_SEC) { $h.hung = $true }
    return $h
}

# ============ AUTO-HEAL: re-registrar a propria task ============
function Invoke-EnsureSelf {
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
function Send-WatchdogHeartbeat($h, $action) {
    try {
        $body = @{
            hostname          = $env:COMPUTERNAME
            token             = $COMPANY_TOKEN
            service_exists    = $h.task_exists      # task existe (API compat)
            service_running   = $h.agent_running    # processo rodando (API compat)
            nssm_exists       = $false              # sem NSSM
            agent_exists      = $h.agent_exists
            agent_version     = $h.agent_version
            heartbeat_age_sec = $h.heartbeat_age
            hung              = $h.hung
            watchdog_action   = $action
            timestamp         = (Get-Date).ToString("o")
        } | ConvertTo-Json -Depth 3
        $servers = @($API_URL)
        if ($FALLBACK_API_URL -and $FALLBACK_API_URL -ne '' -and $FALLBACK_API_URL -ne $API_URL) { $servers += $FALLBACK_API_URL }
        foreach ($s in $servers) {
            $url = ($s -replace '/api/rmm$','') + "/api/rmm/agent/watchdog-heartbeat"
            try { Invoke-RestMethod -Uri $url -Method POST -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json; charset=utf-8" -TimeoutSec 15 -EA Stop | Out-Null; return } catch { continue }
        }
    } catch { Write-WatchdogLog "Erro heartbeat servidor: $($_.Exception.Message)" }
}

# ============ MAIN ============
Write-WatchdogLog "=== Watchdog v4 executado (modo Task, HB stale limite ${HB_STALE_SEC}s) ==="
Invoke-EnsureSelf
$health = Get-AgentHealth
$action = "none"

if (-not $health.agent_exists) {
    Write-WatchdogLog "CRITICO: agente ausente em $AgentFile. Watchdog nao pode recuperar (precisa reinstalar)."
    $action = "agent_missing"
} elseif (-not $health.task_exists) {
    Write-WatchdogLog "Task do agente inexistente. Recriando..."
    $action = if (Invoke-EnsureAgentTask) { "task_recreated" } else { "task_recreate_failed" }
    $health = Get-AgentHealth
} elseif (-not $health.agent_running) {
    Write-WatchdogLog "Agente nao esta rodando. Iniciando..."
    $action = if (Invoke-EnsureAgentTask) { "agent_started" } else { "agent_start_failed" }
    $health = Get-AgentHealth
} elseif ($health.hung) {
    $action = Restart-HungAgent
    $health = Get-AgentHealth
} else {
    $hbTxt = if ($null -ne $health.heartbeat_age) { "$([int]$health.heartbeat_age)s" } else { "n/a" }
    Write-WatchdogLog "Agente OK (rodando, heartbeat $hbTxt)"
    $action = "healthy"
}

Send-WatchdogHeartbeat $health $action
Write-WatchdogLog "Watchdog concluido. Acao: $action"
# SIG # Begin signature block
# MIIdrwYJKoZIhvcNAQcCoIIdoDCCHZwCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCBD6H754oXdl2h0
# sHFMXvukootRrHsx44TPt1QTuENED6CCF2gwggQqMIICkqADAgECAhBz5g8PdNx1
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
# gjcCARUwLwYJKoZIhvcNAQkEMSIEIGxOf3R5B+hiB/+i2uyIK3TzKfUhUJXZ9XYG
# KEir2YarMA0GCSqGSIb3DQEBAQUABIIBgEZ4vfZ0Sw9cQaQTplMSeq0K0Wyu9UCZ
# qf81rupjdTZy6BEkblG5m+Y4++ZZuAoDfUquNeEbBEsSTajNJ1sHfQcRe9RkWAtq
# 1MlmhLHLlkYNB6j4xhWAeztNc8QT11VfGjdiYqEWxNANGuNp8+t4xjuJ9MKh5lYv
# O1APLMy7mZQxmiB62aSf8RFR5wuHR0Ao0XbkT8nkSTT8t/9bH30NE5W+fyjSOw1X
# UT8OtMwiqLeN8PbXCFJWJ+w9iuakpbKJqUX/8xvElNdA68sQjEkrl53LwONtf0fa
# 6KDjaeTo38i7pn1JqAl+kquIfOcaaQLQdtaqi/U1qMpuQVeIUWxy3t/M+L0mDwg1
# F615W5mItO2kDy9hehqdvUblM4WfoB9wy+2tznYcUwYWzjRgaV8bLLtol46Opav6
# 63hb9o6EB6Kh8yWEHB4EQudTY8mQmqng9kvFT20MA3ZBy1MDaAZHUa/FHCeC687t
# F5do7H4KlY0FtEa+7ZJHXz27QU1XOTAFAaGCAyYwggMiBgkqhkiG9w0BCQYxggMT
# MIIDDwIBATB9MGkxCzAJBgNVBAYTAlVTMRcwFQYDVQQKEw5EaWdpQ2VydCwgSW5j
# LjFBMD8GA1UEAxM4RGlnaUNlcnQgVHJ1c3RlZCBHNCBUaW1lU3RhbXBpbmcgUlNB
# NDA5NiBTSEEyNTYgMjAyNSBDQTECEAqA7xhLjfEFgtHEdqeVdGgwDQYJYIZIAWUD
# BAIBBQCgaTAYBgkqhkiG9w0BCQMxCwYJKoZIhvcNAQcBMBwGCSqGSIb3DQEJBTEP
# Fw0yNjA3MTQxOTAwNDJaMC8GCSqGSIb3DQEJBDEiBCAMsJk9g7QNVUccvwNqoEWM
# J36w9XmNZDacmtIrRN2/LTANBgkqhkiG9w0BAQEFAASCAgCgvinf0Ad6BRQXAilJ
# LtdZf/TzDIy2Q4oz2fW1DuYXcvSBR3nENFW4BFRMc/JddhWr4s8EVw2S+A8ZwhPW
# Xjod3Xqy5tBejx3q/gyTTTfgQAxuRG75e2+eUzEWVxvzd9UHVpBqIknFUZrOxB3Z
# Kz+SCHn2QyzMDP+Jk3YEMOMkokqerQjpdA4JxPdDVlwljfGcrGHGmTBIWQiTqfOK
# 3X53wVwXBqHVxaIwdP7eL5LkUpI1Hi+pZ1q1cj0ndk0DsitnN9FaUO7NruBoIsIC
# mcuIZBnyMWceTqIOs2DhmUkR0Oyz/29iuQDPLa6ay0rnN/gs42L+wzqmRb+sLQAm
# AHfynAbkuz5eiM8zoPtGKbpROFVNznf+OCWRm3i+LxkzrEeyFqxRurHkJFeYhOQa
# sYPWvmTlVOEAXU87cV+vTRAXxQ7vhpF2CWdw+q/r2c9fSeRzjKEzwUTW6f95sYDZ
# ONAOVIXzb/t+4gIhGkzxhsMItoN3LoxNr4lJgrDrseoSrm4pbiJQ+DezRUANDIVA
# c6CWWH7u9qNwkcUFp4bQhlein/OI1mtkl3UfGXkg5fPt8K7iknFTGy1jTn7JJsuS
# BsFRz+vaYdQJDCN5lXzi1BlG4yTvrgczJwKpnLDw+0PMJmytl1rsObdHXEVYDiYG
# Ohg8+08Dy3mqO92JpwLofq/IfA==
# SIG # End signature block
