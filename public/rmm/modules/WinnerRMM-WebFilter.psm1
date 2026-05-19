# ============================================
# Modulo: WinnerRMM-WebFilter
# Monitoramento de navegacao REAL e filtro de URLs
# Winner Tecnologia - Agente v2.0
# ============================================
# Captura historico REAL dos navegadores (Chrome, Edge, Brave, Firefox, Opera)
# via leitura direta do banco SQLite de historico de cada browser.
# Fallback: UI Automation para aba ativa + titulos de janela.
# NAO usa dns-cache (gera ruido, nao reflete navegacao real do usuario).
# ============================================

$ErrorActionPreference = "SilentlyContinue"

$script:WebFilterCache = @{}
$script:CacheExpiry = (Get-Date)
$script:SqliteToolPath = $null

# ============ SQLITE3.EXE TOOL ============

function Ensure-SqliteTool {
    <#
    .SYNOPSIS
        Garante que sqlite3.exe esta disponivel localmente para leitura de historico.
        Baixa da API RMM na primeira execucao e cacheia em C:\ProgramData\WinnerRMM\tools\.
    #>
    param([string]$ApiUrl = "")

    $toolDir = "C:\ProgramData\WinnerRMM\tools"
    $toolPath = "$toolDir\sqlite3.exe"

    # Ja cacheado nesta sessao?
    if ($script:SqliteToolPath -and (Test-Path $script:SqliteToolPath)) {
        return $script:SqliteToolPath
    }

    # Ja existe no disco?
    if (Test-Path $toolPath) {
        $script:SqliteToolPath = $toolPath
        return $toolPath
    }

    # Verificar se esta no PATH do sistema
    $inPath = Get-Command "sqlite3" -ErrorAction SilentlyContinue
    if ($inPath) {
        $script:SqliteToolPath = $inPath.Source
        return $inPath.Source
    }

    # Baixar da API RMM (confiavel, mesmo servidor do agente)
    if ($ApiUrl) {
        try {
            if (-not (Test-Path $toolDir)) { New-Item -ItemType Directory -Path $toolDir -Force | Out-Null }
            $downloadUrl = "$ApiUrl/rmm/tools/sqlite3.exe"
            Write-Log "[WebFilter] Downloading sqlite3.exe from $downloadUrl"
            Invoke-WebRequest -Uri $downloadUrl -OutFile $toolPath -UseBasicParsing -TimeoutSec 60
            if (Test-Path $toolPath) {
                $script:SqliteToolPath = $toolPath
                Write-Log "[WebFilter] sqlite3.exe downloaded OK ($((Get-Item $toolPath).Length / 1MB)MB)"
                return $toolPath
            }
        } catch {
            Write-Log "[WebFilter] Failed to download sqlite3.exe: $($_.Exception.Message)"
        }
    }

    return $null
}

# ============ LEITURA DE HISTORICO VIA SQLITE ============

