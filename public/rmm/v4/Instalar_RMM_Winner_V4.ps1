# ============================================================
#  Instalador RMM V4 - Winner Tecnologia
#  Arquitetura: Scheduled Task (agente + watchdog, sem NSSM)
#  Cliente-agnostico: agente/watchdog sao IGUAIS para todos os
#  clientes; o que muda por cliente e o config.json + token (DPAPI).
#
#  USO (multi-cliente) - 3 formas de informar o token:
#   1) Parametro (prioridade maxima):
#      .\Instalar_RMM_Winner_V4.ps1 -CompanyToken "<TOKEN_DO_CLIENTE>" `
#           -ApiUrl "https://wticorp.com.br/api/rmm" -ClientName "Constance"
#   2) NOME DO ARQUIVO (padrao de mercado - preserva a assinatura
#      Authenticode, pois o nome nao faz parte do conteudo assinado):
#      Instalar_RMM_Winner_V4_<Cliente>_TK<token_hex>.ps1
#      O portal ja baixa o instalador renomeado assim. NAO renomeie.
#   3) Ja instalado: reutiliza secure\token.dat existente (reinstalacao).
#
#  SINGLE-FILE DEPLOY (GPO/Intune): este arquivo sozinho basta.
#   Se agente_rmm_v4.ps1 / watchdog_v4.ps1 nao estiverem na mesma
#   pasta, sao baixados de <ApiUrl base>/rmm/v4/ e validados por
#   SHA256 contra o manifest.json publicado no release assinado.
#  Deploy silencioso: defina $env:RMM_SILENT=1.
#  Execute como Administrador.
# ============================================================

param(
    [string]$CompanyToken   = "",
    [string]$ApiUrl         = "https://wticorp.com.br/api/rmm",
    [string]$FallbackApiUrl = "",
    [string]$ClientName     = "",
    [int]   $CheckinInterval = 60,
    [int]   $RecycleHours    = 8
)

$ErrorActionPreference = "Stop"

$InstallDir   = "C:\Program Files\WinnerRMM"
$ModulesDir   = Join-Path $InstallDir "modules"
$StagingDir   = Join-Path $InstallDir "staging"
$SecureDir    = Join-Path $InstallDir "secure"
$HealthDir    = Join-Path $InstallDir "health"
$AgentFile    = Join-Path $InstallDir "agente_rmm_v4.ps1"
$WatchdogFile = Join-Path $InstallDir "watchdog_v4.ps1"
$ConfigFile   = Join-Path $InstallDir "config.json"
$TokenFile    = Join-Path $SecureDir  "token.dat"
$AgentTaskName    = "WinnerRMMAgent"
$WatchdogTaskName = "WinnerRMMWatchdog"
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Definition

$BASE_SITE_URL = $ApiUrl -replace '/api/rmm/?$',''

# ---------- Token/Cliente a partir do NOME DO ARQUIVO ----------
# Padrao: Instalar_RMM_Winner_V4_<Cliente>_TK<token_hex>.ps1
# O nome do arquivo NAO faz parte do conteudo assinado (Authenticode),
# entao o portal entrega o MESMO binario assinado, apenas renomeado.
$ScriptFileName = Split-Path -Leaf $MyInvocation.MyCommand.Definition
if (-not $CompanyToken -and $ScriptFileName -match '_TK([0-9a-fA-F]{32,128})\.ps1$') {
    $CompanyToken = $Matches[1].ToLower()
    Write-Host "[Token] Extraido do nome do arquivo ($($CompanyToken.Substring(0,8))...)." -ForegroundColor Green
}
if (-not $ClientName -and $ScriptFileName -match '^Instalar_RMM_Winner_V4_(.+)_TK[0-9a-fA-F]{32,128}\.ps1$') {
    $ClientName = ($Matches[1] -replace '_',' ').Trim()
}

$Silent = ($env:RMM_SILENT -eq "1") -or (-not [Environment]::UserInteractive)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Winner Tecnologia - Instalador RMM V4" -ForegroundColor Cyan
if ($ClientName) { Write-Host "  Cliente: $ClientName" -ForegroundColor Yellow }
Write-Host "  Modo: Scheduled Task + Watchdog hang-aware" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# ---------- Admin ----------
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "[ERRO] Execute como Administrador." -ForegroundColor Red; if (-not $Silent) { Read-Host "Enter para sair" }; exit 1 }

