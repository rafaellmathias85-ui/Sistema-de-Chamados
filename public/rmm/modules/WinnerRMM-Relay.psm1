# ============================================
# Modulo: WinnerRMM-Relay
# Descoberta de maquinas e deploy via relay
# Winner Tecnologia - Agente v2.0
# ============================================

$ErrorActionPreference = "SilentlyContinue"

function Get-NetworkDiscovery {
    param([string]$Subnet)
    
    $discovered = @()
    
    # Auto-detect subnet se nao especificado
    if (-not $Subnet) {
        $adapter = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.InterfaceAlias -match "Ethernet|Wi-Fi|LAN" -and $_.IPAddress -ne "127.0.0.1"
        } | Select-Object -First 1
        
        if ($adapter) {
            $parts = $adapter.IPAddress.Split('.')
            $Subnet = "$($parts[0]).$($parts[1]).$($parts[2])"
        } else {
            return $discovered
        }
    }
    
    Write-Log "[Relay] Scanning subnet: $Subnet.0/24"
    
    # Ping sweep paralelo
    $jobs = @()
    for ($i = 1; $i -le 254; $i++) {
        $ip = "$Subnet.$i"
        $jobs += Start-Job -ScriptBlock {
            param($ip)
            $ping = Test-Connection -ComputerName $ip -Count 1 -Quiet -TimeoutSeconds 1
            if ($ping) {
                try {
                    $hostname = [System.Net.Dns]::GetHostEntry($ip).HostName
                } catch {
                    $hostname = $ip
                }
                
                # Tentar obter MAC via ARP
                $arp = arp -a $ip 2>$null | Select-String $ip
                $mac = if ($arp) {
                    ($arp -replace '\s+', ' ').Trim().Split(' ')[1]
                } else { $null }
                
                return @{
                    hostname = $hostname
                    ipAddress = $ip
                    macAddress = $mac
                    osGuess = ""
                    isAlive = $true
                }
            }
        } -ArgumentList $ip
    }
    
    # Aguardar com timeout
    $jobs | Wait-Job -Timeout 60 | Out-Null
    
    foreach ($job in $jobs) {
        $result = Receive-Job -Job $job
        if ($result -and $result.isAlive) {
            $discovered += $result
        }
        Remove-Job -Job $job -Force
    }
    
    Write-Log "[Relay] Discovered $($discovered.Count) hosts"
    return $discovered
}

function Send-DiscoveredMachines {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId,
        [array]$Machines
    )
    
    try {
        foreach ($m in $Machines) {
            $body = @{
                token = $Token
                scannerMachineId = $MachineId
                hostname = $m.hostname
                ipAddress = $m.ipAddress
                macAddress = $m.macAddress
                osGuess = $m.osGuess
            } | ConvertTo-Json -Depth 3
            
            Invoke-RestMethod -Uri "$ApiUrl/api/rmm/relay/discovered" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
        }
        Write-Log "[Relay] Sent $($Machines.Count) discovered machines"
    } catch {
        Write-Log "[Relay] Error sending discoveries: $($_.Exception.Message)"
    }
}

function Get-RelayConfig {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    try {
        $res = Invoke-RestMethod -Uri "$ApiUrl/api/rmm/relay/config?token=$Token&machineId=$MachineId" -Method GET -TimeoutSec 10
        return $res
    } catch {
        return $null
    }
}

function Start-RelayLoop {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    $config = Get-RelayConfig -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId
    
    if (-not $config -or -not $config.isActive) {
        Write-Log "[Relay] Not configured as relay or inactive"
        return
    }
    
    $interval = if ($config.scanInterval) { $config.scanInterval * 60 } else { 3600 }  # padrao 1h
    
    Write-Log "[Relay] Starting relay loop (interval: $($interval)s)"
    
    while ($true) {
        $machines = Get-NetworkDiscovery
        if ($machines.Count -gt 0) {
            Send-DiscoveredMachines -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -Machines $machines
        }
        Start-Sleep -Seconds $interval
    }
}

Export-ModuleMember -Function Get-NetworkDiscovery, Send-DiscoveredMachines, Get-RelayConfig, Start-RelayLoop