function Read-ChromiumHistory {
    <#
    .SYNOPSIS
        Le o historico de navegacao de browsers Chromium (Chrome, Edge, Brave, Opera)
        via sqlite3.exe lendo o arquivo History de cada perfil.
    #>
    param(
        [string]$SqlitePath,
        [int]$Minutes = 10
    )

    $results = @()
    $cutoffDate = (Get-Date).AddMinutes(-$Minutes).ToUniversalTime()
    # Chromium armazena timestamps como microsegundos desde 01/01/1601 (WebKit/FILETIME)
    $cutoffChromium = [long]($cutoffDate.ToFileTimeUtc() / 10)

    # Paths dos browsers Chromium por perfil de usuario
    $userDirs = Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -notin @("Public", "Default", "Default User", "All Users")
    }

    $browserDefs = @(
        @{ Name = "chrome";  BasePath = "AppData\Local\Google\Chrome\User Data" }
        @{ Name = "msedge";  BasePath = "AppData\Local\Microsoft\Edge\User Data" }
        @{ Name = "brave";   BasePath = "AppData\Local\BraveSoftware\Brave-Browser\User Data" }
        @{ Name = "opera";   BasePath = "AppData\Roaming\Opera Software\Opera Stable" }
    )

    foreach ($userDir in $userDirs) {
        $username = $userDir.Name

        foreach ($bDef in $browserDefs) {
            $browserBase = Join-Path $userDir.FullName $bDef.BasePath
            if (-not (Test-Path $browserBase)) { continue }

            # Encontrar todos os perfis (Default, Profile 1, Profile 2, etc.)
            $profileDirs = @()
            if ($bDef.Name -eq "opera") {
                # Opera: historico fica direto na pasta raiz
                $profileDirs += $browserBase
            } else {
                $profileDirs += Get-ChildItem $browserBase -Directory -ErrorAction SilentlyContinue | Where-Object {
                    $_.Name -eq "Default" -or $_.Name -match "^Profile \d+"
                } | ForEach-Object { $_.FullName }
            }

            foreach ($profPath in $profileDirs) {
                $historyFile = Join-Path $profPath "History"
                if (-not (Test-Path $historyFile)) { continue }

                # Copiar para temp (browser trava o arquivo)
                $tempDb = "$env:TEMP\wrm_hist_$($bDef.Name)_$(Get-Random).sqlite"
                try {
                    [System.IO.File]::Copy($historyFile, $tempDb, $true)
                } catch {
                    continue
                }

                try {
                    # Query: pegar URLs visitadas nos ultimos N minutos
                    $query = "SELECT url, title, last_visit_time, visit_count FROM urls WHERE last_visit_time > $cutoffChromium ORDER BY last_visit_time DESC LIMIT 200;"
                    $output = & $SqlitePath $tempDb $query 2>$null

                    if ($output) {
                        foreach ($line in $output) {
                            if (-not $line -or $line.Trim().Length -eq 0) { continue }
                            $parts = $line -split '\|'
                            if ($parts.Count -lt 3) { continue }

                            $url = $parts[0]
                            $title = $parts[1]
                            $chromiumTime = [long]$parts[2]

                            # Ignorar URLs internas do browser
                            if ($url -match '^(chrome|edge|brave|opera|about|chrome-extension|devtools):') { continue }
                            if ($url -match '^(file://|data:)') { continue }

                            # Converter timestamp Chromium para DateTime
                            $visitedAt = try {
                                [DateTime]::FromFileTimeUtc($chromiumTime * 10).ToString("o")
                            } catch {
                                (Get-Date).ToUniversalTime().ToString("o")
                            }

                            # Extrair dominio
                            $domain = ""
                            try {
                                $uri = [System.Uri]::new($url)
                                $domain = $uri.Host
                            } catch {}

                            $results += @{
                                url            = $url
                                domain         = $domain
                                title          = $title
                                timestamp      = $visitedAt
                                browser        = $bDef.Name
                                durationSeconds = 0
                                username       = $username
                            }
                        }
                    }
                } catch {
                    Write-Log "[WebFilter] Error reading $($bDef.Name) history for $username : $($_.Exception.Message)"
                } finally {
                    Remove-Item $tempDb -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }

    return $results
}

function Read-FirefoxHistory {
    <#
    .SYNOPSIS
        Le o historico de navegacao do Firefox via sqlite3.exe
        lendo o arquivo places.sqlite de cada perfil.
    #>
    param(
        [string]$SqlitePath,
        [int]$Minutes = 10
    )

    $results = @()
    $cutoffDate = (Get-Date).AddMinutes(-$Minutes).ToUniversalTime()
    # Firefox armazena timestamps como microsegundos desde Unix epoch (01/01/1970)
    $epoch = [datetime]"1970-01-01T00:00:00Z"
    $cutoffFirefox = [long](($cutoffDate - $epoch).TotalSeconds * 1000000)

    $userDirs = Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -notin @("Public", "Default", "Default User", "All Users")
    }

    foreach ($userDir in $userDirs) {
        $username = $userDir.Name
        $ffProfilePath = Join-Path $userDir.FullName "AppData\Roaming\Mozilla\Firefox\Profiles"
        if (-not (Test-Path $ffProfilePath)) { continue }

        $ffProfiles = Get-ChildItem $ffProfilePath -Directory -ErrorAction SilentlyContinue
        foreach ($ffProf in $ffProfiles) {
            $placesFile = Join-Path $ffProf.FullName "places.sqlite"
            if (-not (Test-Path $placesFile)) { continue }

            $tempDb = "$env:TEMP\wrm_ff_hist_$(Get-Random).sqlite"
            try {
                [System.IO.File]::Copy($placesFile, $tempDb, $true)
            } catch {
                continue
            }

            try {
                $query = "SELECT p.url, p.title, p.last_visit_date, p.visit_count FROM moz_places p WHERE p.last_visit_date > $cutoffFirefox AND p.url NOT LIKE 'about:%' AND p.url NOT LIKE 'moz-%' AND p.url NOT LIKE 'file:%' ORDER BY p.last_visit_date DESC LIMIT 200;"
                $output = & $SqlitePath $tempDb $query 2>$null

                if ($output) {
                    foreach ($line in $output) {
                        if (-not $line -or $line.Trim().Length -eq 0) { continue }
                        $parts = $line -split '\|'
                        if ($parts.Count -lt 3) { continue }

                        $url = $parts[0]
                        $title = $parts[1]
                        $ffTime = [long]$parts[2]

                        # Converter timestamp Firefox para DateTime
                        $visitedAt = try {
                            $epoch.AddSeconds($ffTime / 1000000).ToString("o")
                        } catch {
                            (Get-Date).ToUniversalTime().ToString("o")
                        }

                        $domain = ""
                        try {
                            $uri = [System.Uri]::new($url)
                            $domain = $uri.Host
                        } catch {}

                        $results += @{
                            url            = $url
                            domain         = $domain
                            title          = $title
                            timestamp      = $visitedAt
                            browser        = "firefox"
                            durationSeconds = 0
                            username       = $username
                        }
                    }
                }
            } catch {
                Write-Log "[WebFilter] Error reading Firefox history for $username : $($_.Exception.Message)"
            } finally {
                Remove-Item $tempDb -Force -ErrorAction SilentlyContinue
            }
        }
    }

    return $results
}

# ============ FALLBACK: UI AUTOMATION + WINDOW TITLES ============

function Get-BrowserWindowTitles {
    <#
    .SYNOPSIS
        Fallback: captura titulos das janelas de browsers abertos.
        Menos preciso que leitura do DB, mas funciona sem sqlite3.
    #>
    param()

    $urls = @()
    $now = Get-Date
    $user = $env:USERNAME

    $browserProcesses = @("chrome", "msedge", "firefox", "brave", "opera", "iexplore")
    foreach ($browserName in $browserProcesses) {
        $procs = Get-Process -Name $browserName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" }
        foreach ($p in $procs) {
            $windowTitle = $p.MainWindowTitle
            if ($windowTitle -and $windowTitle.Length -gt 2) {
                $pageTitle = $windowTitle -replace '\s*[-\x{2013}\x{2014}]\s*(Google Chrome|Microsoft Edge|Mozilla Firefox|Brave|Opera|Internet Explorer)$', ''

                $domain = ""
                if ($pageTitle -match '([\w\-]+\.\w{2,})') {
                    $domain = $Matches[1]
                }

                $urls += @{
                    url            = if ($domain) { "https://$domain" } else { "" }
                    domain         = $domain
                    title          = $pageTitle.Trim()
                    timestamp      = $now.ToUniversalTime().ToString("o")
                    browser        = $browserName
                    durationSeconds = 0
                    username       = $user
                }
            }
        }
    }

    # Tentar UI Automation para obter URL real da aba ativa (Chrome/Edge)
    try {
        Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
        foreach ($browserName in @("chrome", "msedge")) {
            $procs = Get-Process -Name $browserName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
            foreach ($p in $procs) {
                try {
                    $element = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
                    $editCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
                    $editElement = $element.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCondition)
                    if ($editElement) {
                        $valuePattern = $editElement.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        $currentUrl = $valuePattern.Current.Value
                        if ($currentUrl -and $currentUrl -match '[\w\-]+\.\w{2,}') {
                            if ($currentUrl -notmatch '^https?://') { $currentUrl = "https://$currentUrl" }
                            $domain = ""
                            try { $domain = ([System.Uri]::new($currentUrl)).Host } catch {}

                            # Atualizar entry existente ou adicionar nova
                            $updated = $false
                            for ($i = 0; $i -lt $urls.Count; $i++) {
                                if ($urls[$i].browser -eq $browserName -and (-not $urls[$i].url -or $urls[$i].url -eq "" -or $urls[$i].url -eq "https://$($urls[$i].domain)")) {
                                    $urls[$i].url = $currentUrl
                                    $urls[$i].domain = $domain
                                    $updated = $true
                                    break
                                }
                            }
                            if (-not $updated) {
                                $urls += @{
                                    url            = $currentUrl
                                    domain         = $domain
                                    title          = $p.MainWindowTitle -replace '\s*[-\x{2013}\x{2014}]\s*(Google Chrome|Microsoft Edge)$', ''
                                    timestamp      = $now.ToUniversalTime().ToString("o")
                                    browser        = $browserName
                                    durationSeconds = 0
                                    username       = $user
                                }
                            }
                        }
                    }
                } catch {}
            }
        }
    } catch {
        # UIAutomation nao disponivel — manter apenas titulos
    }

    return $urls
}

