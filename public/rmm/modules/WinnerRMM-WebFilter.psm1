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
    $now = Get-Date
    
    # Metodo 1: Capturar titulos de janelas de browsers abertos
    # Isso pega todas as abas/janelas ativas dos navegadores
    $browserProcesses = @("chrome", "msedge", "firefox", "brave", "opera", "iexplore")
    foreach ($browserName in $browserProcesses) {
        $procs = Get-Process -Name $browserName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" }
        foreach ($p in $procs) {
            $windowTitle = $p.MainWindowTitle
            if ($windowTitle -and $windowTitle.Length -gt 2) {
                # Extrair titulo da pagina (remover " - Google Chrome", " - Microsoft Edge", etc)
                $pageTitle = $windowTitle -replace '\s*[-\x{2013}\x{2014}]\s*(Google Chrome|Microsoft Edge|Mozilla Firefox|Brave|Opera|Internet Explorer)$', ''
                
                # Tentar extrair dominio do titulo se possivel
                $domain = ""
                if ($pageTitle -match '([\w\-]+\.\w{2,})') {
                    $domain = $Matches[1]
                }
                
                $urls += @{
                    url = ""
                    domain = $domain
                    title = $pageTitle.Trim()
                    timestamp = $now.ToUniversalTime().ToString("o")
                    browser = $browserName
                    durationSeconds = 0
                }
            }
        }
    }
    
    # Metodo 2: Acessibilidade — obter URLs das abas via UI Automation (quando disponivel)
    try {
        Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
        foreach ($browserName in @("chrome", "msedge")) {
            $procs = Get-Process -Name $browserName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
            foreach ($p in $procs) {
                try {
                    $element = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
                    # Buscar barra de enderecos (Edit control)
                    $editCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
                    $editElement = $element.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
                    if ($editElement) {
                        $valuePattern = $editElement.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        $currentUrl = $valuePattern.Current.Value
                        if ($currentUrl -and $currentUrl -match '[\w\-]+\.\w{2,}') {
                            # Completar URL se faltou protocolo
                            if ($currentUrl -notmatch '^https?://') { $currentUrl = "https://$currentUrl" }
                            try {
                                $uri = [System.Uri]::new($currentUrl)
                                $domain = $uri.Host
                            } catch { $domain = "" }
                            
                            # Atualizar ou adicionar URL
                            $existingIdx = -1
                            for ($i = 0; $i -lt $urls.Count; $i++) {
                                if ($urls[$i].browser -eq $browserName -and $urls[$i].title -eq $p.MainWindowTitle.Trim()) {
                                    $existingIdx = $i; break
                                }
                            }
                            if ($existingIdx -ge 0) {
                                $urls[$existingIdx].url = $currentUrl
                                $urls[$existingIdx].domain = $domain
                            } else {
                                $urls += @{
                                    url = $currentUrl
                                    domain = $domain
                                    title = $p.MainWindowTitle -replace '\s*[-\x{2013}\x{2014}]\s*(Google Chrome|Microsoft Edge)$', ''
                                    timestamp = $now.ToUniversalTime().ToString("o")
                                    browser = $browserName
                                    durationSeconds = 0
                                }
                            }
                        }
                    }
                } catch {}
            }
        }
    } catch {
        # UIAutomation nao disponivel, continuar com titulos
    }
    
    # Metodo 3: DNS cache como fallback
    $dnsCache = Get-DnsClientCache -ErrorAction SilentlyContinue | Where-Object {
        $_.Entry -notmatch "(microsoft|windows|msftncsi|office|live|windowsupdate|bing\.com|login\.)" -and
        $_.Entry -match "\." -and
        $_.Status -eq 0
    } | Select-Object -First 50
    
    foreach ($entry in $dnsCache) {
        # Evitar duplicatas
        $alreadyHave = $urls | Where-Object { $_.domain -eq $entry.Entry }
        if (-not $alreadyHave) {
            $urls += @{
                url = "https://$($entry.Entry)"
                domain = $entry.Entry
                title = ""
                timestamp = $now.ToUniversalTime().ToString("o")
                browser = "dns-cache"
                durationSeconds = 0
            }
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
        [string]$Hostname
    )
    
    try {
        $user = (Get-WmiObject Win32_ComputerSystem).UserName
        $urls = Get-BrowserHistory -Minutes 5
        
        if ($urls.Count -eq 0) { return }
        
        $activities = @()
        foreach ($u in $urls) {
            # Verificar filtro de URL (bloquear ou permitir)
            $isBlocked = $false
            if ($u.url -and $u.url.Length -gt 5) {
                try {
                    $check = Test-UrlAllowed -ApiUrl $ApiUrl -Token $Token -MachineId $Hostname -Url $u.url
                    if ($check.action -eq "blocked") { $isBlocked = $true }
                } catch {}
            }
            
            $activities += @{
                url = if ($u.url) { $u.url } else { "https://$($u.domain)" }
                domain = $u.domain
                page_title = $u.title
                browser = $u.browser
                duration_seconds = $u.durationSeconds
                visited_at = $u.timestamp
                username = $user
                is_blocked = $isBlocked
            }
        }
        
        $body = @{
            token = $Token
            hostname = $Hostname
            activities = $activities
        } | ConvertTo-Json -Depth 5
        
        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/web-activity" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
        Write-Log "[WebFilter] Sent $($activities.Count) web activities (browser + duration included)"
    } catch {
        Write-Log "[WebFilter] Error: $($_.Exception.Message)"
    }
}

function Send-WebFilterLogs {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$Hostname
    )
    
    try {
        $user = (Get-WmiObject Win32_ComputerSystem).UserName
        $urls = Get-BrowserHistory -Minutes 5
        
        if ($urls.Count -eq 0) { return }
        
        $logs = @()
        foreach ($u in $urls) {
            # Apenas verificar URLs validas
            $urlToCheck = if ($u.url -and $u.url.Length -gt 5) { $u.url } else { "https://$($u.domain)" }
            $check = @{ action = "allowed"; reason = ""; matched_rule = "" }
            try {
                $check = Test-UrlAllowed -ApiUrl $ApiUrl -Token $Token -MachineId $Hostname -Url $urlToCheck
            } catch {}
            
            $logs += @{
                url = $urlToCheck
                domain = $u.domain
                action = if ($check.action -eq "blocked") { "blocked" } else { "allowed" }
                reason = if ($check.reason) { $check.reason } else { $null }
                matched_rule = if ($check.matched_rule) { $check.matched_rule } else { $null }
                username = $user
                event_at = $u.timestamp
            }
        }
        
        # Enviar todos os logs (incluindo bloqueados e permitidos)
        $body = @{
            token = $Token
            hostname = $Hostname
            logs = $logs
        } | ConvertTo-Json -Depth 5
        
        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/webfilter/logs" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
        
        $blockedCount = ($logs | Where-Object { $_.action -eq "blocked" }).Count
        Write-Log "[WebFilter] Sent $($logs.Count) filter logs ($blockedCount blocked)"
    } catch {
        Write-Log "[WebFilter] Error sending logs: $($_.Exception.Message)"
    }
}

Export-ModuleMember -Function Get-BrowserHistory, Test-UrlAllowed, Send-WebActivity, Send-WebFilterLogs