# ---------- Execution Policy ----------
Write-Host "[1/8] Execution Policy..." -ForegroundColor Cyan
try { Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope LocalMachine -Force -ErrorAction SilentlyContinue } catch {}
try { Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force } catch {}

# ---------- Diretorios ----------
Write-Host "[2/8] Diretorios..." -ForegroundColor Cyan
foreach ($d in @($InstallDir,$ModulesDir,$StagingDir,$SecureDir,$HealthDir)) { if (!(Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null } }

# ---------- Limpar versoes antigas ----------
Write-Host "[3/8] Removendo versoes antigas (V2/V3)..." -ForegroundColor Cyan
foreach ($t in @("WinnerRMMWatchdog")) {
    $ex = Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
    if ($ex) { Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue }
}
# Remover servico NSSM legado (V4 antigo) se existir
$oldSvc = Get-Service -Name "WinnerRMMService" -ErrorAction SilentlyContinue
if ($oldSvc) {
    Stop-Service -Name "WinnerRMMService" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $nssmPath = Join-Path $InstallDir "nssm.exe"
    if (Test-Path $nssmPath) { & $nssmPath remove "WinnerRMMService" confirm 2>&1 | Out-Null } else { & sc.exe delete "WinnerRMMService" 2>&1 | Out-Null }
    Start-Sleep -Seconds 2
}
# Remover nssm.exe legado
$nssmLegacy = Join-Path $InstallDir "nssm.exe"
if (Test-Path $nssmLegacy) { Remove-Item $nssmLegacy -Force -ErrorAction SilentlyContinue }
# Se havia instalacao V3 em ProgramData, avisa (nao remove dados a toa)
if (Test-Path "C:\ProgramData\WinnerRMM\agente_rmm_v3.ps1") {
    Write-Host "       (Detectada instalacao V3 em ProgramData - sera substituida pela V4 em Program Files)" -ForegroundColor DarkGray
}

# ---------- Copiar agente + watchdog (local ou download assinado) ----------
Write-Host "[4/8] Instalando agente e watchdog..." -ForegroundColor Cyan
$srcAgent    = Join-Path $ScriptDir "agente_rmm_v4.ps1"
$srcWatchdog = Join-Path $ScriptDir "watchdog_v4.ps1"

function Get-V4FileFromServer {
    param([string]$Name, [string]$Destination, $Manifest)
    $url = "$BASE_SITE_URL/rmm/v4/$Name"
    $tmp = "$Destination.download"
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
    if ($Manifest) {
        $entry = $Manifest.files | Where-Object { $_.name -eq $Name } | Select-Object -First 1
        if ($entry -and $entry.sha256) {
            $hash = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash
            if ($hash -ne $entry.sha256.ToUpper()) {
                Remove-Item $tmp -Force -ErrorAction SilentlyContinue
                throw "SHA256 de $Name nao confere com o manifest (esperado $($entry.sha256), obtido $hash). Possivel adulteracao - abortando."
            }
            Write-Host "       $Name baixado e SHA256 validado." -ForegroundColor Green
        } else {
            Write-Host "       [AVISO] $Name sem entrada no manifest; hash nao verificado." -ForegroundColor Yellow
        }
    }
    Move-Item -Path $tmp -Destination $Destination -Force
}

if ((Test-Path $srcAgent) -and (Test-Path $srcWatchdog)) {
    Copy-Item -Path $srcAgent    -Destination $AgentFile    -Force
    Copy-Item -Path $srcWatchdog -Destination $WatchdogFile -Force
    Write-Host "       Scripts copiados de $ScriptDir" -ForegroundColor Green
} else {
    Write-Host "       Arquivos nao encontrados em $ScriptDir - baixando do servidor (single-file deploy)..." -ForegroundColor Yellow
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $manifest = $null
        try { $manifest = Invoke-RestMethod -Uri "$BASE_SITE_URL/rmm/v4/manifest.json" -UseBasicParsing -TimeoutSec 30 } catch {
            Write-Host "       [AVISO] manifest.json indisponivel; download sem verificacao de hash." -ForegroundColor Yellow
        }
        Get-V4FileFromServer -Name "agente_rmm_v4.ps1"  -Destination $AgentFile    -Manifest $manifest
        Get-V4FileFromServer -Name "watchdog_v4.ps1"    -Destination $WatchdogFile -Manifest $manifest
    } catch {
        Write-Host "[ERRO] Falha ao obter agente/watchdog do servidor: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "       Alternativa: deploy o pacote completo (3 arquivos juntos)." -ForegroundColor Yellow
        if (-not $Silent) { Read-Host "Enter para sair" }; exit 1
    }
}