# ============ FUNCAO PRINCIPAL DE COLETA ============

function Get-BrowserHistory {
    <#
    .SYNOPSIS
        Coleta historico de navegacao REAL dos browsers instalados.
        Prioridade: SQLite DB > UI Automation > Window titles.
        NAO usa dns-cache.
    #>
    param(
        [int]$Minutes = 10,
        [string]$ApiUrl = ""
    )

    $allUrls = @()
    $sqlitePath = Ensure-SqliteTool -ApiUrl $ApiUrl

    if ($sqlitePath) {
        # ===== METODO PRIMARIO: Leitura direta do banco SQLite do browser =====
        Write-Log "[WebFilter] Reading browser history databases via sqlite3..."

        $chromiumUrls = Read-ChromiumHistory -SqlitePath $sqlitePath -Minutes $Minutes
        if ($chromiumUrls.Count -gt 0) {
            $allUrls += $chromiumUrls
            Write-Log "[WebFilter] Chromium history: $($chromiumUrls.Count) URLs"
        }

        $firefoxUrls = Read-FirefoxHistory -SqlitePath $sqlitePath -Minutes $Minutes
        if ($firefoxUrls.Count -gt 0) {
            $allUrls += $firefoxUrls
            Write-Log "[WebFilter] Firefox history: $($firefoxUrls.Count) URLs"
        }
    } else {
        Write-Log "[WebFilter] sqlite3.exe not available, using fallback methods"
    }

    # ===== METODO FALLBACK: Window titles + UI Automation =====
    # Sempre executa para capturar aba ativa em tempo real (complementa o DB)
    $windowUrls = Get-BrowserWindowTitles
    foreach ($wu in $windowUrls) {
        # Adicionar apenas se nao duplicado
        $isDuplicate = $allUrls | Where-Object {
            ($_.url -and $wu.url -and $_.url -eq $wu.url) -or
            ($_.title -and $wu.title -and $_.title -eq $wu.title -and $_.browser -eq $wu.browser)
        }
        if (-not $isDuplicate -and ($wu.url -or $wu.title)) {
            $allUrls += $wu
        }
    }

    # Deduplicar por URL (manter o mais recente)
    $seen = @{}
    $dedupUrls = @()
    foreach ($u in $allUrls) {
        $key = if ($u.url -and $u.url.Length -gt 5) { $u.url } else { "$($u.browser):$($u.title)" }
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            $dedupUrls += $u
        }
    }

    Write-Log "[WebFilter] Total unique URLs collected: $($dedupUrls.Count)"
    return $dedupUrls
}

