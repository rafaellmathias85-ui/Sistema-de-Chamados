import { prisma } from '@/lib/db';

// ===== AI Function Calling Tools =====

export interface AiTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export const AI_TOOLS: AiTool[] = [
  {
    name: 'get_open_tickets',
    description: 'Lista chamados abertos/em andamento. Pode filtrar por nome de cliente ou responsável.',
    parameters: {
      client_name: { type: 'string', description: 'Nome da empresa cliente (parcial, case-insensitive)', required: false },
      responsible: { type: 'string', description: 'Nome do técnico responsável (parcial, case-insensitive)', required: false },
    },
  },
  {
    name: 'get_tickets_summary',
    description: 'Retorna contagem de chamados agrupados por status e por prioridade.',
    parameters: {},
  },
  {
    name: 'get_ticket_by_id',
    description: 'Retorna detalhes completos de um chamado pelo número ou ID.',
    parameters: {
      ticket_id: { type: 'string', description: 'Número do ticket (ex: 42) ou ID', required: true },
    },
  },
  {
    name: 'get_client_list',
    description: 'Lista todos os clientes/empresas ativos com quantidade de chamados.',
    parameters: {},
  },
];

// Build OpenAI-compatible tools array for the API
export function getToolsForApi() {
  return AI_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: Object.entries(tool.parameters).filter(([, v]) => v.required).map(([k]) => k),
      },
    },
  }));
}

// Execute a tool call and return the result as string
export async function executeAiTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case 'get_open_tickets':
        return await getOpenTickets(args.client_name, args.responsible);
      case 'get_tickets_summary':
        return await getTicketsSummary();
      case 'get_ticket_by_id':
        return await getTicketById(args.ticket_id);
      case 'get_client_list':
        return await getClientList();
      default:
        return JSON.stringify({ error: `Ferramenta desconhecida: ${name}` });
    }
  } catch (error) {
    console.error(`[AI Tool] Error executing ${name}:`, error);
    return JSON.stringify({ error: `Erro ao executar ${name}` });
  }
}

async function getOpenTickets(clientName?: string, responsible?: string): Promise<string> {
  const where: any = {
    status: { in: ['OPEN', 'IN_PROGRESS'] },
  };
  if (clientName) {
    where.company = { name: { contains: clientName, mode: 'insensitive' } };
  }
  if (responsible) {
    where.assignee = { name: { contains: responsible, mode: 'insensitive' } };
  }

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      number: true,
      subject: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true } },
      assignee: { select: { name: true } },
      creator: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  return JSON.stringify({
    total: tickets.length,
    tickets: tickets.map(t => ({
      numero: t.number,
      assunto: t.subject,
      status: t.status,
      prioridade: t.priority,
      empresa: t.company?.name || 'N/A',
      responsavel: t.assignee?.name || 'Não atribuído',
      solicitante: t.creator?.name || 'N/A',
      criadoEm: t.createdAt.toISOString(),
      atualizadoEm: t.updatedAt.toISOString(),
    })),
  });
}

async function getTicketsSummary(): Promise<string> {
  const [byStatus, byPriority] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['priority'], _count: { _all: true } }),
  ]);

  const total = byStatus.reduce((sum, s) => sum + s._count._all, 0);

  return JSON.stringify({
    total,
    por_status: Object.fromEntries(byStatus.map(s => [s.status, s._count._all])),
    por_prioridade: Object.fromEntries(byPriority.map(p => [p.priority, p._count._all])),
  });
}

async function getTicketById(ticketId: string): Promise<string> {
  // Try by number first
  const num = parseInt(ticketId);
  const ticket = await prisma.ticket.findFirst({
    where: num ? { number: num } : { id: ticketId },
    select: {
      number: true,
      subject: true,
      description: true,
      status: true,
      priority: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      company: { select: { name: true } },
      assignee: { select: { name: true } },
      creator: { select: { name: true, email: true } },
      category: { select: { name: true } },
      messages: {
        select: { content: true, authorName: true, authorRole: true, createdAt: true, isInternal: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!ticket) return JSON.stringify({ error: 'Chamado não encontrado' });

  return JSON.stringify({
    numero: ticket.number,
    assunto: ticket.subject,
    descricao: ticket.description?.substring(0, 500),
    status: ticket.status,
    prioridade: ticket.priority,
    origem: ticket.source,
    empresa: ticket.company?.name,
    responsavel: ticket.assignee?.name || 'Não atribuído',
    solicitante: `${ticket.creator?.name} (${ticket.creator?.email})`,
    categoria: ticket.category?.name,
    criadoEm: ticket.createdAt.toISOString(),
    atualizadoEm: ticket.updatedAt.toISOString(),
    resolvidoEm: ticket.resolvedAt?.toISOString(),
    interacoes: ticket.messages.map(m => ({
      autor: m.authorName,
      papel: m.authorRole,
      conteudo: m.content?.substring(0, 200),
      interna: m.isInternal,
      data: m.createdAt.toISOString(),
    })),
  });
}

async function getClientList(): Promise<string> {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      clientType: true,
      _count: { select: { tickets: true, users: true } },
    },
    orderBy: { name: 'asc' },
    take: 100,
  });

  return JSON.stringify({
    total: companies.length,
    clientes: companies.map(c => ({
      nome: c.name,
      email: c.email,
      tipo: c.clientType,
      totalChamados: c._count.tickets,
      totalUsuarios: c._count.users,
    })),
  });
}
