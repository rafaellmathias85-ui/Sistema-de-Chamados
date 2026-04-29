import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { callAIWithResilience } from '@/lib/ai-providers';

export const dynamic = 'force-dynamic';

/* ─── Palavras-chave financeiras para proteção de dados ─── */
const FINANCIAL_KEYWORDS = [
  'faturamento', 'receita', 'lucro', 'prejuízo', 'margem',
  'custo', 'despesa', 'comissão', 'salário', 'folha de pagamento',
  'nota fiscal', 'nf-e', 'nfe', 'boleto', 'cobrança', 'inadimplência',
  'fluxo de caixa', 'dre', 'balanço', 'balancete', 'contábil',
  'imposto', 'tributo', 'icms', 'iss', 'pis', 'cofins',
  'valor do contrato', 'preço', 'orçamento', 'proposta comercial',
  'financeiro', 'contas a pagar', 'contas a receber',
  'fatura', 'pagamento', 'reembolso', 'extrato',
];

const ROLES_WITH_FINANCIAL_ACCESS = ['ADMIN', 'FINANCE'];

function containsFinancialQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return FINANCIAL_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Chatbot IA com RAG - Técnico Sênior de TI.
 * Busca tickets e KB do tenant para contexto. Suporta streaming.
 * Proteção de dados financeiros por role.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { message, history = [] } = await request.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    const tenantId = session.user.tenantId;
    const userRole = session.user.role;
    const isStaff = ['ADMIN', 'SUPPORT', 'FINANCE'].includes(userRole);
    const hasFinancialAccess = ROLES_WITH_FINANCIAL_ACCESS.includes(userRole);

    /* ─── Proteção financeira ─── */
    if (containsFinancialQuery(message) && !hasFinancialAccess) {
      console.log(`[AI Chat] Bloqueio financeiro: user=${session.user.email} role=${userRole} msg="${message.substring(0, 80)}"`);
      const blockedMsg = `⚠️ **Acesso restrito**\n\nAs informações financeiras são restritas aos perfis **Administrador** e **Financeiro**.\n\nSeu perfil atual: **${userRole}**\n\nSe você precisa acessar dados financeiros, solicite a alteração do seu perfil ao administrador do sistema.`;

      // Retornar como stream para manter compatibilidade com o frontend
      const encoder = new TextEncoder();
      const fakeStream = new ReadableStream({
        start(controller) {
          const chunk = JSON.stringify({ choices: [{ delta: { content: blockedMsg } }] });
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(fakeStream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    // RAG: Buscar tickets relevantes para contexto
    const ticketFilter: Record<string, unknown> = {};
    if (tenantId) ticketFilter.tenantId = tenantId;
    if (!isStaff) ticketFilter.companyId = session.user.companyId;

    const keywords = message
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
      .slice(0, 5);

    const relevantTickets = await prisma.ticket.findMany({
      where: {
        ...ticketFilter,
        OR: keywords.length > 0
          ? keywords.map((kw: string) => ({
              OR: [
                { subject: { contains: kw, mode: 'insensitive' as const } },
                { description: { contains: kw, mode: 'insensitive' as const } },
              ],
            }))
          : undefined,
      },
      select: {
        number: true,
        subject: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        messages: {
          select: { content: true, authorName: true, authorRole: true },
          take: 3,
          orderBy: { createdAt: 'desc' as const },
        },
      },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    });

    // Buscar artigos da KB relevantes
    const relevantArticles = await prisma.kBArticle.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        isPublished: true,
        OR: keywords.length > 0
          ? keywords.map((kw: string) => ({
              OR: [
                { title: { contains: kw, mode: 'insensitive' as const } },
                { content: { contains: kw, mode: 'insensitive' as const } },
              ],
            }))
          : undefined,
      },
      select: { title: true, content: true },
      take: 3,
    });

    // Estatísticas gerais
    const [totalTickets, openTickets, resolvedTickets] = await Promise.all([
      prisma.ticket.count({ where: ticketFilter }),
      prisma.ticket.count({ where: { ...ticketFilter, status: 'OPEN' } }),
      prisma.ticket.count({ where: { ...ticketFilter, status: { in: ['RESOLVED', 'CLOSED'] } } }),
    ]);

    // Montar contexto RAG
    let ragContext = `## Dados do Help Desk\nEstatísticas: ${totalTickets} tickets total, ${openTickets} abertos, ${resolvedTickets} resolvidos.\n\n`;

    if (relevantTickets.length > 0) {
      ragContext += `## Tickets Relevantes\n`;
      for (const t of relevantTickets) {
        ragContext += `- Ticket #${t.number}: "${t.subject}" [${t.status}/${t.priority}]\n`;
        ragContext += `  Descrição: ${t.description?.substring(0, 200)}\n`;
        if (t.messages.length > 0) {
          ragContext += `  Última msg: ${t.messages[0].content?.substring(0, 150)}\n`;
        }
      }
      ragContext += '\n';
    }

    if (relevantArticles.length > 0) {
      ragContext += `## Base de Conhecimento\n`;
      for (const a of relevantArticles) {
        ragContext += `- ${a.title}: ${a.content?.substring(0, 300)}\n`;
      }
      ragContext += '\n';
    }

    /* ─── System Prompt: Técnico Sênior de TI ─── */
    const financialGuard = hasFinancialAccess
      ? 'O usuário possui acesso financeiro. Pode discutir dados financeiros normalmente.'
      : 'REGRA CRÍTICA: O usuário NÃO possui acesso a dados financeiros. Se algum contexto contiver valores monetários, custos, preços de contratos ou dados financeiros, NÃO os mencione. Responda que essas informações são restritas.';

    const systemPrompt = `Você é o **Assistente Técnico Sênior** do Help Desk da Winner Tecnologia.

## Sua Identidade
- Nome: Assistente Winner
- Perfil: Técnico de TI Sênior com mais de 15 anos de experiência em suporte, infraestrutura, redes, segurança e sistemas
- Empresa: Winner Tecnologia — especializada em soluções de TI, suporte técnico e outsourcing

## Diretrizes de Comportamento
- Responda SEMPRE em português do Brasil, de forma profissional e objetiva
- Use linguagem técnica quando apropriado, mas explique termos complexos quando falar com usuários não-técnicos
- Seja proativo: sugira soluções, próximos passos e prevenções
- Use formatação markdown (listas, negrito, código) para clareza
- Ao citar tickets, use o formato **Ticket #NÚMERO**
- Se não tiver informação suficiente, diga claramente e sugira quem procurar ou o que verificar
- Ao lidar com problemas urgentes/críticos, destaque a urgência e sugira escalação

## Especialidades Técnicas
- Redes: TCP/IP, VPN, firewalls, switches, roteadores, Wi-Fi corporativo
- Servidores: Windows Server, Linux, Active Directory, GPO, DNS, DHCP
- Segurança: antivírus, backup, disaster recovery, políticas de acesso
- Cloud: Azure, AWS, Microsoft 365, Google Workspace
- Sistemas: ERP, CRM, bancos de dados, integração de sistemas
- Hardware: desktops, notebooks, impressoras, storages, no-breaks

## Proteção de Dados
${financialGuard}

## Contexto do Usuário
- Nome: ${session.user.name}
- Perfil: ${userRole}
${isStaff ? '- Acesso: Staff (pode ver todos os tickets do tenant)' : '- Acesso: Apenas tickets da própria empresa'}

${ragContext}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((h: { role: string; content: string }) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    // Chamar LLM API com resiliência (retry + circuit breaker + failover)
    const aiResult = await callAIWithResilience(messages, {
      stream: true,
      maxTokens: 2000,
      temperature: 0.5,
    });

    if ('error' in aiResult) {
      console.error('[AI Chat] Todos provedores falharam:', aiResult.error);
      return NextResponse.json({ error: aiResult.error }, { status: aiResult.status });
    }

    const llmResponse = aiResult.response;

    // Stream response back
    const stream = new ReadableStream({
      async start(ctrl) {
        const reader = llmResponse.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        if (!reader) { ctrl.close(); return; }
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            ctrl.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          console.error('[AI Chat] Stream error:', error);
          ctrl.error(error);
        } finally {
          ctrl.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}