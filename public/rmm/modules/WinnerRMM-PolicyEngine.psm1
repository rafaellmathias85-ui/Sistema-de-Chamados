# ============================================
# Modulo: WinnerRMM-PolicyEngine v2.1
# Motor de politicas USB e produtividade
# Winner Tecnologia - Agente v3
# Contrato correto com /api/rmm/governance/policies/for-machine/[id]
# ============================================
# API retorna:
#   { usb: UsbPolicy[], productivity: ProductivityPolicy|null, webFilter: {...} }
# UsbPolicy campos: policyType (allow|block|read_only|notify), deviceClass, vendorId, productId, serialNumber, priority, name
# ProductivityPolicy campos: trackApps, trackUrls, trackIdle, unproductiveApps, productiveApps, isActive

$ErrorActionPreference = "SilentlyContinue"

$script:PoliciesCache     = $null
$script:PoliciesCacheTime = [datetime]::MinValue
$script:PolicyCacheMinutes = 10

# Chave de registro usada como marcador do que o Winner RMM configurou
$script:RegMarker = "HKLM:\SOFTWARE\WinnerRMM\PolicyEngine"

function Get-MachinePolicies {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )

    if ($script:PoliciesCache -and ((Get-Date) - $script:PoliciesCacheTime).TotalMinutes -lt $script:PolicyCacheMinutes) {
        return $script:PoliciesCache
    }

    try {
        $res = Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/policies/for-machine/$($MachineId)?token=$Token" -Method GET -TimeoutSec 10
        $script:PoliciesCache     = $res
        $script:PoliciesCacheTime = Get-Date
        return $res
    } catch {
        Write-Log "[PolicyEngine] Error fetching policies: $($_.Exception.Message)"
        return $null
    }
}

# ---------------------------------------------------------------------------
# USB ENFORCEMENT
# Logica de prioridade: menor numero de 'priority' vence.
# 'allow' explicito prevalece sobre 'block' de menor prioridade.
# Bloqueio proativo: desativa USBSTOR (servico de armazenamento USB) quando
# ha politica block de classe 'storage' — bloqueia ANTES da conexao.
# ---------------------------------------------------------------------------

function Get-UsbDeviceClass {
    param([string]$PnpId)
    # Mapear classe PnP para classe logica da politica
    $pnpClass = (Get-PnpDevice -InstanceId $PnpId -ErrorAction SilentlyContinue).Class
    if (-not $pnpClass) {
        if ($PnpId -match "USBSTOR") { return "storage" }
        return "unknown"
    }
    $map = @{
        "DiskDrive"         = "storage"
        "USB"               = "usb"
        "HIDClass"          = "hid"
        "Image"             = "camera"
        "Bluetooth"         = "bluetooth"
        "Net"               = "network"
        "Printer"           = "printer"
        "AudioEndpoint"     = "audio"
        "Media"             = "audio"
    }
    foreach ($k in $map.Keys) {
        if ($pnpClass -like "*$k*") { return $map[$k] }
    }
    return $pnpClass.ToLower()
}

function Match-UsbPolicy {
    param(
        [hashtable]$Device,
        [object]$Policy
    )
    # Verifica se o dispositivo corresponde ao escopo da politica
    # Sem filtros = politica global (match em tudo)
    if ($Policy.deviceClass -and $Policy.deviceClass -ne "all") {
        if ($Device.deviceClass -ne $Policy.deviceClass) { return $false }
    }
    if ($Policy.vendorId) {
        if ($Device.vid -ne $Policy.vendorId.ToUpper()) { return $false }
    }
    if ($Policy.productId) {
        if ($Device.pid -ne $Policy.productId.ToUpper()) { return $false }
    }
    if ($Policy.serialNumber) {
        if ($Device.serial -ne $Policy.serialNumber) { return $false }
    }
    return $true
}

function Set-UsbStorService {
    param([string]$StartType)  # "3" = manual (habilitado), "4" = disabled
    try {
        Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -Name "Start" -Value ([int]$StartType) -ErrorAction Stop
        Write-Log "[PolicyEngine] USBSTOR Start=$StartType"
    } catch {
        Write-Log "[PolicyEngine] Falha ao alterar USBSTOR: $($_.Exception.Message)"
    }
}

