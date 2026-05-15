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
        [string]$MachineId,
        [string]$Hostname = $env:COMPUTERNAME
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
            deviceId = $dep.DeviceID
        }
    }
    
    foreach ($dev in $usbDevices) {
        foreach ($pol in $blockPolicies) {
            $blocked = $false
            
            # Verificar se o tipo do dispositivo corresponde a politica
            if ($pol.deviceTypes) {
                $allowedTypes = $pol.deviceTypes | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($allowedTypes -and $dev.type -in $allowedTypes) {
                    $blocked = $true
                }
            }
            
            # Verificar whitelist
            if ($blocked -and $pol.whitelist) {
                $wl = $pol.whitelist | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($wl -and $dev.pnpId -in $wl) {
                    $blocked = $false
                }
            }
            
            if ($blocked) {
                Write-Log "[PolicyEngine] USB BLOCKED: $($dev.name) (policy: $($pol.name))"
                
                # Tentar desabilitar dispositivo (requer admin)
                try {
                    $pnpDev = Get-PnpDevice -InstanceId $dev.pnpId -ErrorAction Stop
                    Disable-PnpDevice -InstanceId $dev.pnpId -Confirm:$false -ErrorAction Stop
                    Write-Log "[PolicyEngine] Device disabled: $($dev.pnpId)"
                } catch {
                    Write-Log "[PolicyEngine] Failed to disable device: $($_.Exception.Message)"
                }
                
                # Reportar evento de bloqueio para a API
                try {
                    # Extrair VID/PID do PNPDeviceID
                    $vid = ""
                    $pid = ""
                    if ($dev.pnpId -match 'VID_([0-9A-Fa-f]{4})') { $vid = $Matches[1] }
                    if ($dev.pnpId -match 'PID_([0-9A-Fa-f]{4})') { $pid = $Matches[1] }
                    
                    $body = @{
                        token    = $Token
                        hostname = $Hostname
                        events   = @(
                            @{
                                device_name    = $dev.name
                                device_type    = if ($dev.type) { $dev.type } else { "Unknown" }
                                device_id      = $dev.deviceId
                                action         = "blocked"
                                serial_number  = $dev.pnpId
                                vendor_id      = $vid
                                product_id     = $pid
                                policy_applied = $pol.name
                                event_at       = (Get-Date).ToUniversalTime().ToString("o")
                                username       = $env:USERNAME
                            }
                        )
                    } | ConvertTo-Json -Depth 5
                    
                    Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/usb-events" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 10
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
