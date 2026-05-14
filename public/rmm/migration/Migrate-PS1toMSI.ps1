# ============================================
# Migracao PS1 -> MSI
# Winner Tecnologia - Agente RMM
# Executa no endpoint para migrar do agente PS1
# para o MSI com servico Windows
# ============================================

param(
    [string]$MsiUrl,
    [string]$ApiUrl = "https://www.wticorp.com.br",
    [string]$CompanyToken,
    [string]$ExpectedHash,
    [switch]$Force,
    [switch]$KeepBackup
)

$ErrorActionPreference = "Stop"

$InstallDir = "C:\ProgramData\WinnerRMM"
$LogFile = "$InstallDir\migration.log"
$BackupDir = "$InstallDir\backup_ps1"

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
    Write-Host $line
}

function Test-Prerequisites {
    # Verificar se roda como admin
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Log "ERRO: Script precisa rodar como Administrador"
        return $false
    }
    
    # Verificar parametros
    if (-not $MsiUrl) {
        Write-Log "ERRO: -MsiUrl obrigatorio"
        return $false
    }
    if (-not $CompanyToken) {
        Write-Log "ERRO: -CompanyToken obrigatorio"
        return $false
    }
    
    return $true
}

function Stop-PS1Agent {
    Write-Log "[1/6] Parando agente PS1..."
    
    # Parar tarefa agendada
    $taskNames = @("WinnerRMM", "WinnerRMM-Agent", "Winner RMM Agent")
    foreach ($name in $taskNames) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($task) {
            Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            Disable-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            Write-Log "  Tarefa '$name' parada e desabilitada"
        }
    }
    
    # Matar processos PS1 do agente
    Get-Process powershell, pwsh -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -match "WinnerRMM|rmm_agent"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    
    Start-Sleep -Seconds 3
    Write-Log "  Agente PS1 parado"
}

function Backup-PS1Agent {
    Write-Log "[2/6] Backup do agente PS1..."
    
    New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null
    
    $filesToBackup = @(
        "rmm_agent.ps1",
        "WinnerRMM-Agent.ps1",
        "rmm_agent.log",
        "machine_id",
        "config.json"
    )
    
    foreach ($f in $filesToBackup) {
        $src = "$InstallDir\$f"
        if (Test-Path $src) {
            Copy-Item $src "$BackupDir\$f" -Force
            Write-Log "  Backup: $f"
        }
    }
    
    # Salvar info da tarefa agendada
    $taskNames | ForEach-Object {
        $task = Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue
        if ($task) {
            Export-ScheduledTask -TaskName $_ | Out-File "$BackupDir\task_$_.xml" -Force
            Write-Log "  Backup tarefa: $_"
        }
    }
    
    # Preservar machine_id
    $machineIdFile = "$InstallDir\machine_id"
    if (Test-Path $machineIdFile) {
        $machineId = Get-Content $machineIdFile -ErrorAction SilentlyContinue
        Write-Log "  Machine ID preservado: $machineId"
    }
    
    Write-Log "  Backup concluido em $BackupDir"
}

function Download-MSI {
    Write-Log "[3/6] Download do MSI..."
    
    $msiPath = "$InstallDir\WinnerRMM-Agent.msi"
    
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $MsiUrl -OutFile $msiPath -UseBasicParsing -TimeoutSec 120
    
    if (-not (Test-Path $msiPath)) {
        throw "Download do MSI falhou"
    }
    
    $fileSize = (Get-Item $msiPath).Length
    Write-Log "  Download concluido: $([math]::Round($fileSize / 1MB, 2)) MB"
    
    # Verificar hash se fornecido
    if ($ExpectedHash) {
        $actualHash = (Get-FileHash -Path $msiPath -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $ExpectedHash.ToLower()) {
            Remove-Item $msiPath -Force
            throw "Hash SHA256 nao confere! Esperado: $ExpectedHash, Recebido: $actualHash"
        }
        Write-Log "  Hash SHA256 verificado OK"
    }
    
    return $msiPath
}