function Set-UsbWriteProtect {
    param([bool]$Enable)
    try {
        $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies"
        if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
        Set-ItemProperty -Path $regPath -Name "WriteProtect" -Value ([int]$Enable) -ErrorAction Stop
        Write-Log "[PolicyEngine] WriteProtect=$([int]$Enable)"
    } catch {
        Write-Log "[PolicyEngine] Falha ao alterar WriteProtect: $($_.Exception.Message)"
    }
}

function Save-UsbPolicyMarker {
    param([string]$State)  # "block_storage", "read_only", "normal"
    try {
        if (-not (Test-Path $script:RegMarker)) { New-Item -Path $script:RegMarker -Force | Out-Null }
        Set-ItemProperty -Path $script:RegMarker -Name "UsbState" -Value $State -ErrorAction SilentlyContinue
    } catch {}
}

function Get-UsbPolicyMarker {
    try { return (Get-ItemProperty -Path $script:RegMarker -Name "UsbState" -ErrorAction SilentlyContinue).UsbState } catch { return $null }
}

function Report-UsbEvent {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$Hostname,
        [hashtable]$Device,
        [string]$Action,
        [string]$PolicyName
    )
    try {
        $body = @{
            token    = $Token
            hostname = $Hostname
            events   = @(@{
                device_name    = $Device.name
                device_type    = $Device.deviceClass
                device_id      = $Device.deviceId
                action         = $Action
                serial_number  = $Device.serial
                vendor_id      = $Device.vid
                product_id     = $Device.pid_val
                policy_applied = $PolicyName
                event_at       = (Get-Date).ToUniversalTime().ToString("o")
                username       = $env:USERNAME
            })
        } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/usb-events" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 10
    } catch {}
}

function Enforce-UsbPolicies {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId,
        [string]$Hostname = $env:COMPUTERNAME
    )

    $policies = Get-MachinePolicies -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId
    if (-not $policies -or -not $policies.usb -or $policies.usb.Count -eq 0) {
        # Sem politicas: reverter estado proativo se necessario
        $marker = Get-UsbPolicyMarker
        if ($marker -and $marker -ne "normal") {
            Set-UsbStorService -StartType "3"
            Set-UsbWriteProtect -Enable $false
            Save-UsbPolicyMarker -State "normal"
            Write-Log "[PolicyEngine] USB policies cleared — USBSTOR restored"
        }
        return
    }

    # Ordenar por prioridade crescente (menor numero = maior prioridade)
    $sortedPolicies = $policies.usb | Sort-Object { $_.priority }

    # --- Aplicar politicas proativas de armazenamento global ---
    $storageBlockPolicy = $sortedPolicies | Where-Object { $_.policyType -eq "block" -and ($_.deviceClass -eq "storage" -or $_.deviceClass -eq "all") } | Select-Object -First 1
    $storageReadOnly    = $sortedPolicies | Where-Object { $_.policyType -eq "read_only" -and ($_.deviceClass -eq "storage" -or $_.deviceClass -eq "all") } | Select-Object -First 1
    $storageAllow       = $sortedPolicies | Where-Object { $_.policyType -eq "allow" -and ($_.deviceClass -eq "storage" -or $_.deviceClass -eq "all") } | Select-Object -First 1

    $currentMarker = Get-UsbPolicyMarker

    if ($storageAllow) {
        # allow explicito prevalece
        if ($currentMarker -ne "normal") {
            Set-UsbStorService -StartType "3"
            Set-UsbWriteProtect -Enable $false
            Save-UsbPolicyMarker -State "normal"
            Write-Log "[PolicyEngine] USB storage ALLOWED (explicit policy: $($storageAllow.name))"
        }
    } elseif ($storageBlockPolicy) {
        if ($currentMarker -ne "block_storage") {
            Set-UsbStorService -StartType "4"
            Set-UsbWriteProtect -Enable $false
            Save-UsbPolicyMarker -State "block_storage"
            Write-Log "[PolicyEngine] USB storage BLOCKED proactively (policy: $($storageBlockPolicy.name))"
        }
    } elseif ($storageReadOnly) {
        if ($currentMarker -ne "read_only") {
            Set-UsbStorService -StartType "3"
            Set-UsbWriteProtect -Enable $true
            Save-UsbPolicyMarker -State "read_only"
            Write-Log "[PolicyEngine] USB storage READ-ONLY (policy: $($storageReadOnly.name))"
        }
    }

    # --- Enforcement reativo por dispositivo (VID/PID/serial ou classes nao-storage) ---
    $usbDevices = Get-PnpDevice -PresentOnly -Class "USB","DiskDrive","HIDClass","Image","Bluetooth","Net","Printer" -ErrorAction SilentlyContinue
    if (-not $usbDevices) { return }

    foreach ($dev in $usbDevices) {
        $pnpId = $dev.InstanceId
        $vid = if ($pnpId -match 'VID_([0-9A-Fa-f]{4})') { $Matches[1].ToUpper() } else { "" }
        $pidVal = if ($pnpId -match 'PID_([0-9A-Fa-f]{4})') { $Matches[1].ToUpper() } else { "" }
        $serial = if ($pnpId -match '\\([^\\]+)$') { $Matches[1] } else { "" }
        $devClass = Get-UsbDeviceClass -PnpId $pnpId

        $device = @{
            name        = $dev.FriendlyName
            deviceClass = $devClass
            deviceId    = $dev.DeviceID
            pnpId       = $pnpId
            vid         = $vid
            pid_val     = $pidVal
            serial      = $serial
        }

        # Encontrar politica de maior prioridade que case com este dispositivo
        $decision     = "allow"
        $matchedPolicy = $null
        foreach ($pol in $sortedPolicies) {
            if (Match-UsbPolicy -Device $device -Policy $pol) {
                $decision      = $pol.policyType
                $matchedPolicy = $pol
                break  # primeira (maior prioridade) vence
            }
        }

        if ($decision -eq "block") {
            # Desabilitar dispositivo especifico via PnP
            try {
                Disable-PnpDevice -InstanceId $pnpId -Confirm:$false -ErrorAction Stop
                Write-Log "[PolicyEngine] USB BLOCKED (PnP disabled): $($dev.FriendlyName) VID=$vid PID=$pidVal (policy: $($matchedPolicy.name))"
                Report-UsbEvent -ApiUrl $ApiUrl -Token $Token -Hostname $Hostname -Device $device -Action "blocked" -PolicyName $matchedPolicy.name
            } catch {
                Write-Log "[PolicyEngine] Falha ao desabilitar $pnpId : $($_.Exception.Message)"
            }
        } elseif ($decision -eq "notify") {
            Report-UsbEvent -ApiUrl $ApiUrl -Token $Token -Hostname $Hostname -Device $device -Action "notified" -PolicyName $matchedPolicy.name
        }
    }
}

