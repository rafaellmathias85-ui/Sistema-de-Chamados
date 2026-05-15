<#
.SYNOPSIS
    Winner RMM - Módulo de Diagnóstico de Rede (SNMP + UniFi)
.DESCRIPTION
    Descobre e monitora dispositivos de rede via SNMP e UniFi Controller API.
    Coleta métricas de WiFi (rádios), WAN (latência/jitter/perda), Switch (portas),
    e envia para a API /api/rmm/governance/network-diag para análise automática.
.VERSION
    1.0.0
.AUTHOR
    Winner Tecnologia - RMM v2
#>

$ErrorActionPreference = 'SilentlyContinue'
$NETWORK_CONFIG_PATH = "C:\ProgramData\WinnerRMM\network_config.json"
$SNMP_COMMUNITY = "public"  # fallback se não configurado
$SNMP_TIMEOUT = 3000  # ms

# ============================================================
# Configuração
# ============================================================
function Get-NetworkConfig {
    [CmdletBinding()]
    param()
    
    $default = @{
        enabled          = $true
        snmpCommunity    = "public"
        snmpVersion      = "2c"
        subnetsToScan    = @()
        controllerUrl    = ""
        controllerUser   = ""
        controllerPass   = ""
        unifiSites       = @("default")
        scanIntervalSec  = 300
        lastScanTime     = $null
    }
    
    if (Test-Path $NETWORK_CONFIG_PATH) {
        try {
            $cfg = Get-Content $NETWORK_CONFIG_PATH -Raw | ConvertFrom-Json
            # Descriptografar senha do controller se existir
            if ($cfg.controllerPassEncrypted) {
                try {
                    $secStr = $cfg.controllerPassEncrypted | ConvertTo-SecureString
                    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secStr)
                    $cfg | Add-Member -NotePropertyName controllerPass -NotePropertyValue ([System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)) -Force
                    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
                } catch {
                    Write-Warning "[NetworkDiag] Falha ao descriptografar senha do controller: $_"
                }
            }
            return $cfg
        } catch {
            Write-Warning "[NetworkDiag] Erro ao ler config: $_"
        }
    }
    
    return $default
}

function Save-NetworkConfig {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Config)
    
    $dir = Split-Path $NETWORK_CONFIG_PATH -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    # Criptografar senha antes de salvar
    $saveCfg = $Config | ConvertTo-Json -Depth 5 | ConvertFrom-Json
    if ($saveCfg.controllerPass) {
        $secStr = ConvertTo-SecureString $saveCfg.controllerPass -AsPlainText -Force
        $saveCfg | Add-Member -NotePropertyName controllerPassEncrypted -NotePropertyValue ($secStr | ConvertFrom-SecureString) -Force
        $saveCfg.controllerPass = ""  # limpar texto plano
    }
    
    $saveCfg | ConvertTo-Json -Depth 5 | Set-Content $NETWORK_CONFIG_PATH -Force
}

# ============================================================
# Descoberta de Dispositivos via ARP + SNMP
# ============================================================
function Get-NetworkDevicesArp {
    [CmdletBinding()]
    param(
        [string]$Community = "public",
        [string[]]$Subnets = @()
    )
    
    $devices = @()
    
    # 1. Tabela ARP local
    $arpEntries = Get-NetNeighbor -AddressFamily IPv4 | Where-Object {
        $_.State -ne 'Unreachable' -and
        $_.IPAddress -notlike '224.*' -and
        $_.IPAddress -notlike '255.*' -and
        $_.IPAddress -ne '0.0.0.0'
    }
    
    foreach ($entry in $arpEntries) {
        $ip = $entry.IPAddress
        $mac = $entry.LinkLayerAddress -replace '-', ':'
        
        # Tentar SNMP sysDescr (OID 1.3.6.1.2.1.1.1.0)
        $snmpData = Get-SnmpSysInfo -IpAddress $ip -Community $Community
        
        if ($snmpData) {
            $deviceInfo = @{
                ipAddress   = $ip
                macAddress  = $mac
                name        = $snmpData.sysName
                type        = Resolve-DeviceType -SysDescr $snmpData.sysDescr -SysOid $snmpData.sysObjectID
                vendor      = Resolve-Vendor -SysDescr $snmpData.sysDescr -Mac $mac
                model       = ""
                firmware    = ""
                status      = "online"
                uptimeStr   = $snmpData.uptime
                snmpVersion = "2c"
                sysDescr    = $snmpData.sysDescr
            }
            $devices += $deviceInfo
        }
    }
    
    return $devices
}