# ---------- config.json + token (DPAPI) ----------
Write-Host "[5/8] Configuracao e token..." -ForegroundColor Cyan
$config = [ordered]@{
    API_URL              = $ApiUrl
    FALLBACK_API_URL     = $FallbackApiUrl
    CLIENT_NAME          = $ClientName
    CHECKIN_INTERVAL     = $CheckinInterval
    INVENTORY_INTERVAL   = 900
    GOVERNANCE_INTERVAL  = 300
    DRIVER_SCAN_INTERVAL = 86400
    DISK_HEALTH_INTERVAL = 3600
    NETWORK_DIAG_INTERVAL= 300
    RECYCLE_HOURS        = $RecycleHours
    MODULE_UPDATE_HOURS  = 1
    SELFUPDATE_HOURS     = 6
    WMI_TIMEOUT_SEC      = 20
}
$config | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8 -Force

if ($CompanyToken) {
    try {
        Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($CompanyToken)
        $enc   = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'LocalMachine')
        Set-Content -Path $TokenFile -Value ([Convert]::ToBase64String($enc)) -Force
        Write-Host "       Token cifrado (DPAPI LocalMachine) em secure\token.dat" -ForegroundColor Green
    } catch {
        Write-Host "       [AVISO] Falha ao cifrar token; gravando no config como fallback." -ForegroundColor Yellow
        $config['COMPANY_TOKEN'] = $CompanyToken
        $config | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8 -Force
    }
} elseif (Test-Path $TokenFile) {
    Write-Host "       Token nao informado; reutilizando token.dat existente (reinstalacao)." -ForegroundColor Green
} else {
    Write-Host "       [AVISO] Token nao informado (nem via -CompanyToken, nem no nome do arquivo)." -ForegroundColor Yellow
    Write-Host "               Baixe o instalador pelo portal (nome contem _TK<token>) ou passe -CompanyToken." -ForegroundColor Yellow
}

# ---------- Exclusoes de AV (Defender) ----------
Write-Host "[6/8] Exclusoes de AV (Defender)..." -ForegroundColor Cyan
Add-MpPreference -ExclusionPath "$InstallDir" -ErrorAction SilentlyContinue
# remove exclusao ampla de powershell.exe se herdada de versoes antigas
try { Remove-MpPreference -ExclusionProcess "powershell.exe" -ErrorAction SilentlyContinue } catch {}
Write-Host "       Defender: pasta $InstallDir excluida." -ForegroundColor Green
Write-Host "       [ACAO] AV de TERCEIROS: exclua a pasta $InstallDir na POLITICA do console." -ForegroundColor Yellow

