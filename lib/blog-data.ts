export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  author: string;
  category: string;
  readingTime: number; // minutes
  content: string; // markdown-like; renderizamos como parágrafos simples por ora
  keywords: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'como-escolher-um-msp',
    title: 'Como escolher um MSP confiável para sua empresa',
    excerpt:
      'Critérios essenciais para avaliar um Managed Service Provider: certificações, SLAs, segurança, processo e cultura.',
    date: '2026-04-15',
    author: 'Equipe Winner Tecnologia',
    category: 'Gestão de TI',
    readingTime: 6,
    keywords: ['msp', 'ti gerenciada', 'sla', 'fornecedor de ti'],
    content:
      'Em um cenário em que a TI é cada vez mais crítica para o negócio, escolher um MSP (Managed Service Provider) certo é uma decisão estratégica.\n\nNeste artigo apresentamos os principais critérios que você deve avaliar:\n\n- Certificações técnicas (Microsoft, AWS, Bitdefender, etc.)\n- SLAs claros e mensuráveis\n- Processos de segurança e compliance\n- Cultura de melhoria contínua\n- Capacidade de atender picos de demanda',
  },
  {
    slug: 'tendencias-ciberseguranca-2026',
    title: 'Tendências de Cibersegurança para 2026',
    excerpt:
      'IA generativa, ataques à cadeia de suprimentos, identidade como perímetro e o avanço do Zero Trust.',
    date: '2026-03-10',
    author: 'Equipe Winner Tecnologia',
    category: 'Cyber Security',
    readingTime: 8,
    keywords: ['cibersegurança', 'zero trust', 'ia', 'tendências 2026'],
    content:
      '2026 marca uma virada na forma como pensamos segurança corporativa.\n\nIA generativa, supply chain, identidade e Zero Trust estão no centro das estratégias de defesa.\n\nNeste artigo, exploramos cada tendência e como sua empresa pode se preparar.',
  },
  {
    slug: 'backup-321-na-pratica',
    title: 'Estratégia de backup 3-2-1-1-0 na prática',
    excerpt:
      'O que significa cada número da regra 3-2-1-1-0 e como implementá-la sem explodir o orçamento.',
    date: '2026-02-05',
    author: 'Equipe Winner Tecnologia',
    category: 'Backup & DR',
    readingTime: 5,
    keywords: ['backup', '3-2-1', 'imutabilidade', 'disaster recovery'],
    content:
      'A regra 3-2-1-1-0 é considerada o padrão-ouro do backup moderno.\n\n3 cópias dos dados, em 2 mídias diferentes, 1 offsite, 1 imutável e 0 erros nos restores.\n\nNo artigo mostramos como aplicar essa estratégia em pequenas, médias e grandes empresas.',
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