function Get-SnmpSysInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$IpAddress,
        [string]$Community = "public"
    )
    
    try {
        # Usar UDP direto para SNMP v2c GET
        $oids = @{
            sysDescr    = "1.3.6.1.2.1.1.1.0"
            sysObjectID = "1.3.6.1.2.1.1.2.0"
            sysName     = "1.3.6.1.2.1.1.5.0"
            sysUptime   = "1.3.6.1.2.1.1.3.0"
        }
        
        $result = @{}
        
        foreach ($oidName in $oids.Keys) {
            $val = Invoke-SnmpGet -IpAddress $IpAddress -Community $Community -Oid $oids[$oidName]
            if ($val) { $result[$oidName] = $val }
        }
        
        if ($result.Count -eq 0) { return $null }
        
        # Converter uptime ticks para string
        $uptimeStr = ""
        if ($result.sysUptime) {
            try {
                $ticks = [long]$result.sysUptime
                $ts = [TimeSpan]::FromMilliseconds($ticks * 10)
                $uptimeStr = "{0}d {1}h {2}m" -f $ts.Days, $ts.Hours, $ts.Minutes
            } catch { $uptimeStr = $result.sysUptime }
        }
        
        return @{
            sysDescr    = $result.sysDescr
            sysObjectID = $result.sysObjectID
            sysName     = $result.sysName
            uptime      = $uptimeStr
        }
    } catch {
        return $null
    }
}

function Invoke-SnmpGet {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$IpAddress,
        [string]$Community = "public",
        [Parameter(Mandatory)][string]$Oid,
        [int]$Port = 161,
        [int]$TimeoutMs = 3000
    )
    
    try {
        # Construir pacote SNMP v2c GET manualmente
        $oidParts = $Oid.Split('.') | ForEach-Object { [int]$_ }
        
        # Encoding BER do OID
        $encodedOid = @()
        # Primeiro par: 40*X + Y
        $encodedOid += [byte](40 * $oidParts[0] + $oidParts[1])
        for ($i = 2; $i -lt $oidParts.Count; $i++) {
            $val = $oidParts[$i]
            if ($val -lt 128) {
                $encodedOid += [byte]$val
            } else {
                $bytes = @()
                $temp = $val
                $bytes += [byte]($temp -band 0x7F)
                $temp = $temp -shr 7
                while ($temp -gt 0) {
                    $bytes += [byte](($temp -band 0x7F) -bor 0x80)
                    $temp = $temp -shr 7
                }
                [array]::Reverse($bytes)
                $encodedOid += $bytes
            }
        }
        
        # Construir pacote BER
        $communityBytes = [System.Text.Encoding]::ASCII.GetBytes($Community)
        $requestId = [BitConverter]::GetBytes([int](Get-Random -Maximum 2147483647))
        [Array]::Reverse($requestId)
        
        # VarBind: OID + NULL
        $varbind = @(0x30) + (Get-BerLength ($encodedOid.Count + 2 + 2)) + @(0x06) + (Get-BerLength $encodedOid.Count) + $encodedOid + @(0x05, 0x00)
        # VarBindList
        $varbindList = @(0x30) + (Get-BerLength $varbind.Count) + $varbind
        # PDU (GetRequest = 0xA0)
        $pdu = @(0x02) + (Get-BerLength $requestId.Count) + $requestId + @(0x02, 0x01, 0x00, 0x02, 0x01, 0x00) + $varbindList
        $pduWrapped = @(0xA0) + (Get-BerLength $pdu.Count) + $pdu
        # Version (SNMPv2c = 1)
        $version = @(0x02, 0x01, 0x01)
        # Community
        $comm = @(0x04) + (Get-BerLength $communityBytes.Count) + $communityBytes
        # Message
        $msg = $version + $comm + $pduWrapped
        $packet = @(0x30) + (Get-BerLength $msg.Count) + $msg
        
        # Enviar UDP
        $udp = New-Object System.Net.Sockets.UdpClient
        $udp.Client.ReceiveTimeout = $TimeoutMs
        $udp.Client.SendTimeout = $TimeoutMs
        $endpoint = New-Object System.Net.IPEndPoint ([System.Net.IPAddress]::Parse($IpAddress)), $Port
        
        [void]$udp.Send([byte[]]$packet, $packet.Count, $endpoint)
        
        $remoteEp = New-Object System.Net.IPEndPoint ([System.Net.IPAddress]::Any), 0
        $response = $udp.Receive([ref]$remoteEp)
        $udp.Close()
        
        # Decodificar resposta - extrair valor da VarBind
        $valueStr = Extract-SnmpValue -ResponseBytes $response
        return $valueStr
    } catch {
        return $null
    }
}