# ---------------------------------------------------------------------------
# PRODUCTIVITY — coleta de metricas (sem bloqueio: modelo nao suporta blockedApps)
# ---------------------------------------------------------------------------

function Report-ProductivityMetrics {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId,
        [string]$Hostname = $env:COMPUTERNAME
    )

    $policies = Get-MachinePolicies -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId
    if (-not $policies -or -not $policies.productivity) { return }

    $pol = $policies.productivity
    if (-not $pol.isActive) { return }
    if (-not $pol.trackApps) { return }

    try {
        $procs = Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $pol.excludedProcesses -notcontains $_.Name } |
            Select-Object Name, CPU, WorkingSet, Id |
            Sort-Object CPU -Descending |
            Select-Object -First 20

        $productiveNames   = if ($pol.productiveApps)   { $pol.productiveApps   | ForEach-Object { $_.name } } else { @() }
        $unproductiveNames = if ($pol.unproductiveApps) { $pol.unproductiveApps | ForEach-Object { $_.name } } else { @() }

        $appData = $procs | ForEach-Object {
            $cat = if ($productiveNames -contains $_.Name)   { "productive" }
                   elseif ($unproductiveNames -contains $_.Name) { "unproductive" }
                   else { "neutral" }
            @{ name = $_.Name; cpu = [math]::Round($_.CPU, 1); mem_mb = [math]::Round($_.WorkingSet / 1MB, 1); category = $cat }
        }

        $body = @{
            token    = $Token
            hostname = $Hostname
            apps     = $appData
            sampledAt = (Get-Date).ToUniversalTime().ToString("o")
        } | ConvertTo-Json -Depth 5

        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/activity" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 10
    } catch {
        Write-Log "[PolicyEngine] Error reporting productivity: $($_.Exception.Message)"
    }
}

Export-ModuleMember -Function Get-MachinePolicies, Enforce-UsbPolicies, Report-ProductivityMetrics
