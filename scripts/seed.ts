import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ====== MULTI-TENANT: Criar tenant padrão ======
  let defaultTenant = await prisma.tenant.findFirst({ where: { domain: 'winner' } });
  if (!defaultTenant) {
    defaultTenant = await prisma.tenant.create({
      data: {
        name: 'Winner Tecnologia',
        domain: 'winner',
        planType: 'ENTERPRISE',
        isActive: true,
      },
    });
    console.log('Default tenant created:', defaultTenant.id);
  }

  // Backfill: vincular registros existentes sem tenant ao tenant padrão
  const tid = defaultTenant.id;
  await prisma.user.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.company.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.ticket.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.category.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.sLAConfig.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.rmmMachine.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.rmmAlertPolicy.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.rmmScript.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.rmmPlaybook.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.kBCategory.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.kBArticle.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.appointment.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  await prisma.snmpDevice.updateMany({ where: { tenantId: null }, data: { tenantId: tid } });
  console.log('Backfill completed for tenant:', tid);

  // Criar empresa Winner Tecnologia
  const winnerCompany = await prisma.company.upsert({
    where: { cnpj: '00000000000000' },
    update: {},
    create: {
      name: 'Winner Tecnologia',
      cnpj: '00000000000000',
      email: 'contato@winner.com.br',
      phone: '(11) 99999-9999',
    },
  });

  // Criar usuário admin
  const adminPassword = await bcrypt.hash('Winner@2024', 10);
  await prisma.user.upsert({
    where: { email: 'admin@winner.com.br' },
    update: {},
    create: {
      email: 'admin@winner.com.br',
      password: adminPassword,
      name: 'Administrador',
      role: 'ADMIN',
      companyId: winnerCompany.id,
    },
  });

  // Criar usuário de teste
  const testPassword = await bcrypt.hash('johndoe123', 10);
  await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      password: testPassword,
      name: 'John Doe',
      role: 'ADMIN',
      companyId: winnerCompany.id,
    },
  });

  // Criar usuário suporte
  const supportPassword = await bcrypt.hash('Suporte@2024', 10);
  await prisma.user.upsert({
    where: { email: 'suporte@winner.com.br' },
    update: {},
    create: {
      email: 'suporte@winner.com.br',
      password: supportPassword,
      name: 'Suporte Técnico',
      role: 'SUPPORT',
      companyId: winnerCompany.id,
    },
  });

  // Criar empresa cliente de exemplo
  const clientCompany = await prisma.company.upsert({
    where: { cnpj: '11111111111111' },
    update: {},
    create: {
      name: 'Empresa Cliente Demo',
      cnpj: '11111111111111',
      email: 'contato@cliente.com.br',
      phone: '(11) 88888-8888',
    },
  });

  // Criar usuário cliente
  const clientPassword = await bcrypt.hash('Cliente@2024', 10);
  await prisma.user.upsert({
    where: { email: 'cliente@cliente.com.br' },
    update: {},
    create: {
      email: 'cliente@cliente.com.br',
      password: clientPassword,
      name: 'Cliente Demo',
      role: 'CLIENT',
      companyId: clientCompany.id,
    },
  });

  // Criar categorias de chamados
  const categories = [
    { name: 'Infraestrutura', description: 'Servidores, redes, hardware', color: '#3B82F6' },
    { name: 'Software', description: 'Instalação, configuração, atualizações', color: '#10B981' },
    { name: 'Rede', description: 'Conectividade, firewall, VPN', color: '#8B5CF6' },
    { name: 'Segurança', description: 'Antivírus, backup, compliance', color: '#EF4444' },
    { name: 'Microsoft 365', description: 'Email, Teams, SharePoint', color: '#F59E0B' },
    { name: 'Cloud', description: 'Azure, AWS, serviços em nuvem', color: '#06B6D4' },
    { name: 'Outros', description: 'Demais solicitações', color: '#6B7280' },
  ];

  for (const cat of categories) {
    const existing = await prisma.category.findFirst({
      where: { name: cat.name, parentId: null },
    });
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { description: cat.description, color: cat.color },
      });
    } else {
      await prisma.category.create({
        data: { ...cat, parentId: null },
      });
    }
  }

  // Configurar SLA por prioridade
  const slaConfigs = [
    { priority: 'LOW' as const, responseTimeHrs: 24, resolutionHrs: 72 },
    { priority: 'MEDIUM' as const, responseTimeHrs: 8, resolutionHrs: 48 },
    { priority: 'HIGH' as const, responseTimeHrs: 4, resolutionHrs: 24 },
    { priority: 'CRITICAL' as const, responseTimeHrs: 1, resolutionHrs: 8 },
  ];

  for (const sla of slaConfigs) {
    await prisma.sLAConfig.upsert({
      where: { priority: sla.priority },
      update: { responseTimeHrs: sla.responseTimeHrs, resolutionHrs: sla.resolutionHrs },
      create: sla,
    });
  }

  // === RMM Scripts (global, pré-aprovados) ===
  const teamviewerScript = `<#
.SYNOPSIS
    Instalação Silenciosa TeamViewer HOST para RMM Winner Tecnologia
    URL: https://www.898.tv/wticorp
#>

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Url     = "https://www.898.tv/wticorp"
$OutFile = "$env:TEMP\\TeamViewer_Host_Setup.exe"

try {
    Write-Host "Baixando TeamViewer Host..."

    Invoke-WebRequest -Uri $Url \`
                      -OutFile $OutFile \`
                      -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \`
                      -MaximumRedirection 5 \`
                      -ErrorAction Stop

    $sizeMB = [math]::Round((Get-Item $OutFile).Length / 1MB, 2)
    Write-Host "Download concluído: $sizeMB MB"

    if ($sizeMB -lt 1) {
        Write-Host "Arquivo muito pequeno. Possível falha no download."
        exit 1
    }

    Write-Host "Iniciando instalação silenciosa..."

    $process = Start-Process -FilePath $OutFile \`
                             -ArgumentList "--silent", "--norestart" \`
                             -Wait -PassThru -NoNewWindow

    switch ($process.ExitCode) {
        0    { Write-Host "SUCESSO: TeamViewer Host instalado." }
        3010 { Write-Host "SUCESSO: Instalado. Reinicialização pendente." }
        1602 { Write-Host "Instalação cancelada pelo usuário." }
        1603 { Write-Host "Erro fatal durante a instalação." }
        default { Write-Host "Código de saída: $($process.ExitCode)" }
    }

    Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
}
catch {
    Write-Host "FALHA: $($_.Exception.Message)"
    exit 1
}`;

  const existingTvScript = await prisma.rmmScript.findFirst({
    where: { name: 'Instalar TeamViewer Host' },
  });
  if (!existingTvScript) {
    await prisma.rmmScript.create({
      data: {
        name: 'Instalar TeamViewer Host',
        description: 'Baixa e instala o TeamViewer Host silenciosamente. O ID será coletado automaticamente pelo agente RMM no próximo check-in.',
        scriptType: 'powershell',
        content: teamviewerScript,
        approved: true,
        approvedBy: 'system',
        approvedByName: 'Sistema',
        approvedAt: new Date(),
        createdBy: 'system',
        createdByName: 'Sistema',
        companyId: null,
        tenantId: tid,
      },
    });
    console.log('TeamViewer install script created');
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