function Get-BerLength {
    param([int]$Length)
    if ($Length -lt 128) {
        return @([byte]$Length)
    }
    $bytes = [BitConverter]::GetBytes($Length)
    [Array]::Reverse($bytes)
    $significant = $bytes | Where-Object { $_ -ne 0 }
    if ($significant.Count -eq 0) { $significant = @([byte]0) }
    return @([byte](0x80 -bor $significant.Count)) + $significant
}

function Extract-SnmpValue {
    param([byte[]]$ResponseBytes)
    try {
        # Navegar BER até encontrar o valor na VarBind
        # Simplificado: procurar último OctetString (0x04) ou Integer (0x02) após o OID
        $str = [System.Text.Encoding]::ASCII.GetString($ResponseBytes)
        # Extrair printable chars após a estrutura BER
        $printable = ($str -replace '[^\x20-\x7E]', ' ').Trim()
        # Remover prefixo de protocolo SNMP e retornar conteúdo
        if ($printable.Length -gt 10) {
            # Tentar encontrar o valor real
            $lastNull = $ResponseBytes.Count - 1
            while ($lastNull -gt 0 -and $ResponseBytes[$lastNull] -eq 0) { $lastNull-- }
            
            # Procurar tipo do valor (após o último 0x06 OID)
            for ($i = $ResponseBytes.Count - 1; $i -ge 0; $i--) {
                if ($ResponseBytes[$i] -eq 0x04) { # OctetString
                    $len = $ResponseBytes[$i + 1]
                    if ($len -gt 0 -and ($i + 2 + $len) -le $ResponseBytes.Count) {
                        return [System.Text.Encoding]::UTF8.GetString($ResponseBytes, $i + 2, $len)
                    }
                }
                if ($ResponseBytes[$i] -eq 0x43 -or $ResponseBytes[$i] -eq 0x41) { # TimeTicks/Counter
                    $len = $ResponseBytes[$i + 1]
                    $val = 0
                    for ($j = 0; $j -lt $len; $j++) {
                        $val = ($val -shl 8) + $ResponseBytes[$i + 2 + $j]
                    }
                    return $val.ToString()
                }
            }
            return $printable
        }
        return $null
    } catch { return $null }
}

function Resolve-DeviceType {
    param([string]$SysDescr, [string]$SysOid)
    $desc = ($SysDescr + " " + $SysOid).ToLower()
    if ($desc -match 'uap|access.point|wireless|wifi|ap ') { return 'ap' }
    if ($desc -match 'usw|switch') { return 'switch' }
    if ($desc -match 'ugw|udm|gateway|dream.machine|usg') { return 'gateway' }
    if ($desc -match 'firewall|fortigate|pfsense|sophos') { return 'firewall' }
    if ($desc -match 'router|mikrotik|routeros') { return 'router' }
    if ($desc -match 'printer|impressor') { return 'printer' }
    return 'unknown'
}

