# ============================================
# WinnerRMM-DiskHealth.psm1
# Módulo de Saúde de Discos - Winner Tecnologia RMM v2
# Coleta SMART, temperatura, desgaste, partições
# e gera alertas locais por threshold
# ============================================

$ErrorActionPreference = "SilentlyContinue"

# ============ THRESHOLDS DE ALERTA ============
$THRESHOLDS = @{
    TemperatureWarning    = 50    # °C
    TemperatureCritical   = 60    # °C
    WearWarning           = 70    # % desgaste
    WearCritical          = 90    # % desgaste
    ReallocatedWarning    = 5     # setores
    ReallocatedCritical   = 50    # setores
    PendingSectorsWarning = 1     # qualquer setor pendente
    UncorrectableWarning  = 1     # qualquer erro
    DiskFullWarning       = 90    # % uso da partição
    DiskFullCritical      = 95    # % uso da partição
    HealthScoreWarning    = 60    # score mínimo
    HealthScoreCritical   = 30    # score crítico
}

# ============ FUNÇÕES AUXILIARES ============

function Write-DiskLog($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logPath = "C:\ProgramData\WinnerRMM\disk_health.log"
    Add-Content -Path $logPath -Value "[$ts] $msg" -ErrorAction SilentlyContinue
    # Rotacao
    if ((Get-Item $logPath -ErrorAction SilentlyContinue).Length -gt 2MB) {
        $content = Get-Content $logPath -Tail 500
        Set-Content -Path $logPath -Value $content -Force
    }
}

function Get-MediaTypeString($mediaTypeInt) {
    switch ($mediaTypeInt) {
        3  { return "HDD" }
        4  { return "SSD" }
        5  { return "SCM" }
        default {
            # Tentar detectar NVMe pelo bus type
            return "Unknown"
        }
    }
}

function Get-BusTypeString($busTypeInt) {
    switch ($busTypeInt) {
        1  { return "SCSI" }
        2  { return "ATAPI" }
        3  { return "ATA" }
        4  { return "1394" }
        5  { return "SSA" }
        6  { return "Fibre" }
        7  { return "USB" }
        8  { return "RAID" }
        9  { return "iSCSI" }
        10 { return "SAS" }
        11 { return "SATA" }
        12 { return "SD" }
        13 { return "MMC" }
        14 { return "MAX" }
        15 { return "FileBackedVirtual" }
        16 { return "StorageSpaces" }
        17 { return "NVMe" }
        default { return "Unknown" }
    }
}

# ============ COLETA DE DADOS ============

