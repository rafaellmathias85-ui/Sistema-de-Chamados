# ============================================
# Modulo: WinnerRMM-Governance
# Coleta de atividade, sessoes e produtividade
# Winner Tecnologia - Agente v2.0
# ============================================

$ErrorActionPreference = "SilentlyContinue"

function Send-ActivitySession {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    try {
        # Obter usuario ativo
        $user = (Get-WmiObject Win32_ComputerSystem).UserName
        if (-not $user) { $user = $env:USERNAME }
        
        # Obter janela ativa
        Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            using System.Text;
            public class Win32 {
                [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
                [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
            }
"@
        $hwnd = [Win32]::GetForegroundWindow()
        $sb = New-Object System.Text.StringBuilder 256
        [Win32]::GetWindowText($hwnd, $sb, 256) | Out-Null
        $title = $sb.ToString()
        
        $procId = 0
        [Win32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $appName = if ($proc) { $proc.ProcessName } else { "unknown" }
        
        # Verificar idle time
        Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
            public class IdleCheck {
                [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
            }
"@
        $lii = New-Object LASTINPUTINFO
        $lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lii)
        [IdleCheck]::GetLastInputInfo([ref]$lii) | Out-Null
        $idleMs = [Environment]::TickCount - $lii.dwTime
        $isIdle = ($idleMs -gt 300000)  # 5 minutos = idle
        
        $body = @{
            token = $Token
            machineId = $MachineId
            sessions = @(
                @{
                    username = $user
                    activeApp = $appName
                    activeTitle = $title
                    startedAt = (Get-Date).ToUniversalTime().ToString("o")
                    activeSeconds = if ($isIdle) { 0 } else { 60 }
                    idleSeconds = if ($isIdle) { 60 } else { 0 }
                    isIdle = $isIdle
                }
            )
        } | ConvertTo-Json -Depth 5
        
        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/activity" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
        Write-Log "[Governance] Activity session sent: $appName ($title)"
    } catch {
        Write-Log "[Governance] Error sending activity: $($_.Exception.Message)"
    }
}

function Send-UsbEvents {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    try {
        # Buscar eventos USB recentes (ultimos 5 min)
        $cutoff = (Get-Date).AddMinutes(-5)
        $usbDevices = Get-WmiObject Win32_USBControllerDevice | ForEach-Object {
            $dep = [wmi]$_.Dependent
            @{
                deviceName = $dep.Description
                deviceType = $dep.PNPClass
                serialNumber = $dep.PNPDeviceID
                vendorId = ""
                productId = ""
            }
        }
        
        # Checar registro do Windows para plug events
        $setupEvents = Get-WinEvent -FilterHashtable @{
            LogName = "Microsoft-Windows-DeviceSetupManager/Admin"
            StartTime = $cutoff
        } -MaxEvents 10 -ErrorAction SilentlyContinue
        
        if ($setupEvents -or $usbDevices) {
            $events = @()
            foreach ($dev in $usbDevices) {
                $events += @{
                    deviceName = $dev.deviceName
                    deviceType = if ($dev.deviceType) { $dev.deviceType } else { "Unknown" }
                    action = "connected"
                    serialNumber = $dev.serialNumber
                    vendorId = $dev.vendorId
                    productId = $dev.productId
                    timestamp = (Get-Date).ToUniversalTime().ToString("o")
                }
            }
            
            if ($events.Count -gt 0) {
                $body = @{
                    token = $Token
                    machineId = $MachineId
                    events = $events
                } | ConvertTo-Json -Depth 5
                
                Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/usb-events" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
                Write-Log "[Governance] USB events sent: $($events.Count) devices"
            }
        }
    } catch {
        Write-Log "[Governance] Error sending USB events: $($_.Exception.Message)"
    }
}

function Send-DriverInventory {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    try {
        $drivers = Get-WmiObject Win32_PnPSignedDriver | Where-Object { $_.DriverVersion } | ForEach-Object {
            @{
                driverName = $_.DeviceName
                driverVersion = $_.DriverVersion
                driverDate = if ($_.DriverDate) { $_.DriverDate.Substring(0,8) } else { $null }
                driverClass = $_.DeviceClass
                manufacturer = $_.Manufacturer
                infName = $_.InfName
            }
        }
        
        if ($drivers.Count -gt 0) {
            $body = @{
                token = $Token
                machineId = $MachineId
                drivers = $drivers
            } | ConvertTo-Json -Depth 5
            
            Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/drivers" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
            Write-Log "[Governance] Driver inventory sent: $($drivers.Count) drivers"
        }
    } catch {
        Write-Log "[Governance] Error sending drivers: $($_.Exception.Message)"
    }
}

Export-ModuleMember -Function Send-ActivitySession, Send-UsbEvents, Send-DriverInventory