function Resolve-Vendor {
    param([string]$SysDescr, [string]$Mac)
    $desc = $SysDescr.ToLower()
    $macPrefix = ($Mac -replace '[^0-9A-Fa-f]', '').Substring(0, [Math]::Min(6, ($Mac -replace '[^0-9A-Fa-f]', '').Length)).ToUpper()
    
    # Vender por descrição
    if ($desc -match 'ubiquiti|unifi|ubnt') { return 'Ubiquiti' }
    if ($desc -match 'cisco') { return 'Cisco' }
    if ($desc -match 'mikrotik|routeros') { return 'MikroTik' }
    if ($desc -match 'fortigate|fortinet') { return 'Fortinet' }
    if ($desc -match 'tp-link|tplink') { return 'TP-Link' }
    if ($desc -match 'netgear') { return 'Netgear' }
    if ($desc -match 'aruba|hpe') { return 'Aruba' }
    if ($desc -match 'juniper') { return 'Juniper' }
    if ($desc -match 'sophos') { return 'Sophos' }
    if ($desc -match 'pfsense') { return 'pfSense' }
    
    # MAC OUI prefixes comuns
    $ouiMap = @{
        '24A43C' = 'Ubiquiti'; '802AA8' = 'Ubiquiti'; 'F09FC2' = 'Ubiquiti'; '788A20' = 'Ubiquiti'
        '00E04C' = 'Realtek'; '001E58' = 'D-Link'; 'C8D719' = 'Cisco'
        '6C3B6B' = 'MikroTik'; '4C5E0C' = 'MikroTik'
    }
    if ($ouiMap.ContainsKey($macPrefix)) { return $ouiMap[$macPrefix] }
    
    return 'Desconhecido'
}

# ============================================================
# UniFi Controller API
# ============================================================
function Connect-UniFiController {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ControllerUrl,
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$Password
    )
    
    try {
        # Ignorar certificado auto-assinado
        if (-not ([System.Net.ServicePointManager]::ServerCertificateValidationCallback)) {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        }
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        
        $baseUrl = $ControllerUrl.TrimEnd('/')
        $loginUrl = "$baseUrl/api/auth/login"
        
        $body = @{ username = $Username; password = $Password } | ConvertTo-Json
        $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        
        $loginResp = Invoke-RestMethod -Uri $loginUrl -Method POST -Body $body -ContentType 'application/json' -WebSession $session -ErrorAction Stop
        
        return @{
            Session = $session
            BaseUrl = $baseUrl
            Success = $true
        }
    } catch {
        # Tentar endpoint legado (pre-UniFi OS)
        try {
            $baseUrl = $ControllerUrl.TrimEnd('/')
            $loginUrl = "$baseUrl/api/login"
            $body = @{ username = $Username; password = $Password } | ConvertTo-Json
            $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
            
            $loginResp = Invoke-RestMethod -Uri $loginUrl -Method POST -Body $body -ContentType 'application/json' -WebSession $session -ErrorAction Stop
            
            return @{
                Session = $session
                BaseUrl = $baseUrl
                Success = $true
                Legacy  = $true
            }
        } catch {
            Write-Warning "[NetworkDiag] Falha ao conectar ao UniFi Controller: $_"
            return @{ Success = $false }
        }
    }
}

