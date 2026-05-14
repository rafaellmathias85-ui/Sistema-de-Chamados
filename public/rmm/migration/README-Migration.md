# Plano de Migracao PS1 -> MSI

## Winner Tecnologia - RMM Agent v2.0

---

## Visao Geral

A migracao do agente PS1 (script PowerShell executando como Tarefa Agendada) para o MSI (servico Windows nativo) melhora:

1. **Confiabilidade** - Servico com auto-recovery vs Tarefa Agendada
2. **Seguranca** - MSI assinado digitalmente, tamper-proof
3. **Atualizacao** - Auto-update via WinnerRMM-Update.psm1
4. **Visibilidade** - Servico aparece no services.msc
5. **Performance** - Sem custo de iniciar PowerShell a cada ciclo

## Fases da Migracao

### Fase 1: Piloto (1-2 semanas)
- Selecionar 5-10 maquinas de teste
- Instalar MSI manualmente
- Validar coleta de dados, governance, web filter
- Validar que machine_id e preservado (sem duplicatas no painel)

### Fase 2: Rollout Gradual (2-4 semanas)
- Publicar versao MSI no painel (Governance > Versoes do Agente)
- Criar tarefa remota para executar Migrate-PS1toMSI.ps1
- Migrar 10% das maquinas por dia
- Monitorar dashboard RMM para problemas

### Fase 3: Migracao em Massa (1 semana)
- Executar via Playbook do RMM para todas as maquinas restantes
- Usar -Force para maquinas que falharam na Fase 2

### Fase 4: Limpeza (1 semana)
- Verificar que todas as maquinas migraram
- Remover scripts PS1 antigos dos backups
- Desabilitar download do agente PS1

## Comandos

### Instalacao Individual (via Playbook/Script Remoto)
```powershell
# Executar no endpoint via RMM
Invoke-Expression (Invoke-WebRequest -Uri "https://www.wticorp.com.br/rmm/migration/Migrate-PS1toMSI.ps1" -UseBasicParsing).Content
```

### Instalacao em Massa (via Playbook)
```powershell
# Parametros preenchidos pelo servidor
.\Migrate-PS1toMSI.ps1 `
    -MsiUrl "https://www.wticorp.com.br/rmm/releases/WinnerRMM-Agent-2.0.0.msi" `
    -ApiUrl "https://www.wticorp.com.br" `
    -CompanyToken "TOKEN_DA_EMPRESA" `
    -ExpectedHash "abc123..." `
    -KeepBackup
```

### Rollback (se necessario)
```powershell
# Parar servico MSI
Stop-Service WinnerRMM -Force
msiexec /x WinnerRMM-Agent.msi /qn

# Restaurar PS1
Copy-Item 'C:\ProgramData\WinnerRMM\backup_ps1\*' 'C:\ProgramData\WinnerRMM\' -Force
Enable-ScheduledTask -TaskName 'WinnerRMM'
```

## Riscos e Mitigacao

| Risco | Probabilidade | Mitigacao |
|-------|---------------|----------|
| Machine ID perdido | Baixa | Script preserva arquivo machine_id |
| Servico nao inicia | Media | Recovery automatico (3 tentativas, 60s) |
| Hash nao confere | Baixa | Verificacao SHA256 obrigatoria |
| Sem internet | Media | Fail-safe: PS1 backup disponivel |
| Permissao negada | Baixa | Script verifica admin antes de iniciar |

## Checklist Pre-Migracao

- [ ] SQL de migracao Phase 1 executado no VPS
- [ ] 4 colunas do RmmMachine re-adicionadas ao schema
- [ ] MSI compilado com WiX e testado em VM
- [ ] WinnerRMM-Service.exe compilado e assinado
- [ ] Versao MSI publicada no painel
- [ ] Piloto executado com sucesso em 5+ maquinas
- [ ] Playbook de migracao criado no painel