# ============ URL FILTER CHECK ============

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

# ============ ENVIO PARA API ============

function Send-WebActivity {
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$Hostname
    )

    try {
        $user = (Get-WmiObject Win32_ComputerSystem).UserName
        if (-not $user) { $user = $env:USERNAME }
        $urls = Get-BrowserHistory -Minutes 10 -ApiUrl $ApiUrl

        if ($urls.Count -eq 0) { return }

        $activities = @()
        foreach ($u in $urls) {
            # Verificar filtro de URL
            $isBlocked = $false
            if ($u.url -and $u.url.Length -gt 5) {
                try {
                    $check = Test-UrlAllowed -ApiUrl $ApiUrl -Token $Token -MachineId $Hostname -Url $u.url
                    if ($check.action -eq "blocked") { $isBlocked = $true }
                } catch {}
            }

            $activities += @{
                url              = if ($u.url) { $u.url } else { "https://$($u.domain)" }
                domain           = $u.domain
                page_title       = $u.title
                browser          = $u.browser
                duration_seconds = $u.durationSeconds
                visited_at       = $u.timestamp
                username         = if ($u.username) { $u.username } else { $user }
                is_blocked       = $isBlocked
            }
        }

        $body = @{
            token      = $Token
            hostname   = $Hostname
            activities = $activities
        } | ConvertTo-Json -Depth 5

        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/governance/web-activity" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 15
        Write-Log "[WebFilter] Sent $($activities.Count) REAL web activities (browsers: $(($activities | ForEach-Object { $_.browser } | Sort-Object -Unique) -join ', '))"
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
        if (-not $user) { $user = $env:USERNAME }
        $urls = Get-BrowserHistory -Minutes 10 -ApiUrl $ApiUrl

        if ($urls.Count -eq 0) { return }

        $logs = @()
        foreach ($u in $urls) {
            $urlToCheck = if ($u.url -and $u.url.Length -gt 5) { $u.url } else { "https://$($u.domain)" }
            $check = @{ action = "allowed"; reason = ""; matched_rule = "" }
            try {
                $check = Test-UrlAllowed -ApiUrl $ApiUrl -Token $Token -MachineId $Hostname -Url $urlToCheck
            } catch {}

            $logs += @{
                url          = $urlToCheck
                domain       = $u.domain
                action       = if ($check.action -eq "blocked") { "blocked" } else { "allowed" }
                reason       = if ($check.reason) { $check.reason } else { $null }
                matched_rule = if ($check.matched_rule) { $check.matched_rule } else { $null }
                username     = if ($u.username) { $u.username } else { $user }
                event_at     = $u.timestamp
            }
        }

        $body = @{
            token = $Token
            hostname = $Hostname
            logs  = $logs
        } | ConvertTo-Json -Depth 5

        Invoke-RestMethod -Uri "$ApiUrl/api/rmm/webfilter/logs" -Method POST -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 15

        $blockedCount = ($logs | Where-Object { $_.action -eq "blocked" }).Count
        Write-Log "[WebFilter] Sent $($logs.Count) filter logs ($blockedCount blocked)"
    } catch {
        Write-Log "[WebFilter] Error sending logs: $($_.Exception.Message)"
    }
}