function Get-DiskHealthData {
    <#
    .SYNOPSIS
        Coleta dados de saúde de todos os discos físicos da máquina
    .DESCRIPTION
        Usa CIM/WMI para coletar:
        - Inventário de discos (modelo, serial, tipo, tamanho)
        - Partições e espaço livre
        - Status SMART via MSFT_PhysicalDisk e Win32_DiskDrive
        - Métricas de saúde (temperatura, desgaste, setores)
        - Gera alertas locais baseados em thresholds
    #>
    [CmdletBinding()]
    param()

    $disksResult = @()

    try {
        # Obter discos físicos via Storage CIM
        $physicalDisks = @()
        try {
            $physicalDisks = Get-CimInstance -Namespace "root\Microsoft\Windows\Storage" -ClassName MSFT_PhysicalDisk -ErrorAction Stop
        } catch {
            Write-DiskLog "[WARN] MSFT_PhysicalDisk não disponível, usando Win32_DiskDrive"
        }

        # Fallback para Win32_DiskDrive
        $win32Disks = Get-CimInstance -ClassName Win32_DiskDrive -ErrorAction SilentlyContinue
        
        # Obter volumes para partições
        $volumes = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue
        $partitions = Get-CimInstance -ClassName Win32_DiskDriveToDiskPartition -ErrorAction SilentlyContinue
        $logicalToPartition = Get-CimInstance -ClassName Win32_LogicalDiskToPartition -ErrorAction SilentlyContinue

        # Iterar sobre discos
        $diskIndex = 0
        foreach ($w32disk in $win32Disks) {
            $diskNumber = $w32disk.Index
            $model = $w32disk.Model
            $serial = ($w32disk.SerialNumber -replace '\s+', '').Trim()
            $firmware = $w32disk.FirmwareRevision
            $sizeBytes = $w32disk.Size

            # Determinar tipo de mídia e barramento
            $mediaType = "Unknown"
            $busType = "Unknown"
            $smartStatus = "Unknown"
            $smartEnabled = $null
            $temperature = $null
            $wearLeveling = $null
            $powerOnHours = $null
            $powerCycleCount = $null
            $readErrorRate = $null
            $writeErrorRate = $null
            $reallocatedSectors = $null
            $pendingSectors = $null
            $uncorrectableErrors = $null

            # Tentar pegar dados do MSFT_PhysicalDisk correspondente
            $msftDisk = $physicalDisks | Where-Object { $_.DeviceId -eq $diskNumber.ToString() } | Select-Object -First 1
            if ($msftDisk) {
                $mediaType = Get-MediaTypeString $msftDisk.MediaType
                $busType = Get-BusTypeString $msftDisk.BusType

                # Se MediaType for Unknown mas BusType for NVMe
                if ($mediaType -eq "Unknown" -and $busType -eq "NVMe") {
                    $mediaType = "NVMe"
                }

                # Status SMART
                switch ($msftDisk.HealthStatus) {
                    0 { $smartStatus = "Healthy" }
                    1 { $smartStatus = "Warning" }
                    2 { $smartStatus = "Critical" }
                    5 { $smartStatus = "Unknown" }
                    default { $smartStatus = "Unknown" }
                }

                # Desgaste (SSD/NVMe)
                if ($null -ne $msftDisk.Wear) {
                    $wearLeveling = [int]$msftDisk.Wear
                }

                # Temperatura via Storage Reliability Counter
                try {
                    $reliability = $msftDisk | Get-StorageReliabilityCounter -ErrorAction Stop
                    if ($reliability) {
                        $temperature = $reliability.Temperature
                        if ($null -ne $reliability.PowerOnHours) { $powerOnHours = [int]$reliability.PowerOnHours }
                        if ($null -ne $reliability.StartStopCycleCount) { $powerCycleCount = [int]$reliability.StartStopCycleCount }
                        if ($null -ne $reliability.ReadErrorsTotal) { $readErrorRate = [int]$reliability.ReadErrorsTotal }
                        if ($null -ne $reliability.WriteErrorsTotal) { $writeErrorRate = [int]$reliability.WriteErrorsTotal }
                        if ($null -ne $reliability.Wear) { $wearLeveling = [int]$reliability.Wear }
                    }
                } catch {
                    Write-DiskLog "[WARN] StorageReliabilityCounter falhou para disco $diskNumber"
                }
            } else {
                # Fallback: detectar tipo pelo modelo
                if ($model -match "SSD|Solid State") { $mediaType = "SSD" }
                elseif ($model -match "NVMe|NVME") { $mediaType = "NVMe" }
                elseif ($model -match "HDD|Hard Disk") { $mediaType = "HDD" }
            }

            # Tentar SMART via WMI (método alternativo)
            try {
                $smartData = Get-CimInstance -Namespace "root\WMI" -ClassName MSStorageDriver_ATAPISmartData -ErrorAction Stop |
                    Where-Object { $_.InstanceName -match "$diskNumber" } | Select-Object -First 1
                if ($smartData -and $smartData.VendorSpecific) {
                    $smartEnabled = $true
                    $smartBytes = $smartData.VendorSpecific
                    # Parse SMART attributes (cada atributo = 12 bytes, offset 2)
                    $smartAttrs = @{}
                    for ($i = 2; $i -lt $smartBytes.Count; $i += 12) {
                        if ($i + 11 -ge $smartBytes.Count) { break }
                        $attrId = $smartBytes[$i]
                        if ($attrId -eq 0) { continue }
                        $rawValue = [BitConverter]::ToInt64($smartBytes, $i + 5)
                        $smartAttrs[$attrId] = $rawValue
                    }
                    # Extrair métricas conhecidas
                    if ($smartAttrs.ContainsKey(194) -and $null -eq $temperature) { $temperature = [int]($smartAttrs[194] -band 0xFF) }
                    if ($smartAttrs.ContainsKey(9) -and $null -eq $powerOnHours) { $powerOnHours = [int]$smartAttrs[9] }
                    if ($smartAttrs.ContainsKey(12) -and $null -eq $powerCycleCount) { $powerCycleCount = [int]$smartAttrs[12] }
                    if ($smartAttrs.ContainsKey(5)) { $reallocatedSectors = [int]$smartAttrs[5] }
                    if ($smartAttrs.ContainsKey(197)) { $pendingSectors = [int]$smartAttrs[197] }
                    if ($smartAttrs.ContainsKey(198)) { $uncorrectableErrors = [int]$smartAttrs[198] }
                    if ($smartAttrs.ContainsKey(1) -and $null -eq $readErrorRate) { $readErrorRate = [int]$smartAttrs[1] }
                    if ($smartAttrs.ContainsKey(177) -and $null -eq $wearLeveling) { $wearLeveling = [int]$smartAttrs[177] }
                    if ($smartAttrs.ContainsKey(231) -and $null -eq $wearLeveling) { $wearLeveling = [int](100 - $smartAttrs[231]) }
                }
            } catch {
                Write-DiskLog "[DEBUG] WMI SMART não disponível para disco $diskNumber"
            }

            # Calcular health score (0-100)
            $healthScore = 100
            if ($reallocatedSectors -and $reallocatedSectors -gt 0) {
                $healthScore -= [Math]::Min(30, $reallocatedSectors)
            }
            if ($pendingSectors -and $pendingSectors -gt 0) {
                $healthScore -= [Math]::Min(20, $pendingSectors * 5)
            }
            if ($uncorrectableErrors -and $uncorrectableErrors -gt 0) {
                $healthScore -= [Math]::Min(25, $uncorrectableErrors * 5)
            }
            if ($wearLeveling -and $wearLeveling -gt 0) {
                $healthScore -= [Math]::Min(20, [int]($wearLeveling / 5))
            }
            if ($temperature -and $temperature -gt 55) {
                $healthScore -= [Math]::Min(10, ($temperature - 55) * 2)
            }
            $healthScore = [Math]::Max(0, [Math]::Min(100, $healthScore))

            # Atualizar smartStatus baseado no score se ainda Unknown
            if ($smartStatus -eq "Unknown" -and $healthScore -lt 100) {
                if ($healthScore -ge 80) { $smartStatus = "Healthy" }
                elseif ($healthScore -ge 50) { $smartStatus = "Warning" }
                else { $smartStatus = "Critical" }
            } elseif ($smartStatus -eq "Unknown" -and $smartEnabled) {
                $smartStatus = "Healthy"
            }

            # Coletar partições do disco
            $diskPartitions = @()
            $partCount = 0
            $diskPartObjs = $partitions | Where-Object { $_.Antecedent.DeviceID -eq $w32disk.DeviceID }
            foreach ($dp in $diskPartObjs) {
                $partCount++
                $logParts = $logicalToPartition | Where-Object { $_.Antecedent.DeviceID -eq $dp.Dependent.DeviceID }
                foreach ($lp in $logParts) {
                    $vol = $volumes | Where-Object { $_.DeviceID -eq $lp.Dependent.DeviceID } | Select-Object -First 1
                    if ($vol) {
                        $diskPartitions += @{
                            letter     = $vol.DeviceID
                            label      = $vol.VolumeName
                            sizeBytes  = [long]$vol.Size
                            freeBytes  = [long]$vol.FreeSpace
                            fileSystem = $vol.FileSystem
                        }
                    }
                }
            }

            # Gerar alertas baseados em thresholds
            $diskAlerts = @()

            # Temperatura
            if ($temperature -and $temperature -ge $THRESHOLDS.TemperatureCritical) {
                $diskAlerts += @{
                    severity        = "critical"
                    alert_type      = "temperature_high"
                    title           = "Temperatura crítica: ${temperature}°C"
                    description     = "Disco $model (#$diskNumber) com temperatura acima de $($THRESHOLDS.TemperatureCritical)°C. Risco de dano permanente."
                    metric_name     = "temperature"
                    metric_value    = $temperature
                    threshold_value = $THRESHOLDS.TemperatureCritical
                }
            } elseif ($temperature -and $temperature -ge $THRESHOLDS.TemperatureWarning) {
                $diskAlerts += @{
                    severity        = "warning"
                    alert_type      = "temperature_high"
                    title           = "Temperatura elevada: ${temperature}°C"
                    description     = "Disco $model (#$diskNumber) com temperatura acima de $($THRESHOLDS.TemperatureWarning)°C."
                    metric_name     = "temperature"
                    metric_value    = $temperature
                    threshold_value = $THRESHOLDS.TemperatureWarning
                }
            }

            # Desgaste SSD
            if ($wearLeveling -and $wearLeveling -ge $THRESHOLDS.WearCritical) {
                $diskAlerts += @{
                    severity        = "critical"
                    alert_type      = "wear_critical"
                    title           = "Desgaste crítico: ${wearLeveling}%"
                    description     = "SSD $model (#$diskNumber) com desgaste de ${wearLeveling}%. Substituição urgente recomendada."
                    metric_name     = "wearLeveling"
                    metric_value    = $wearLeveling
                    threshold_value = $THRESHOLDS.WearCritical
                }
            } elseif ($wearLeveling -and $wearLeveling -ge $THRESHOLDS.WearWarning) {
                $diskAlerts += @{
                    severity        = "warning"
                    alert_type      = "wear_critical"
                    title           = "Desgaste elevado: ${wearLeveling}%"
                    description     = "SSD $model (#$diskNumber) com desgaste de ${wearLeveling}%. Planejar substituição."
                    metric_name     = "wearLeveling"
                    metric_value    = $wearLeveling
                    threshold_value = $THRESHOLDS.WearWarning
                }
            }

            # Setores realocados
            if ($reallocatedSectors -and $reallocatedSectors -ge $THRESHOLDS.ReallocatedCritical) {
                $diskAlerts += @{
                    severity        = "critical"
                    alert_type      = "reallocated_sectors"
                    title           = "$reallocatedSectors setores realocados"
                    description     = "Disco $model (#$diskNumber) com $reallocatedSectors setores defeituosos realocados. Disco em estado crítico."
                    metric_name     = "reallocatedSectors"
                    metric_value    = $reallocatedSectors
                    threshold_value = $THRESHOLDS.ReallocatedCritical
                }
            } elseif ($reallocatedSectors -and $reallocatedSectors -ge $THRESHOLDS.ReallocatedWarning) {
                $diskAlerts += @{
                    severity        = "warning"
                    alert_type      = "reallocated_sectors"
                    title           = "$reallocatedSectors setores realocados"
                    description     = "Disco $model (#$diskNumber) com setores defeituosos. Monitorar de perto."
                    metric_name     = "reallocatedSectors"
                    metric_value    = $reallocatedSectors
                    threshold_value = $THRESHOLDS.ReallocatedWarning
                }
            }

            # Setores pendentes
            if ($pendingSectors -and $pendingSectors -ge $THRESHOLDS.PendingSectorsWarning) {
                $diskAlerts += @{
                    severity        = "warning"
                    alert_type      = "reallocated_sectors"
                    title           = "$pendingSectors setores pendentes de realocação"
                    description     = "Disco $model (#$diskNumber) com setores pendentes. Possível degradação."
                    metric_name     = "pendingSectors"
                    metric_value    = $pendingSectors
                    threshold_value = $THRESHOLDS.PendingSectorsWarning
                }
            }

            # Erros incorrigíveis
            if ($uncorrectableErrors -and $uncorrectableErrors -ge $THRESHOLDS.UncorrectableWarning) {
                $diskAlerts += @{
                    severity        = "critical"
                    alert_type      = "io_errors"
                    title           = "$uncorrectableErrors erros incorrigíveis"
                    description     = "Disco $model (#$diskNumber) com erros de I/O não corrigíveis. Risco de perda de dados."
                    metric_name     = "uncorrectableErrors"
                    metric_value    = $uncorrectableErrors
                    threshold_value = $THRESHOLDS.UncorrectableWarning
                }
            }

            # Disco cheio (verificar partições)
            foreach ($part in $diskPartitions) {
                if ($part.sizeBytes -and $part.sizeBytes -gt 0) {
                    $usedPct = [Math]::Round((($part.sizeBytes - $part.freeBytes) / $part.sizeBytes) * 100, 1)
                    if ($usedPct -ge $THRESHOLDS.DiskFullCritical) {
                        $diskAlerts += @{
                            severity        = "critical"
                            alert_type      = "disk_full"
                            title           = "Partição $($part.letter) com ${usedPct}% de uso"
                            description     = "Partição $($part.letter) no disco $model (#$diskNumber) quase cheia."
                            metric_name     = "diskUsagePercent"
                            metric_value    = $usedPct
                            threshold_value = $THRESHOLDS.DiskFullCritical
                        }
                    } elseif ($usedPct -ge $THRESHOLDS.DiskFullWarning) {
                        $diskAlerts += @{
                            severity        = "warning"
                            alert_type      = "disk_full"
                            title           = "Partição $($part.letter) com ${usedPct}% de uso"
                            description     = "Partição $($part.letter) no disco $model (#$diskNumber) acima de $($THRESHOLDS.DiskFullWarning)%."
                            metric_name     = "diskUsagePercent"
                            metric_value    = $usedPct
                            threshold_value = $THRESHOLDS.DiskFullWarning
                        }
                    }
                }
            }

            # Health Score
            if ($healthScore -le $THRESHOLDS.HealthScoreCritical) {
                $diskAlerts += @{
                    severity        = "critical"
                    alert_type      = "smart_failing"
                    title           = "Health Score crítico: ${healthScore}/100"
                    description     = "Disco $model (#$diskNumber) com pontuação de saúde muito baixa. Substituição imediata recomendada."
                    metric_name     = "healthScore"
                    metric_value    = $healthScore
                    threshold_value = $THRESHOLDS.HealthScoreCritical
                }
            } elseif ($healthScore -le $THRESHOLDS.HealthScoreWarning) {
                $diskAlerts += @{
                    severity        = "warning"
                    alert_type      = "smart_failing"
                    title           = "Health Score baixo: ${healthScore}/100"
                    description     = "Disco $model (#$diskNumber) com pontuação de saúde abaixo do ideal."
                    metric_name     = "healthScore"
                    metric_value    = $healthScore
                    threshold_value = $THRESHOLDS.HealthScoreWarning
                }
            }

            # Montar objeto do disco
            $diskObj = @{
                disk_number     = $diskNumber
                model           = $model
                serial_number   = $serial
                firmware_rev    = $firmware
                media_type      = $mediaType
                bus_type        = $busType
                size_bytes      = $sizeBytes
                partition_count = $partCount
                partitions_json = $diskPartitions
                smart_status    = $smartStatus
                smart_enabled   = $smartEnabled
                metrics         = @{
                    temperature          = $temperature
                    power_on_hours       = $powerOnHours
                    power_cycle_count    = $powerCycleCount
                    reallocated_sectors  = $reallocatedSectors
                    pending_sectors      = $pendingSectors
                    uncorrectable_errors = $uncorrectableErrors
                    wear_leveling        = $wearLeveling
                    read_error_rate      = $readErrorRate
                    write_error_rate     = $writeErrorRate
                    throughput_mbps      = $null
                    health_score         = $healthScore
                }
                alerts          = $diskAlerts
            }

            $disksResult += $diskObj
            $diskIndex++
        }
    } catch {
        Write-DiskLog "[ERROR] Falha ao coletar dados de disco: $($_.Exception.Message)"
    }

    return $disksResult
}

