export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { callAIWithResilience } from '@/lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { message, context } = await request.json();
    if (!message) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 });

    // Build RAG context from recent tickets and scripts
    const recentTickets = await prisma.ticket.findMany({
      where: { status: { in: ['RESOLVED', 'CLOSED'] } },
      select: { number: true, subject: true, description: true, priority: true },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    const scripts = await prisma.rmmScript.findMany({
      where: { approved: true },
      select: { name: true, content: true, scriptType: true },
      take: 15,
    }).catch(() => []);

    const ticketContext = recentTickets.map(t => 
      `Ticket #${t.number} [${t.priority}]: ${t.subject} - ${t.description?.substring(0, 200) || ''}`
    ).join('\n');

    const scriptContext = scripts.map((s: any) =>
      `Script "${s.name}" (${s.scriptType}): ${s.content?.substring(0, 300) || ''}`
    ).join('\n');

    const systemPrompt = `Você é um assistente técnico especializado em TI para a Winner Tecnologia.
Você ajuda técnicos de suporte com diagnósticos, comandos, scripts e soluções.

Contexto da base de conhecimento:

TICKETS RESOLVIDOS RECENTES:
${ticketContext || 'Nenhum ticket disponível'}

SCRIPTS APROVADOS:
${scriptContext || 'Nenhum script disponível'}

${context ? `CONTEXTO ADICIONAL:\n${context}` : ''}

Regras:
- Responda em português brasileiro
- Seja direto e técnico
- Sugira comandos PowerShell, CMD ou Python quando aplicável
- Referencie tickets similares quando possível
- Formate código com blocos de código markdown
- Se não souber, diga claramente`;

    // Use multi-provider failover (AbacusAI → OpenAI → Gemini)
    const aiResult = await callAIWithResilience(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      { stream: true, maxTokens: 2000, temperature: 0.5 }
    );

    if ('error' in aiResult) {
      console.error('[RMM AI Chat] All providers failed:', aiResult.error);
      return NextResponse.json({ error: aiResult.error }, { status: aiResult.status });
    }

    const { response, providerName } = aiResult;
    console.log(`[RMM AI Chat] Using provider: ${providerName}`);

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
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
    console.error('AI chat error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
