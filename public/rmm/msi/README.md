# Winner RMM Agent - MSI Build

## Pre-requisitos

1. **WiX Toolset v3.x** - [Download](https://wixtoolset.org/releases/)
2. **Visual Studio Build Tools** ou SDK do .NET para compilar o Service Wrapper
3. **PowerShell 5.1+**

## Estrutura do Projeto

```
msi/
  Product.wxs           # Manifest WiX (definicao do installer)
  build-msi.ps1         # Script automatizado de build
  README.md             # Esta documentacao

modules/
  WinnerRMM-Governance.psm1   # Coleta de atividade, USB, drivers
  WinnerRMM-WebFilter.psm1    # Filtro web e monitoramento de navegacao
  WinnerRMM-Relay.psm1        # Descoberta de maquinas na rede
  WinnerRMM-Update.psm1       # Auto-atualizacao do agente
  WinnerRMM-PolicyEngine.psm1 # Motor de politicas (USB, produtividade)

WinnerRMM-AgentV2.ps1         # Orquestrador principal
```

## Build Rapido

```powershell
cd msi
.\build-msi.ps1 -Version "2.0.1" -ApiUrl "https://www.wticorp.com.br"
```

## Instalacao Silenciosa

```powershell
# Instalacao com token da empresa
msiexec /i WinnerRMM-Agent-2.0.0.msi /qn API_URL=https://www.wticorp.com.br COMPANY_TOKEN=abc123

# Desinstalacao silenciosa
msiexec /x WinnerRMM-Agent-2.0.0.msi /qn
```

## O que o MSI instala

1. **Servico Windows** `WinnerRMM` (auto-start, SYSTEM)
2. **Agente PS1** em `C:\ProgramData\WinnerRMM\`
3. **Modulos** em `C:\ProgramData\WinnerRMM\modules\`
4. **Registro** em `HKLM\SOFTWARE\WinnerRMM`
5. **Recovery**: Reinicia automaticamente apos falha (3 tentativas, 60s delay)

## Service Wrapper (.NET)

O `WinnerRMM-Service.exe` e um wrapper que:
- Registra como servico Windows
- Executa o `WinnerRMM-AgentV2.ps1` como processo filho
- Gerencia lifecycle (start/stop/restart)
- Redireciona logs

Precisa ser compilado com o projeto C# separado.

## Atualizacao via Painel

1. Gere o MSI com nova versao
2. No painel Governance > Versoes do Agente > Publicar Versao
3. Informe: versao, hash SHA256, URL de download, tamanho
4. Marque como "Critica" para forcor atualizacao imediata
5. Os agentes verificarao e atualizarao automaticamente
