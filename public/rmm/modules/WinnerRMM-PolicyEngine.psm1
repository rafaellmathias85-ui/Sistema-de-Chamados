# ============================================
# Modulo: WinnerRMM-PolicyEngine
# Motor de politicas (USB, produtividade)
# Winner Tecnologia - Agente v2.0
# ============================================

$ErrorActionPreference = "SilentlyContinue"

$script:PoliciesCache = $null
$script:PoliciesCacheExpiry = (Get-Date)

function Get-MachinePolicies {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    # Cache de 10 minutos
    if ($script:PoliciesCache -and (Get-Date) -lt $script:PoliciesCacheExpiry) {
        return $script:PoliciesCache
    }
    
    try {
        $res = Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/policies/for-machine/$($MachineId)?token=$Token" -Method GET -TimeoutSec 10
        $script:PoliciesCache = $res
        $script:PoliciesCacheExpiry = (Get-Date).AddMinutes(10)
        return $res
    } catch {
        Write-Log "[PolicyEngine] Error fetching policies: $($_.Exception.Message)"
        return $null
    }
}

function Enforce-UsbPolicies {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    $policies = Get-MachinePolicies -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId
    if (-not $policies -or -not $policies.usbPolicies) { return }
    
    $blockPolicies = $policies.usbPolicies | Where-Object { $_.action -eq "block" -and $_.isActive }
    
    if ($blockPolicies.Count -eq 0) { return }
    
    # Verificar dispositivos USB conectados
    $usbDevices = Get-WmiObject Win32_USBControllerDevice | ForEach-Object {
        $dep = [wmi]$_.Dependent
        @{
            name = $dep.Description
            type = $dep.PNPClass
            pnpId = $dep.PNPDeviceID
        }
    }
    
    foreach ($dev in $usbDevices) {
        foreach ($pol in $blockPolicies) {
            $match = $true
            
            if ($pol.deviceType -and $dev.type -ne $pol.deviceType) { $match = $false }
            if ($pol.vendorId -and $dev.pnpId -notmatch "VID_$($pol.vendorId)") { $match = $false }
            if ($pol.productId -and $dev.pnpId -notmatch "PID_$($pol.productId)") { $match = $false }
            if ($pol.serialNumber -and $dev.pnpId -notmatch $pol.serialNumber) { $match = $false }
            
            if ($match) {
                Write-Log "[PolicyEngine] USB BLOCKED: $($dev.name) by policy '$($pol.name)'"
                
                # Desabilitar dispositivo via DevCon ou PowerShell
                try {
                    $pnpDev = Get-PnpDevice | Where-Object { $_.InstanceId -eq $dev.pnpId }
                    if ($pnpDev) {
                        Disable-PnpDevice -InstanceId $dev.pnpId -Confirm:$false
                        Write-Log "[PolicyEngine] Device disabled: $($dev.name)"
                    }
                } catch {
                    Write-Log "[PolicyEngine] Failed to disable device: $($_.Exception.Message)"
                }
                
                # Reportar evento de bloqueio
                try {
                    $body = @{
                        token = $Token
                        machineId = $MachineId
                        events = @(
                            @{
                                deviceName = $dev.name
                                deviceType = $dev.type
                                action = "blocked"
                                serialNumber = $dev.pnpId
                                blocked = $true
                                policyId = $pol.id
                                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                            }
                        )
                    } | ConvertTo-Json -Depth 5
                    
                    Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/usb-events" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
                } catch {}
            }
        }
    }
}

function Enforce-ProductivityPolicies {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    $policies = Get-MachinePolicies -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId
    if (-not $policies -or -not $policies.productivityPolicies) { return }
    
    $activePolicies = $policies.productivityPolicies | Where-Object { $_.isActive }
    
    foreach ($pol in $activePolicies) {
        if ($pol.blockedApps) {
            $blocked = $pol.blockedApps | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($blocked) {
                foreach ($app in $blocked) {
                    $running = Get-Process -Name $app -ErrorAction SilentlyContinue
                    if ($running) {
                        Write-Log "[PolicyEngine] PRODUCTIVITY: Killing blocked app '$app' (policy: $($pol.name))"
                        $running | Stop-Process -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
    }
}

Export-ModuleMember -Function Get-MachinePolicies, Enforce-UsbPolicies, Enforce-ProductivityPolicies