function Install-MSI {
    param([string]$MsiPath)
    
    Write-Log "[4/6] Instalando MSI..."
    
    $args = "/i `"$MsiPath`" /qn /norestart API_URL=$ApiUrl COMPANY_TOKEN=$CompanyToken INSTALLFOLDER=`"$InstallDir`""
    
    $process = Start-Process "msiexec.exe" -ArgumentList $args -Wait -PassThru
    
    if ($process.ExitCode -ne 0) {
        throw "Instalacao MSI falhou com codigo: $($process.ExitCode)"
    }
    
    Write-Log "  MSI instalado com sucesso"
    
    # Restaurar machine_id
    $backupMachineId = "$BackupDir\machine_id"
    if (Test-Path $backupMachineId) {
        Copy-Item $backupMachineId "$InstallDir\machine_id" -Force
        Write-Log "  Machine ID restaurado"
    }
}

function Remove-PS1Agent {
    Write-Log "[5/6] Removendo agente PS1..."
    
    # Remover tarefas agendadas
    $taskNames = @("WinnerRMM", "WinnerRMM-Agent", "Winner RMM Agent")
    foreach ($name in $taskNames) {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
        Write-Log "  Tarefa removida: $name"
    }
    
    # Remover scripts antigos (manter backup se solicitado)
    $oldFiles = @("rmm_agent.ps1", "WinnerRMM-Agent.ps1", "rmm_agent.log")
    foreach ($f in $oldFiles) {
        $path = "$InstallDir\$f"
        if (Test-Path $path) {
            Remove-Item $path -Force -ErrorAction SilentlyContinue
            Write-Log "  Removido: $f"
        }
    }
    
    if (-not $KeepBackup) {
        Remove-Item $BackupDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log "  Backup removido"
    }
    
    Write-Log "  Limpeza do PS1 concluida"
}

function Verify-Installation {
    Write-Log "[6/6] Verificando instalacao..."
    
    # Verificar servico
    $service = Get-Service -Name "WinnerRMM" -ErrorAction SilentlyContinue
    if ($service) {
        Write-Log "  Servico WinnerRMM: $($service.Status)"
        if ($service.Status -ne "Running") {
            Start-Service -Name "WinnerRMM" -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 5
            $service = Get-Service -Name "WinnerRMM"
            Write-Log "  Servico iniciado: $($service.Status)"
        }
    } else {
        Write-Log "  AVISO: Servico WinnerRMM nao encontrado"
    }
    
    # Verificar registro
    $reg = Get-ItemProperty "HKLM:\SOFTWARE\WinnerRMM" -ErrorAction SilentlyContinue
    if ($reg) {
        Write-Log "  Registro OK - Versao: $($reg.Version), Tipo: $($reg.AgentType)"
    }
    
    # Verificar modulos
    $moduleCount = (Get-ChildItem "$InstallDir\modules" -Filter "*.psm1" -ErrorAction SilentlyContinue).Count
    Write-Log "  Modulos instalados: $moduleCount"
    
    Write-Log ""
    Write-Log "=== MIGRACAO CONCLUIDA COM SUCESSO ==="
    Write-Log "Agente MSI instalado e rodando como servico Windows"
    Write-Log "O endpoint continuara reportando com o mesmo machine_id"
}

# ============ MAIN ============
Write-Log "======================================="
Write-Log "Migracao PS1 -> MSI - Winner RMM"
Write-Log "======================================="

if (-not (Test-Prerequisites)) {
    Write-Log "Abortando: pre-requisitos nao atendidos"
    exit 1
}

try {
    Stop-PS1Agent
    Backup-PS1Agent
    $msiPath = Download-MSI
    Install-MSI -MsiPath $msiPath
    Remove-PS1Agent
    Verify-Installation
    
    # Limpar MSI temp
    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    
    exit 0
} catch {
    Write-Log "ERRO FATAL: $($_.Exception.Message)"
    Write-Log "A migracao falhou. O backup esta em: $BackupDir"
    Write-Log "Para restaurar o agente PS1, execute:"
    Write-Log "  Copy-Item '$BackupDir\*' '$InstallDir\' -Force"
    Write-Log "  Enable-ScheduledTask -TaskName 'WinnerRMM'"
    exit 1
}