# ---------- Registrar agente (Scheduled Task) ----------
Write-Host "[7/8] Registrando agente (Scheduled Task)..." -ForegroundColor Cyan
$existingAgentTask = Get-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue
if ($existingAgentTask) {
    Stop-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $AgentTaskName -Confirm:$false -ErrorAction SilentlyContinue
}
$agentAction    = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$AgentFile`""
$agentTrigger   = New-ScheduledTaskTrigger -AtStartup
$agentSettings  = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 0)
$agentPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
Register-ScheduledTask -TaskName $AgentTaskName -Action $agentAction -Trigger $agentTrigger -Settings $agentSettings -Principal $agentPrincipal -Description "Agente RMM V4 - Winner Tecnologia" -Force | Out-Null
Write-Host "       Agente registrado como Scheduled Task (AtStartup, SYSTEM, sem limite de tempo)." -ForegroundColor Green

# Iniciar imediatamente
$agentStarted = $false
Start-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue
for ($i = 1; $i -le 3; $i++) {
    Start-Sleep -Seconds 5
    $agentProc = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*agente_rmm_v4*" }
    if ($agentProc) { $agentStarted = $true; Write-Host "       Agente em execucao (tentativa $i, PID $($agentProc | Select-Object -First 1 -ExpandProperty ProcessId))." -ForegroundColor Green; break }
    Write-Host "       Tentativa $i/3 - aguardando agente..." -ForegroundColor Yellow
    if ($i -lt 3) { Start-ScheduledTask -TaskName $AgentTaskName -ErrorAction SilentlyContinue }
}

# ---------- Watchdog (Scheduled Task: 5min + boot) ----------
Write-Host "[8/8] Watchdog (Scheduled Task)..." -ForegroundColor Cyan
$existingWD = Get-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
if ($existingWD) { Unregister-ScheduledTask -TaskName $WatchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue }
$wdAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$WatchdogFile`""
$wdTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$wdTriggerBoot = New-ScheduledTaskTrigger -AtStartup
$wdSettings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$wdPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
Register-ScheduledTask -TaskName $WatchdogTaskName -Action $wdAction -Trigger @($wdTrigger,$wdTriggerBoot) -Settings $wdSettings -Principal $wdPrincipal -Description "Watchdog do agente RMM V4 - Winner Tecnologia" -Force | Out-Null
Start-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
Write-Host "       Watchdog: a cada 5 min + no boot." -ForegroundColor Green

# ---------- DACL sã (SYSTEM/Admins Full, Users Read) ----------
try {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM","FullControl","ContainerInherit,ObjectInherit","None","Allow")))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators","FullControl","ContainerInherit,ObjectInherit","None","Allow")))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("BUILTIN\Users","ReadAndExecute","ContainerInherit,ObjectInherit","None","Allow")))
    Set-Acl -Path $InstallDir -AclObject $acl -ErrorAction SilentlyContinue
} catch {}

