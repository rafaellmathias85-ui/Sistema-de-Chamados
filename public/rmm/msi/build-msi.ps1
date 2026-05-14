# ============================================
# Script de Build do MSI - Winner RMM Agent
# Requisitos: WiX Toolset v3.x no PATH
# ============================================

param(
    [string]$Version = "2.0.0",
    [string]$OutputDir = ".\output",
    [string]$ApiUrl = "https://www.wticorp.com.br",
    [string]$CompanyToken = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== Winner RMM Agent - MSI Builder ==="
Write-Host "Versao: $Version"
Write-Host "API URL: $ApiUrl"
Write-Host ""

# Verificar WiX
$candle = Get-Command candle.exe -ErrorAction SilentlyContinue
$light = Get-Command light.exe -ErrorAction SilentlyContinue

if (-not $candle -or -not $light) {
    Write-Host "ERRO: WiX Toolset nao encontrado no PATH" -ForegroundColor Red
    Write-Host "Download: https://wixtoolset.org/releases/" -ForegroundColor Yellow
    exit 1
}

# Criar diretorio de output
New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null

# Verificar arquivos necessarios
$requiredFiles = @(
    "WinnerRMM-AgentV2.ps1",
    "WinnerRMM-Service.exe",
    "config.json",
    "license.rtf",
    "modules\WinnerRMM-Governance.psm1",
    "modules\WinnerRMM-WebFilter.psm1",
    "modules\WinnerRMM-Relay.psm1",
    "modules\WinnerRMM-Update.psm1",
    "modules\WinnerRMM-PolicyEngine.psm1"
)

$missing = @()
foreach ($f in $requiredFiles) {
    if (-not (Test-Path $f)) { $missing += $f }
}

if ($missing.Count -gt 0) {
    Write-Host "AVISO: Arquivos faltando (serao criados como placeholder):" -ForegroundColor Yellow
    foreach ($f in $missing) {
        Write-Host "  - $f" -ForegroundColor Yellow
        $dir = Split-Path $f -Parent
        if ($dir) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
        
        if ($f -eq "config.json") {
            @{apiUrl=$ApiUrl;companyToken=$CompanyToken;updateChannel="stable";agentType="msi";version=$Version} | ConvertTo-Json | Set-Content $f
        } elseif ($f -eq "license.rtf") {
            Set-Content $f "{\rtf1 Winner Tecnologia - Licenca de Uso do Agente RMM.\par Uso restrito a clientes com contrato ativo.}"
        } elseif ($f -eq "WinnerRMM-Service.exe") {
            Write-Host "  NOTA: WinnerRMM-Service.exe precisa ser compilado separadamente (C#/.NET)" -ForegroundColor Cyan
            # Criar placeholder (sera substituido pelo exe real)
            Set-Content $f "placeholder"
        } else {
            Set-Content $f "# placeholder"
        }
    }
}

# Atualizar versao no WXS
$wxsContent = Get-Content "Product.wxs" -Raw
$wxsContent = $wxsContent -replace 'Version="2\.0\.0\.0"', "Version=`"$Version.0`""
$wxsContent = $wxsContent -replace 'Value="2\.0\.0"', "Value=`"$Version`""
Set-Content "Product.wxs.tmp" $wxsContent

Write-Host ""
Write-Host "[1/3] Compilando WXS..." -ForegroundColor Cyan
candle.exe -nologo Product.wxs.tmp -o "$OutputDir\Product.wixobj"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Compilacao falhou" -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] Linkando MSI..." -ForegroundColor Cyan
light.exe -nologo -ext WixUtilExtension -ext WixUIExtension "$OutputDir\Product.wixobj" -o "$OutputDir\WinnerRMM-Agent-$Version.msi"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Linkagem falhou" -ForegroundColor Red
    exit 1
}

# Limpar temporarios
Remove-Item "Product.wxs.tmp" -Force -ErrorAction SilentlyContinue
Remove-Item "$OutputDir\Product.wixobj" -Force -ErrorAction SilentlyContinue
Remove-Item "$OutputDir\WinnerRMM-Agent-$Version.wixpdb" -Force -ErrorAction SilentlyContinue

# Gerar hash
$msiPath = "$OutputDir\WinnerRMM-Agent-$Version.msi"
$hash = (Get-FileHash -Path $msiPath -Algorithm SHA256).Hash.ToLower()
$size = (Get-Item $msiPath).Length

Write-Host ""
Write-Host "[3/3] MSI gerado com sucesso!" -ForegroundColor Green
Write-Host "  Arquivo: $msiPath"
Write-Host "  Tamanho: $([math]::Round($size / 1MB, 2)) MB"
Write-Host "  SHA256:  $hash"
Write-Host ""
Write-Host "Instalacao silenciosa:" -ForegroundColor Cyan
Write-Host "  msiexec /i WinnerRMM-Agent-$Version.msi /qn API_URL=$ApiUrl COMPANY_TOKEN=<token>"
Write-Host ""
Write-Host "Para publicar esta versao no painel, use:" -ForegroundColor Cyan
Write-Host "  Versao: $Version"
Write-Host "  Hash SHA256: $hash"
Write-Host "  Tamanho: $size bytes"