# ============ ENVIO PARA API ============

function Send-DiskHealth {
    <#
    .SYNOPSIS
        Envia dados de saúde dos discos para a API RMM
    .PARAMETER ApiUrl
        URL base da API (ex: https://www.wticorp.com.br)
    .PARAMETER Token
        Token RMM da empresa
    .PARAMETER Hostname
        Hostname da máquina (default: $env:COMPUTERNAME)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$ApiUrl,
        [Parameter(Mandatory=$true)][string]$Token,
        [string]$Hostname = $env:COMPUTERNAME
    )

    try {
        $hostname = $Hostname
        Write-DiskLog "[DiskHealth] Coletando dados de saúde dos discos..."

        $disks = Get-DiskHealthData
        if (-not $disks -or $disks.Count -eq 0) {
            Write-DiskLog "[DiskHealth] Nenhum disco detectado."
            return
        }

        $alertCount = 0
        foreach ($d in $disks) {
            $alertCount += $d.alerts.Count
        }
        Write-DiskLog "[DiskHealth] $($disks.Count) disco(s) coletado(s), $alertCount alerta(s)"

        $payload = @{
            token    = $Token
            hostname = $hostname
            disks    = $disks
        } | ConvertTo-Json -Depth 10 -Compress

        $uri = "$ApiUrl/api/rmm/governance/disk-health"
        $response = Invoke-RestMethod -Uri $uri -Method Post -Body $payload -ContentType "application/json; charset=utf-8" -TimeoutSec 30 -ErrorAction Stop

        Write-DiskLog "[DiskHealth] Enviado com sucesso - inv:$($response.inventory) met:$($response.metrics) alerts:$($response.alerts)"
    } catch {
        Write-DiskLog "[DiskHealth] ERRO ao enviar: $($_.Exception.Message)"
    }
}

# ============ EXPORTAR FUNÇÕES ============
Export-ModuleMember -Function Get-DiskHealthData, Send-DiskHealth
