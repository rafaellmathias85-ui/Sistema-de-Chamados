import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BLOG_POSTS = [
  {
    slug: 'como-escolher-um-msp',
    title: 'Como escolher um MSP confiável para sua empresa',
    excerpt:
      'Critérios essenciais para avaliar um Managed Service Provider: certificações, SLAs, segurança, processo e cultura.',
    category: 'Gestão de TI',
    author: 'Equipe Winner Tecnologia',
    publishedAt: new Date('2026-04-15'),
    content:
      'Em um cenário em que a TI é cada vez mais crítica para o negócio, escolher um MSP (Managed Service Provider) certo é uma decisão estratégica.\n\nNeste artigo apresentamos os principais critérios que você deve avaliar:\n\n- Certificações técnicas (Microsoft, AWS, Bitdefender, etc.)\n- SLAs claros e mensuráveis\n- Processos de segurança e compliance\n- Cultura de melhoria contínua\n- Capacidade de atender picos de demanda',
  },
  {
    slug: 'tendencias-ciberseguranca-2026',
    title: 'Tendências de Cibersegurança para 2026',
    excerpt:
      'IA generativa, ataques à cadeia de suprimentos, identidade como perímetro e o avanço do Zero Trust.',
    category: 'Cyber Security',
    author: 'Equipe Winner Tecnologia',
    publishedAt: new Date('2026-03-10'),
    content:
      '2026 marca uma virada na forma como pensamos segurança corporativa.\n\nIA generativa, supply chain, identidade e Zero Trust estão no centro das estratégias de defesa.\n\nNeste artigo, exploramos cada tendência e como sua empresa pode se preparar.',
  },
  {
    slug: 'backup-321-na-pratica',
    title: 'Estratégia de backup 3-2-1-1-0 na prática',
    excerpt:
      'O que significa cada número da regra 3-2-1-1-0 e como implementá-la sem explodir o orçamento.',
    category: 'Backup & DR',
    author: 'Equipe Winner Tecnologia',
    publishedAt: new Date('2026-02-05'),
    content:
      'A regra 3-2-1-1-0 é considerada o padrão-ouro do backup moderno.\n\n3 cópias dos dados, em 2 mídias diferentes, 1 offsite, 1 imutável e 0 erros nos restores.\n\nNo artigo mostramos como aplicar essa estratégia em pequenas, médias e grandes empresas.',
  },
];

const CASE_STUDIES = [
  {
    slug: 'migracao-azure-zero-downtime',
    theme: 'Indústria',
    title: 'Migração crítica para Azure com zero downtime',
    summary:
      'Migração de ERP de cliente industrial com múltiplas filiais, mantendo 100% de uptime durante a janela.',
    metrics: [
      { label: 'Downtime', value: '0min' },
      { label: 'Redução de TCO', value: '32%' },
      { label: 'SLA pós-go-live', value: '99,95%' },
    ],
    order: 1,
  },
  {
    slug: 'zero-trust-lgpd-financeiro',
    theme: 'Serviços Financeiros',
    title: 'Implementação de Zero Trust e LGPD',
    summary:
      'Hardening completo, MFA obrigatório, segregação de redes e adequação LGPD em 90 dias.',
    metrics: [
      { label: 'Phishing bloqueado', value: '+98%' },
      { label: 'Compliance LGPD', value: '100%' },
      { label: 'Tempo de detecção', value: '< 5min' },
    ],
    order: 2,
  },
  {
    slug: 'monitoramento-247-helpdesk-varejo',
    theme: 'Varejo',
    title: 'Monitoramento 24/7 e helpdesk gerenciado',
    summary:
      'Centralização do atendimento de TI de uma rede de lojas com NOC próprio.',
    metrics: [
      { label: 'Reabertura de chamados', value: '-65%' },
      { label: 'Tempo médio de resposta', value: '< 2min' },
      { label: 'Satisfação do usuário', value: '4,8/5' },
    ],
    order: 3,
  },
];

async function main() {
  console.log('Seeding blog posts...');
  for (const post of BLOG_POSTS) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: post,
    });
  }
  console.log('Seeding case studies...');
  for (const cs of CASE_STUDIES) {
    await prisma.caseStudy.upsert({
      where: { slug: cs.slug },
      update: {},
      create: cs,
    });
  }
  console.log('Done.');
}

main().finally(() => prisma.$disconnect());