function Get-UniFiDevices {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Connection,
        [string[]]$Sites = @("default")
    )
    
    if (-not $Connection.Success) { return @() }
    
    $allDevices = @()
    
    foreach ($site in $Sites) {
        try {
            $apiPath = if ($Connection.Legacy) {
                "$($Connection.BaseUrl)/api/s/$site/stat/device"
            } else {
                "$($Connection.BaseUrl)/proxy/network/api/s/$site/stat/device"
            }
            
            $resp = Invoke-RestMethod -Uri $apiPath -Method GET -WebSession $Connection.Session -ErrorAction Stop
            $devices = if ($resp.data) { $resp.data } else { $resp }
            
            foreach ($dev in $devices) {
                $deviceInfo = @{
                    ipAddress      = $dev.ip
                    macAddress     = $dev.mac
                    name           = if ($dev.name) { $dev.name } else { $dev.hostname }
                    type           = switch ($dev.type) {
                        'uap' { 'ap' }
                        'usw' { 'switch' }
                        'ugw' { 'gateway' }
                        'udm' { 'gateway' }
                        default { $dev.type }
                    }
                    vendor         = 'Ubiquiti'
                    model          = $dev.model_in_lts
                    firmware       = $dev.version
                    status         = if ($dev.state -eq 1) { 'online' } else { 'offline' }
                    uptimeStr      = if ($dev.uptime) { Format-Uptime $dev.uptime } else { $null }
                    cpuPercent     = if ($dev.'system-stats'.cpu) { [double]$dev.'system-stats'.cpu } else { $null }
                    memPercent     = if ($dev.'system-stats'.mem) { [double]$dev.'system-stats'.mem } else { $null }
                    temperature    = $dev.general_temperature
                    siteName       = $site
                    snmpVersion    = 'unifi-api'
                    unifiApiEnabled = $true
                    latency        = $null
                    radios         = @()
                    ports          = @()
                    wan            = $null
                }
                
                # Extrair dados de rádios (APs)
                if ($dev.radio_table -and $dev.radio_table_stats) {
                    foreach ($radio in $dev.radio_table_stats) {
                        $radioConfig = $dev.radio_table | Where-Object { $_.name -eq $radio.name } | Select-Object -First 1
                        $deviceInfo.radios += @{
                            radioName    = $radio.name
                            band         = if ($radio.channel -and $radio.channel -gt 14) { '5GHz' } else { '2.4GHz' }
                            channel      = $radio.channel
                            channelWidth = if ($radioConfig) { $radioConfig.ht } else { $null }
                            txPower      = if ($radioConfig) { $radioConfig.tx_power } else { $null }
                            clientCount  = $radio.'num_sta'
                            satisfaction = $radio.satisfaction
                            retryRate    = $radio.'cu_self_rx'  # aproximação
                            noiseFloor   = $radio.ast_noise
                            channelUtil  = $radio.'cu_total'
                        }
                    }
                }
                
                # Extrair dados de portas (Switches)
                if ($dev.port_table) {
                    foreach ($port in $dev.port_table) {
                        $deviceInfo.ports += @{
                            portIdx    = $port.port_idx
                            portName   = $port.name
                            speed      = $port.speed
                            isUp       = ($port.up -eq $true)
                            poeEnabled = ($port.poe_enable -eq $true)
                            poeWatts   = $port.poe_power
                            rxBytes    = $port.rx_bytes
                            txBytes    = $port.tx_bytes
                            rxErrors   = $port.rx_errors
                            txErrors   = $port.tx_errors
                            stpState   = $port.stp_state
                            vlanId     = $port.portconf_id  # ou network_id
                        }
                    }
                }
                
                # Extrair dados WAN (Gateways/UDM)
                if ($dev.type -in @('ugw', 'udm') -and $dev.wan1) {
                    $w = $dev.wan1
                    $deviceInfo.wan = @{
                        interfaceName = 'wan1'
                        wanType       = $w.type
                        rxBytesRate   = $w.rx_bytes_r
                        txBytesRate   = $w.tx_bytes_r
                        latencyMs     = $dev.uplink.latency
                        jitterMs      = $null
                        packetLoss    = $null
                        isUp          = ($w.up -eq $true)
                    }
                    
                    # Speedtest data se disponível
                    if ($dev.speedtest_status) {
                        $st = $dev.speedtest_status
                        $deviceInfo.wan.latencyMs = $st.latency
                        $deviceInfo.wan.jitterMs = $null  # não disponível no speedtest
                    }
                }
                
                $allDevices += $deviceInfo
            }
        } catch {
            Write-Warning "[NetworkDiag] Erro ao obter dispositivos do site '$site': $_"
        }
    }
    
    return $allDevices
}

