import {
  Shield,
  Cloud,
  Mail,
  Server,
  Database,
  HardDrive,
  Bug,
  Activity,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface ServiceData {
  slug: string;
  title: string;
  shortTitle: string;
  tagline: string;
  description: string;
  metaDescription: string;
  icon: LucideIcon;
  features: string[];
  benefits: { title: string; description: string }[];
  faq: { question: string; answer: string }[];
  keywords: string[];
}

export const SERVICES: ServiceData[] = [
  {
    slug: 'cyber-security',
    shortTitle: 'Cyber Security',
    title: 'Cyber Security para Empresas',
    tagline: 'Proteção multicamada contra ameaças modernas',
    description:
      'Protegemos sua empresa contra ransomware, phishing, vazamentos de dados e ameaças zero-day com uma estratégia de defesa em profundidade alinhada à LGPD.',
    metaDescription:
      'Cyber Security empresarial: proteção contra ransomware, phishing e vazamentos. Defesa em profundidade, conformidade LGPD e monitoramento 24/7.',
    icon: Shield,
    features: [
      'Análise de superfície de ataque e gestão de vulnerabilidades',
      'EDR/XDR de última geração',
      'Hardening de servidores e endpoints',
      'Políticas de Zero Trust e MFA',
      'Resposta a incidentes (IR) e forense digital',
      'Treinamento de conscientização (security awareness)',
    ],
    benefits: [
      {
        title: 'Redução de risco',
        description: 'Camadas de defesa que diminuem drasticamente a probabilidade de um incidente bem-sucedido.',
      },
      {
        title: 'Conformidade LGPD',
        description: 'Controles técnicos e administrativos alinhados à lei e a frameworks como ISO 27001, NIST e CIS.',
      },
      {
        title: 'Continuidade do negócio',
        description: 'Planos de resposta e recuperação que minimizam o impacto operacional em caso de incidente.',
      },
    ],
    faq: [
      {
        question: 'Vou precisar trocar todos os meus equipamentos?',
        answer:
          'Não necessariamente. Avaliamos seu parque atual e indicamos otimizações e camadas adicionais antes de qualquer substituição.',
      },
      {
        question: 'Como funciona a resposta a incidentes?',
        answer:
          'Em caso de incidente, nossa equipe atua imediatamente para conter, erradicar e recuperar, registrando evidências para fins legais e auditoria.',
      },
    ],
    keywords: ['cyber security', 'segurança da informação', 'ransomware', 'edr', 'xdr', 'lgpd', 'zero trust'],
  },
  {
    slug: 'cloud-computing',
    shortTitle: 'Cloud Computing',
    title: 'Cloud Computing (Azure & AWS)',
    tagline: 'Cloud arquitetada para alta disponibilidade e custo otimizado',
    description:
      'Projetamos, migramos e operamos ambientes em Microsoft Azure e AWS com foco em resiliência, segurança, FinOps e governança multi-cloud.',
    metaDescription:
      'Serviços Cloud (Azure e AWS): migração, arquitetura, FinOps, alta disponibilidade e segurança por padrão. Soluções multi-cloud sob medida.',
    icon: Cloud,
    features: [
      'Assessment e roadmap de migração (6 Rs)',
      'Arquitetura Well-Architected (AWS / Azure)',
      'Landing Zone, IAM e segurança em cloud',
      'Infraestrutura como Código (Terraform / Bicep)',
      'Monitoramento, observabilidade e SLOs',
      'FinOps e otimização contínua de custos',
    ],
    benefits: [
      { title: 'Escalabilidade sob demanda', description: 'Pague pelo que usar e cresça sem reprovisionar hardware.' },
      { title: 'Alta disponibilidade', description: 'Arquiteturas multi-AZ com objetivos claros de RTO/RPO.' },
      { title: 'Segurança por padrão', description: 'Controles nativos de IAM, criptografia e segregação de redes.' },
    ],
    faq: [
      {
        question: 'Quanto tempo leva uma migração para a nuvem?',
        answer:
          'Depende da complexidade. Tipicamente 6 a 16 semanas, divididas em assessment, prova de conceito, migração em ondas e estabilização.',
      },
      {
        question: 'Como evitar surpresas no custo da cloud?',
        answer:
          'Aplicamos práticas de FinOps: tagueamento, orçamentos com alertas, rightsizing, reservas e Savings Plans, além de revisões mensais.',
      },
    ],
    keywords: ['cloud computing', 'azure', 'aws', 'migração cloud', 'finops', 'landing zone'],
  },
  {
    slug: 'microsoft-365',
    shortTitle: 'Microsoft 365',
    title: 'Microsoft 365 Gerenciado',
    tagline: 'Produtividade segura para times de qualquer tamanho',
    description:
      'Implementação, gestão e governança do Microsoft 365: Exchange Online, Teams, SharePoint, OneDrive, Intune e Defender com licenciamento otimizado.',
    metaDescription:
      'Microsoft 365 gerenciado: Exchange, Teams, SharePoint, Intune, Defender. Implementação, governança, segurança e suporte técnico.',
    icon: Mail,
    features: [
      'Tenant setup, domínio e DKIM/SPF/DMARC',
      'Migração de e-mail e arquivos',
      'Políticas de Conditional Access e MFA',
      'Microsoft Intune (gestão de dispositivos)',
      'Microsoft Defender for Office 365',
      'Otimização de licenciamento',
    ],
    benefits: [
      { title: 'Colaboração moderna', description: 'Times de qualquer lugar produzindo de forma integrada e segura.' },
      { title: 'Segurança integrada', description: 'Proteção nativa contra phishing, malware e perda de dados.' },
      { title: 'Custo previsível', description: 'Licenças certas para cada perfil, sem desperdício.' },
    ],
    faq: [
      {
        question: 'Conseguem migrar do Google Workspace ou IMAP?',
        answer: 'Sim. Realizamos migrações de Google Workspace, IMAP, Zimbra e outros ambientes legados com mínimo downtime.',
      },
    ],
    keywords: ['microsoft 365', 'office 365', 'exchange online', 'teams', 'intune', 'defender'],
  },
  {
    slug: 'azure',
    shortTitle: 'Microsoft Azure',
    title: 'Microsoft Azure',
    tagline: 'Arquitetura, operação e governança em Azure',
    description:
      'Especialistas em Azure: arquitetura, IaC com Bicep/Terraform, segurança, monitoramento e FinOps. Implementamos Landing Zones e cargas de trabalho críticas.',
    metaDescription:
      'Microsoft Azure: arquitetura, migração, Landing Zone, FinOps, segurança e operação gerenciada por especialistas.',
    icon: Cloud,
    features: [
      'Azure Landing Zone',
      'Azure Virtual Desktop e Windows 365',
      'Azure Backup e Site Recovery',
      'Sentinel (SIEM) e Defender for Cloud',
      'Azure Monitor / Log Analytics',
      'Bicep, ARM e Terraform',
    ],
    benefits: [
      { title: 'Integração nativa', description: 'Forte sinergia com Active Directory, M365 e ferramentas Microsoft.' },
      { title: 'Compliance', description: 'Frameworks prontos para LGPD, ISO 27001, PCI-DSS e SOC 2.' },
      { title: 'Resiliência', description: 'Disponibilidade multi-zona/região e DR estruturado.' },
    ],
    faq: [],
    keywords: ['azure', 'azure landing zone', 'azure virtual desktop', 'sentinel', 'bicep'],
  },
  {
    slug: 'aws',
    shortTitle: 'AWS',
    title: 'Amazon Web Services (AWS)',
    tagline: 'Cargas críticas em AWS, do design à operação',
    description:
      'Implementamos e operamos workloads em AWS seguindo o Well-Architected Framework, com foco em segurança, custo e excelência operacional.',
    metaDescription:
      'AWS gerenciado: arquitetura Well-Architected, EKS, RDS, Backup, GuardDuty, FinOps e operação 24/7.',
    icon: Cloud,
    features: [
      'AWS Well-Architected Review',
      'Control Tower e AWS Organizations',
      'EKS, ECS, Lambda',
      'RDS, Aurora, DynamoDB',
      'GuardDuty, Security Hub, WAF',
      'CloudWatch, X-Ray, Backup',
    ],
    benefits: [
      { title: 'Maturidade do mercado', description: 'Maior portfólio de serviços, com soluções para qualquer cenário.' },
      { title: 'Pay-as-you-go', description: 'Estrutura elástica que acompanha sazonalidade e crescimento.' },
      { title: 'Segurança robusta', description: 'IAM, criptografia gerenciada e auditoria ponta-a-ponta.' },
    ],
    faq: [],
    keywords: ['aws', 'amazon web services', 'eks', 'rds', 'guardduty', 'well-architected'],
  },
  {
    slug: 'backup-em-nuvem',
    shortTitle: 'Backup em Nuvem',
    title: 'Backup em Nuvem',
    tagline: 'Backup imutável, geo-redundante e à prova de ransomware',
    description:
      'Backup em nuvem com retencao customizável, cópias imutáveis e replicas geo-redundantes para Microsoft 365, servidores físicos e virtuais.',
    metaDescription:
      'Backup em nuvem corporativo: imutável, geo-redundante e à prova de ransomware. Proteção de M365, servidores e workstations.',
    icon: HardDrive,
    features: [
      'Backup imutável (anti-ransomware)',
      'Microsoft 365 (Exchange, OneDrive, SharePoint, Teams)',
      'Servidores físicos e virtuais (Veeam)',
      'Replicação geo-redundante',
      'Testes periódicos de restore',
      'Retenção customizável (3-2-1-1-0)',
    ],
    benefits: [
      { title: 'Recuperação garantida', description: 'Restores testados garantem que você volta ao ar quando precisar.' },
      { title: 'Proteção anti-ransomware', description: 'Cópias imutáveis impedem que atacantes apaguem ou cifrem seus backups.' },
      { title: 'Compliance LGPD', description: 'Políticas alinhadas à LGPD, ISO 27001 e melhores práticas de DR.' },
    ],
    faq: [
      {
        question: 'Backup em nuvem substitui o backup local?',
        answer:
          'O ideal é a estratégia 3-2-1-1-0: 3 cópias, 2 mídias, 1 offsite, 1 imutável, 0 erros nos restores. Cobrimos a parte offsite e imutável.',
      },
    ],
    keywords: ['backup em nuvem', 'veeam', 'backup m365', 'imutável', 'ransomware', '3-2-1'],
  },
  {
    slug: 'antivirus-corporativo',
    shortTitle: 'Antivírus Corporativo',
    title: 'Antivírus Corporativo (BitDefender)',
    tagline: 'Endpoint protection com EDR para todo o parque',
    description:
      'Bitdefender GravityZone gerenciado: proteção avançada de endpoints com EDR, threat hunting e console centralizado.',
    metaDescription:
      'Antivírus corporativo Bitdefender GravityZone: endpoint protection, EDR e threat hunting gerenciado por especialistas.',
    icon: Bug,
    features: [
      'Bitdefender GravityZone Business Security',
      'EDR e XDR add-on',
      'Console centralizado',
      'Políticas por grupo de máquinas',
      'Patch management integrado',
      'Relatórios de compliance',
    ],
    benefits: [
      { title: 'Detecção avançada', description: 'Machine learning e análise comportamental contra ameaças desconhecidas.' },
      { title: 'Gestão centralizada', description: 'Visão única de todos os endpoints e ações em massa.' },
      { title: 'Performance', description: 'Baixo impacto na CPU e na experiência do usuário final.' },
    ],
    faq: [],
    keywords: ['antivírus corporativo', 'bitdefender', 'edr', 'gravityzone', 'endpoint protection'],
  },
  {
    slug: 'monitoramento-24-7',
    shortTitle: 'Monitoramento 24/7',
    title: 'Monitoramento 24/7',
    tagline: 'Olhos atentos sobre sua infraestrutura, 24x7x365',
    description:
      'NOC/SOC com monitoramento contínuo de servidores, redes, aplicações e endpoints. Detecção e resposta proativa a incidentes.',
    metaDescription:
      'Monitoramento 24/7 com NOC/SOC: detecção e resposta proativa em servidores, redes, aplicações e endpoints.',
    icon: Activity,
    features: [
      'Monitoramento de servidores e redes',
      'Monitoramento de aplicações e APIs',
      'Alertas em tempo real (24/7)',
      'Dashboards customizáveis',
      'SLA com métricas de tempo de resposta',
      'Integração com sistema de chamados',
    ],
    benefits: [
      { title: 'Atuação proativa', description: 'Identificamos e mitigamos problemas antes que afetem usuários e clientes.' },
      { title: 'Redução de downtime', description: 'Tempo médio de detecção e reparo (MTTD/MTTR) significativamente menor.' },
      { title: 'Visibilidade completa', description: 'Telemetria centralizada de toda a infraestrutura crítica.' },
    ],
    faq: [],
    keywords: ['monitoramento 24/7', 'noc', 'soc', 'siem', 'mttr', 'mttd'],
  },
  {
    slug: 'ti-gerenciada',
    shortTitle: 'TI Gerenciada',
    title: 'TI Gerenciada (MSP)',
    tagline: 'Seu departamento de TI completo, sob contrato',
    description:
      'Modelo MSP completo: helpdesk, service desk, gestão de fornecedores, projetos, governança e compliance. Atue como CIO terceirizado.',
    metaDescription:
      'TI gerenciada (MSP): helpdesk, service desk, governança, projetos e compliance. Departamento de TI completo sob contrato.',
    icon: Settings,
    features: [
      'Helpdesk e Service Desk com SLA',
      'Gestão de fornecedores',
      'Projetos e roadmap tecnológico',
      'Governança e compliance (LGPD, ISO 27001)',
      'Relatórios mensais executivos',
      'CIO as a Service',
    ],
    benefits: [
      { title: 'Custo previsível', description: 'Mensalidade fixa vs. custos espásticos de incidentes.' },
      { title: 'Time multidisciplinar', description: 'Acesso a especialistas em diversas tecnologias por um único contrato.' },
      { title: 'Foco no negócio', description: 'Você cuida do core business; nós cuidamos da TI.' },
    ],
    faq: [],
    keywords: ['ti gerenciada', 'msp', 'service desk', 'helpdesk', 'cio as a service'],
  },
];

export function getServiceBySlug(slug: string): ServiceData | undefined {
  return SERVICES.find((s) => s.slug === slug);
}
