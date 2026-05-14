# ============================================
# Modulo: WinnerRMM-Update
# Auto-atualizacao do agente
# Winner Tecnologia - Agente v2.0
# ============================================

$ErrorActionPreference = "SilentlyContinue"

function Test-AgentUpdate {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$CurrentVersion,
        [string]$AgentType = "ps1",
        [string]$Channel = "stable"
    )
    
    try {
        $params = "token=$Token&current_version=$CurrentVersion&agent_type=$AgentType&channel=$Channel"
        $res = Invoke-RestMethod -Uri "$ApiUrl/api/rmm/agent/check-update?$params" -Method GET -TimeoutSec 10
        return $res
    } catch {
        Write-Log "[Update] Error checking for updates: $($_.Exception.Message)"
        return @{ update_available = $false }
    }
}

function Install-AgentUpdate {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId,
        [string]$DownloadUrl,
        [string]$ExpectedHash,
        [string]$NewVersion,
        [string]$AgentType = "ps1"
    )
    
    $installDir = "C:\ProgramData\WinnerRMM"
    $tempFile = "$installDir\update_temp"
    
    try {
        Write-Log "[Update] Downloading update v$NewVersion from $DownloadUrl"
        
        # Download
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $tempFile -UseBasicParsing -TimeoutSec 120
        
        # Verificar hash
        $fileHash = (Get-FileHash -Path $tempFile -Algorithm SHA256).Hash.ToLower()
        if ($fileHash -ne $ExpectedHash.ToLower()) {
            Write-Log "[Update] Hash mismatch! Expected: $ExpectedHash, Got: $fileHash"
            Report-UpdateResult -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -NewVersion $NewVersion -AgentType $AgentType -Status "failed" -ErrorMsg "Hash SHA256 nao confere"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            return $false
        }
        
        Write-Log "[Update] Hash verified OK"
        
        if ($AgentType -eq "ps1") {
            # Substituir script PS1
            $currentScript = "$installDir\WinnerRMM-Agent.ps1"
            
            # Backup
            if (Test-Path $currentScript) {
                Copy-Item $currentScript "$installDir\WinnerRMM-Agent.ps1.bak" -Force
            }
            
            Move-Item $tempFile $currentScript -Force
            
            Write-Log "[Update] PS1 agent updated to v$NewVersion"
            Report-UpdateResult -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -NewVersion $NewVersion -AgentType $AgentType -Status "completed"
            
        } elseif ($AgentType -eq "msi") {
            # Instalar MSI silenciosamente
            $msiPath = "$tempFile.msi"
            Move-Item $tempFile $msiPath -Force
            
            Write-Log "[Update] Installing MSI: $msiPath"
            $process = Start-Process "msiexec.exe" -ArgumentList "/i `"$msiPath`" /qn /norestart INSTALLFOLDER=`"$installDir`"" -Wait -PassThru
            
            if ($process.ExitCode -eq 0) {
                Write-Log "[Update] MSI installed successfully"
                Report-UpdateResult -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -NewVersion $NewVersion -AgentType $AgentType -Status "completed"
            } else {
                Write-Log "[Update] MSI install failed with exit code: $($process.ExitCode)"
                Report-UpdateResult -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -NewVersion $NewVersion -AgentType $AgentType -Status "failed" -ErrorMsg "MSI exit code: $($process.ExitCode)"
            }
            
            Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
        }
        
        return $true
    } catch {
        Write-Log "[Update] Error installing update: $($_.Exception.Message)"
        Report-UpdateResult -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -NewVersion $NewVersion -AgentType $AgentType -Status "failed" -ErrorMsg $_.Exception.Message
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        return $false
    }
}

function Report-UpdateResult {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId,
        [string]$NewVersion,
        [string]$AgentType,
        [string]$Status,
        [string]$ErrorMsg = ""
    )
    
    try {
        $body = @{
            token = $Token
            machineId = $MachineId
            new_version = $NewVersion
            agent_type = $AgentType
            status = $Status
            error_message = $ErrorMsg
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/agent/report-update" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
        Write-Log "[Update] Reported update result: $Status"
    } catch {
        Write-Log "[Update] Error reporting result: $($_.Exception.Message)"
    }
}

function Start-UpdateCheck {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId,
        [string]$CurrentVersion,
        [string]$AgentType = "ps1",
        [string]$Channel = "stable"
    )
    
    $check = Test-AgentUpdate -ApiUrl $ApiUrl -Token $Token -CurrentVersion $CurrentVersion -AgentType $AgentType -Channel $Channel
    
    if ($check.update_available) {
        Write-Log "[Update] New version available: v$($check.latest_version) (current: v$CurrentVersion)"
        
        if ($check.is_critical) {
            Write-Log "[Update] CRITICAL update - installing immediately"
        }
        
        $result = Install-AgentUpdate `
            -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId `
            -DownloadUrl $check.download_url `
            -ExpectedHash $check.file_hash_sha256 `
            -NewVersion $check.latest_version `
            -AgentType $AgentType
        
        return $result
    } else {
        Write-Log "[Update] Agent is up to date (v$CurrentVersion)"
        return $false
    }
}

Export-ModuleMember -Function Test-AgentUpdate, Install-AgentUpdate, Report-UpdateResult, Start-UpdateCheck