# ============ ENFORCEMENT VIA HOSTS FILE ============

function Enforce-WebFilterPolicies {
    <#
    .SYNOPSIS
        Aplica bloqueio REAL de dominios no Windows hosts file.
        Busca politicas do servidor e adiciona/remove entradas no hosts.
        Requer execucao como SYSTEM/Admin.
    .PARAMETER ApiUrl
        URL base da API (ex: https://www.wticorp.com.br)
    .PARAMETER Token
        Token RMM da empresa
    .PARAMETER MachineId
        ID da maquina no sistema
    #>
    param(
        [string]$ApiUrl,
        [string]$Token,
        [string]$MachineId
    )

    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    $markerStart = "# === WINNER-WEBFILTER-START ==="
    $markerEnd   = "# === WINNER-WEBFILTER-END ==="

    try {
        # 1. Buscar politicas aplicaveis para esta maquina
        $policiesUrl = "$ApiUrl/api/rmm/governance/policies/for-machine/$($MachineId)?token=$Token"
        $response = Invoke-RestMethod -Uri $policiesUrl -Method GET -TimeoutSec 10 -ErrorAction Stop

        $webFilter = $response.webFilter
        if (-not $webFilter -or -not $webFilter.policies) {
            Write-Log "[WebFilter-Enforce] No web filter policies found for machine $MachineId"
            # Limpar bloqueios existentes se nao ha mais politicas
            Remove-WebFilterHostsEntries -HostsPath $hostsPath -MarkerStart $markerStart -MarkerEnd $markerEnd
            return
        }

        # 2. Coletar todos os dominios que devem ser bloqueados
        $blockedDomains = @{}
        $categories = @{}
        if ($webFilter.categories) {
            foreach ($cat in $webFilter.categories) {
                $categories[$cat.id] = $cat
            }
        }

        foreach ($policy in $webFilter.policies) {
            if ($policy.logOnly) { continue }  # Politica de log nao bloqueia

            # Dominios bloqueados diretamente
            if ($policy.blockedDomains) {
                foreach ($d in $policy.blockedDomains) {
                    $d = $d.Trim().ToLower()
                    if ($d.Length -gt 0) {
                        $blockedDomains[$d] = $policy.name
                        # Adicionar com e sem www
                        if (-not $d.StartsWith("www.")) {
                            $blockedDomains["www.$d"] = $policy.name
                        }
                    }
                }
            }

            # Dominios das categorias bloqueadas
            if ($policy.blockedCategories -and $policy.blockedCategories.Count -gt 0) {
                foreach ($catId in $policy.blockedCategories) {
                    if ($categories.ContainsKey($catId)) {
                        $cat = $categories[$catId]
                        if ($cat.domains) {
                            foreach ($domObj in $cat.domains) {
                                $domain = $domObj.domain.Trim().ToLower()
                                if ($domain.Length -gt 0 -and -not $domObj.isRegex) {
                                    $blockedDomains[$domain] = "$($policy.name) [$($cat.name)]"
                                    if (-not $domain.StartsWith("www.")) {
                                        $blockedDomains["www.$domain"] = "$($policy.name) [$($cat.name)]"
                                    }
                                }
                            }
                        }
                    }
                }
            }

            # Remover dominios da whitelist (allowedDomains)
            if ($policy.allowedDomains) {
                foreach ($d in $policy.allowedDomains) {
                    $d = $d.Trim().ToLower()
                    $blockedDomains.Remove($d)
                    $blockedDomains.Remove("www.$d")
                }
            }
        }

        # 3. Reconstruir secao no hosts file
        $currentHosts = @()
        if (Test-Path $hostsPath) {
            $currentHosts = Get-Content $hostsPath -Encoding UTF8 -ErrorAction SilentlyContinue
        }

        # Remover secao antiga
        $newLines = @()
        $inBlock = $false
        foreach ($line in $currentHosts) {
            if ($line.Trim() -eq $markerStart) { $inBlock = $true; continue }
            if ($line.Trim() -eq $markerEnd) { $inBlock = $false; continue }
            if (-not $inBlock) { $newLines += $line }
        }

        # Adicionar nova secao se houver dominios para bloquear
        if ($blockedDomains.Count -gt 0) {
            $newLines += ""
            $newLines += $markerStart
            $newLines += "# Gerenciado pelo Winner RMM - NAO EDITAR MANUALMENTE"
            $newLines += "# Atualizado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
            $newLines += "# Dominios bloqueados: $($blockedDomains.Count)"

            foreach ($entry in ($blockedDomains.GetEnumerator() | Sort-Object Key)) {
                $newLines += "0.0.0.0 $($entry.Key)  # $($entry.Value)"
            }

            $newLines += $markerEnd
        }

        # 4. Escrever hosts file
        $newContent = $newLines -join "`r`n"
        [System.IO.File]::WriteAllText($hostsPath, $newContent, [System.Text.Encoding]::UTF8)

        # 5. Flush DNS cache para aplicar imediatamente
        try {
            & ipconfig /flushdns 2>$null | Out-Null
        } catch {}

        $addedCount = $blockedDomains.Count
        Write-Log "[WebFilter-Enforce] Hosts file updated: $addedCount domains blocked"

    } catch {
        Write-Log "[WebFilter-Enforce] Error: $($_.Exception.Message)"
    }
}

function Remove-WebFilterHostsEntries {
    <#
    .SYNOPSIS
        Remove todas as entradas do Winner WebFilter do hosts file.
    #>
    param(
        [string]$HostsPath,
        [string]$MarkerStart,
        [string]$MarkerEnd
    )

    if (-not (Test-Path $HostsPath)) { return }

    $lines = Get-Content $HostsPath -Encoding UTF8 -ErrorAction SilentlyContinue
    $newLines = @()
    $inBlock = $false
    $changed = $false

    foreach ($line in $lines) {
        if ($line.Trim() -eq $MarkerStart) { $inBlock = $true; $changed = $true; continue }
        if ($line.Trim() -eq $MarkerEnd) { $inBlock = $false; continue }
        if (-not $inBlock) { $newLines += $line }
    }

    if ($changed) {
        [System.IO.File]::WriteAllText($HostsPath, ($newLines -join "`r`n"), [System.Text.Encoding]::UTF8)
        Write-Log "[WebFilter-Enforce] Cleaned hosts file (removed Winner WebFilter entries)"
        try { & ipconfig /flushdns 2>$null | Out-Null } catch {}
    }
}

# ============ EXPORTAR ============
Export-ModuleMember -Function Get-BrowserHistory, Test-UrlAllowed, Send-WebActivity, Send-WebFilterLogs, Enforce-WebFilterPolicies