# ---------- Status final ----------
$agentFinal = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*agente_rmm_v4*" }
$agentFinalStatus = if ($agentFinal) { "RODANDO" } else { "VERIFICAR" }
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Instalacao V4 concluida!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Agente:   WinnerRMMAgent ($agentFinalStatus)" -ForegroundColor $(if ($agentFinalStatus -eq "RODANDO") { "Green" } else { "Yellow" })
Write-Host "  Watchdog: $WatchdogTaskName (5 min + boot, hang-aware)" -ForegroundColor Gray
Write-Host "  Pasta:    $InstallDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  Protecoes ativas:" -ForegroundColor Cyan
Write-Host "    - Agente como Scheduled Task (AtStartup, SYSTEM, sem limite de tempo)" -ForegroundColor Gray
Write-Host "    - Recycle do processo a cada $RecycleHours h (anti-leak/hang)" -ForegroundColor Gray
Write-Host "    - Watchdog detecta agente parado E processo TRAVADO" -ForegroundColor Gray
Write-Host "    - Token cifrado em repouso (DPAPI)" -ForegroundColor Gray
Write-Host ""
if (-not $agentStarted) { Write-Host "  [DIAG] Agente ainda nao iniciou; o watchdog assume em ~2-5 min. Ver $InstallDir\rmm_agent.log" -ForegroundColor Yellow }
if (-not $Silent) { try { Read-Host "Pressione Enter para fechar" } catch {} }
# SIG # Begin signature block
# MIIdrwYJKoZIhvcNAQcCoIIdoDCCHZwCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCAoWF5Tf1xxkOlV
# B1tOGygUycPi5PvxJEASMUC7lTjjWKCCF2gwggQqMIICkqADAgECAhBz5g8PdNx1
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
# gjcCARUwLwYJKoZIhvcNAQkEMSIEIPEmCIeG10fjqmbUmga5fQx9wHvfjlU8P8q/
# YjY2sIMUMA0GCSqGSIb3DQEBAQUABIIBgHu6/aYacxJrAdDfRyDK29wGsne2f+By
# i8uTh6Yj2rri0BXQLnpTuYr3Gw2l6T7qFInlCJRmAbUVd03oYrg9WUPvT/1AbmzU
# b52Simx0FMOIrK7AMxvEsOjNJNmpldl2JkGM7GKlUEU6n573I6rO6GMd9JBf7Jut
# kTMHdIzKj0Z0SlQE2p2WY8jFYF+bv/6OcioOgtlHRCKBODspitg9Fup6EypT30Zt
# qHbMOszFI3Cc0b1jmRCAQNv+gcUCv0iIdls0c8eVKSBN7Qoa5hkYW8anpDsBqsVS
# NTUiYzU0i7Am3c7vOTp4Tv5v7BLiJVUDX7d3rvmGALl5lgQYfUgSbjGCuIBcxzQc
# oUkO7dkgukoPEijLN55FCXKrh8GU51W2awydqkLVRQvFABvJCYPlnJLq9uAxeAkT
# m6rk5cVKL8lllzfYa5Ceuw9gsqBMTwEhdpeJ1o8S5nr0x4WrcORJoiQxQcu89xon
# t6CJotqay8p+wmDEiUpwH1yrgdcQdji3laGCAyYwggMiBgkqhkiG9w0BCQYxggMT
# MIIDDwIBATB9MGkxCzAJBgNVBAYTAlVTMRcwFQYDVQQKEw5EaWdpQ2VydCwgSW5j
# LjFBMD8GA1UEAxM4RGlnaUNlcnQgVHJ1c3RlZCBHNCBUaW1lU3RhbXBpbmcgUlNB
# NDA5NiBTSEEyNTYgMjAyNSBDQTECEAqA7xhLjfEFgtHEdqeVdGgwDQYJYIZIAWUD
# BAIBBQCgaTAYBgkqhkiG9w0BCQMxCwYJKoZIhvcNAQcBMBwGCSqGSIb3DQEJBTEP
# Fw0yNjA3MTQxOTAwNDNaMC8GCSqGSIb3DQEJBDEiBCBacKK9J9p1xJ42jT5zxJgL
# bAkxfsBMVOPWSFKBzz/64zANBgkqhkiG9w0BAQEFAASCAgCXNFwXygGdVCLHbEPi
# KEsLipCw747K9ow6I8o7Ui1LbQGRjImhS5gObFhvVnNKjh69O42igSHAzj2GL7Vn
# PyrNBmQtqe7yIEywZc8npbXQ2HMLxnmU/e6Pg9n34AeNWtmiNG39e5eD3jltaF/d
# hb00pjsCZlqbjAqYhD0rb+Jf5dpYSxMJ8ahdxngni3QMZ4mdmE4MP27WSeRYUvQ9
# d9TvsgRCK+cEUlI41CiGc/mwA0ZTasr4zVa5iXNUjRqQHyg6jjralSmVenkL7Jem
# nUWaYFjUeRsU5QtNJS2Ecx0+QS3wUG2FCTsTINAueEcXXFRIrCbpik45uOSt/f2Y
# Tp3UpywLDeIYBhQNyKd90bjG/5LBPV8Szp+6CWrpNl9xdLaa3rWSDQ7LPq6wULXY
# KnYxFdjdvRnFJarR3JLfNwzugeW9aNW2RD7/NNJjZIjrGxIajvr5q09IfJMMX1r/
# Tac3Sr2vWx4/xO2P8W/ILAeu37osrzrTBHEpIbWot/tnRsv63QTmxWXIvSNnbJyn
# hCVVO6RZc1o430prmd/CuhwM7dRRizK040AXTMNbhQYxuMwkVN5n6Xj2woYBiTC+
# XheGdCX4km/G8ngW3mSlH7GhtTFZnagMkvNHtE3NdJr0Pe42zpZP+btgbRNhXTZB
# CtqnL3aHPTqwfFNRe5YWCQVh2g==
# SIG # End signature block
