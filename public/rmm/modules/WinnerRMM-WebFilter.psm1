# ============================================
# Modulo: WinnerRMM-WebFilter
# Monitoramento de navegacao e filtro de URLs
# Winner Tecnologia - Agente v2.0
# ============================================

$ErrorActionPreference = "SilentlyContinue"

$script:WebFilterCache = @{}
$script:CacheExpiry = (Get-Date)

function Get-BrowserHistory {
    param([int]$Minutes = 5)
    
    $urls = @()
    $cutoff = (Get-Date).AddMinutes(-$Minutes)
    
    # Chrome
    $chromePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\History"
    if (Test-Path $chromePath) {
        try {
            $tempDb = "$env:TEMP\chrome_history_copy.db"
            Copy-Item $chromePath $tempDb -Force
            # Usar SQLite se disponivel, senao pular
            # O agente MSI tera SQLite embarcado
        } catch {}
    }
    
    # Edge
    $edgePath = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\History"
    if (Test-Path $edgePath) {
        try {
            $tempDb = "$env:TEMP\edge_history_copy.db"
            Copy-Item $edgePath $tempDb -Force
        } catch {}
    }
    
    # Fallback: DNS cache
    $dnsCache = Get-DnsClientCache -ErrorAction SilentlyContinue | Where-Object {
        $_.Entry -notmatch "(microsoft|windows|msftncsi|office|live)" -and
        $_.Entry -match "\." -and
        $_.Status -eq 0
    } | Select-Object -First 50
    
    foreach ($entry in $dnsCache) {
        $urls += @{
            url = "https://$($entry.Entry)"
            domain = $entry.Entry
            title = ""
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
        }
    }
    
    return $urls
}

function Test-UrlAllowed {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId,
        [string]$Url
    )
    
    try {
        $domain = ([System.Uri]$Url).Host
        
        # Cache local (5 minutos)
        if ($script:WebFilterCache.ContainsKey($domain) -and (Get-Date) -lt $script:CacheExpiry) {
            return $script:WebFilterCache[$domain]
        }
        
        $res = Invoke-RestMethod -Uri "$ApiUrl/api/rmm/webfilter/check?token=$Token&machineId=$MachineId&url=$([System.Web.HttpUtility]::UrlEncode($Url))" -Method GET -TimeoutSec 5
        
        $script:WebFilterCache[$domain] = $res
        $script:CacheExpiry = (Get-Date).AddMinutes(5)
        
        return $res
    } catch {
        return @{ action = "allow" }  # Fail-open
    }
}

function Send-WebActivity {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    try {
        $user = (Get-WmiObject Win32_ComputerSystem).UserName
        $urls = Get-BrowserHistory -Minutes 5
        
        if ($urls.Count -eq 0) { return }
        
        $activities = @()
        foreach ($u in $urls) {
            # Verificar filtro
            $check = Test-UrlAllowed -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -Url $u.url
            
            $activities += @{
                url = $u.url
                domain = $u.domain
                title = $u.title
                username = $user
                timestamp = $u.timestamp
            }
        }
        
        $body = @{
            token = $Token
            machineId = $MachineId
            urls = $activities
        } | ConvertTo-Json -Depth 5
        
        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/web-activity" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
        Write-Log "[WebFilter] Sent $($activities.Count) web activities"
    } catch {
        Write-Log "[WebFilter] Error: $($_.Exception.Message)"
    }
}

function Send-WebFilterLogs {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )
    
    try {
        $user = (Get-WmiObject Win32_ComputerSystem).UserName
        $urls = Get-BrowserHistory -Minutes 5
        
        if ($urls.Count -eq 0) { return }
        
        $logs = @()
        foreach ($u in $urls) {
            $check = Test-UrlAllowed -ApiUrl $ApiUrl -Token $Token -MachineId $MachineId -Url $u.url
            
            $logs += @{
                url = $u.url
                domain = $u.domain
                title = $u.title
                action = if ($check.action -eq "blocked") { "blocked" } else { "allowed" }
                categoryMatched = $check.category_matched
                policyName = $check.policy_name
                username = $user
                timestamp = $u.timestamp
            }
        }
        
        $body = @{
            token = $Token
            machineId = $MachineId
            logs = $logs
        } | ConvertTo-Json -Depth 5
        
        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/webfilter/logs" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
        Write-Log "[WebFilter] Sent $($logs.Count) filter logs"
    } catch {
        Write-Log "[WebFilter] Error sending logs: $($_.Exception.Message)"
    }
}

Export-ModuleMember -Function Get-BrowserHistory, Test-UrlAllowed, Send-WebActivity, Send-WebFilterLogs