function Format-Uptime {
    param([long]$Seconds)
    $ts = [TimeSpan]::FromSeconds($Seconds)
    if ($ts.Days -gt 0) { return "{0}d {1}h {2}m" -f $ts.Days, $ts.Hours, $ts.Minutes }
    return "{0}h {1}m" -f $ts.Hours, $ts.Minutes
}

# ============================================================
# Função Principal — Coleta e Envio
# ============================================================
function Send-NetworkDiagData {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ApiUrl,
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$Hostname
    )
    
    $cfg = Get-NetworkConfig
    if (-not $cfg.enabled) {
        Write-Verbose "[NetworkDiag] Módulo desabilitado na configuração."
        return
    }
    
    $allDevices = @()
    
    # 1. Tentar UniFi Controller API (preferência)
    if ($cfg.controllerUrl -and $cfg.controllerUser -and $cfg.controllerPass) {
        Write-Verbose "[NetworkDiag] Conectando ao UniFi Controller: $($cfg.controllerUrl)"
        $conn = Connect-UniFiController -ControllerUrl $cfg.controllerUrl -Username $cfg.controllerUser -Password $cfg.controllerPass
        
        if ($conn.Success) {
            $sites = if ($cfg.unifiSites -and $cfg.unifiSites.Count -gt 0) { $cfg.unifiSites } else { @("default") }
            $unifiDevices = Get-UniFiDevices -Connection $conn -Sites $sites
            $allDevices += $unifiDevices
            Write-Verbose "[NetworkDiag] UniFi: $($unifiDevices.Count) dispositivos encontrados"
        }
    }
    
    # 2. Descoberta SNMP/ARP (dispositivos não-UniFi)
    $arpDevices = Get-NetworkDevicesArp -Community ($cfg.snmpCommunity ?? "public") -Subnets ($cfg.subnetsToScan ?? @())
    
    # Mesclar: não duplicar por MAC
    foreach ($arpDev in $arpDevices) {
        $exists = $allDevices | Where-Object {
            ($_.macAddress -and $arpDev.macAddress -and $_.macAddress -eq $arpDev.macAddress) -or
            ($_.ipAddress -eq $arpDev.ipAddress)
        }
        if (-not $exists) {
            $allDevices += $arpDev
        }
    }
    
    if ($allDevices.Count -eq 0) {
        Write-Verbose "[NetworkDiag] Nenhum dispositivo de rede encontrado."
        return
    }
    
    Write-Verbose "[NetworkDiag] Total: $($allDevices.Count) dispositivos. Enviando para API..."
    
    # 3. Enviar para API
    $payload = @{
        token    = $Token
        hostname = $Hostname
        devices  = $allDevices
    } | ConvertTo-Json -Depth 10 -Compress
    
    try {
        $resp = Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/network-diag" -Method POST -Body $payload -ContentType 'application/json; charset=utf-8' -TimeoutSec 30 -ErrorAction Stop
        
        if ($resp.processed) {
            Write-Verbose "[NetworkDiag] API processou $($resp.processed) dispositivos, $($resp.diagnosticsCreated) diagnósticos criados."
        }
    } catch {
        Write-Warning "[NetworkDiag] Erro ao enviar dados: $_"
    }
}

# ============================================================
# Exports
# ============================================================
Export-ModuleMember -Function @(
    'Get-NetworkConfig',
    'Save-NetworkConfig',
    'Get-NetworkDevicesArp',
    'Get-SnmpSysInfo',
    'Connect-UniFiController',
    'Get-UniFiDevices',
    'Send-NetworkDiagData'
)
