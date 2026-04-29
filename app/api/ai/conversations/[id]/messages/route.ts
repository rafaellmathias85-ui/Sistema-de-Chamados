import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { callAIWithResilience } from '@/lib/ai-providers';
import { executeAiTool, getToolsForApi } from '@/lib/ai-tools';

export const dynamic = 'force-dynamic';

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

// POST - Send message and get AI response
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const userRole = session.user.role;
    const hasFinancialAccess = ROLES_WITH_FINANCIAL_ACCESS.includes(userRole);
    const isStaff = ['ADMIN', 'SUPPORT', 'FINANCE'].includes(userRole);

    // Verify conversation belongs to user
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    const { message } = await request.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    // Financial protection
    if (containsFinancialQuery(message) && !hasFinancialAccess) {
      const blockedMsg = `⚠️ **Acesso restrito**\n\nAs informações financeiras são restritas aos perfis **Administrador** e **Financeiro**.\n\nSeu perfil atual: **${userRole}**`;
      
      // Save messages
      await prisma.aiMessage.create({ data: { conversationId: params.id, role: 'user', content: message } });
      await prisma.aiMessage.create({ data: { conversationId: params.id, role: 'assistant', content: blockedMsg } });
      await prisma.aiConversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

      const encoder = new TextEncoder();
      const fakeStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: blockedMsg } }] })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(fakeStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
    }

    // Save user message
    await prisma.aiMessage.create({ data: { conversationId: params.id, role: 'user', content: message } });

    // Update conversation title from first message
    if (!conversation.title) {
      const title = message.substring(0, 40) + (message.length > 40 ? '...' : '');
      await prisma.aiConversation.update({ where: { id: params.id }, data: { title } });
    }

    // Get conversation history
    const history = await prisma.aiMessage.findMany({
      where: { conversationId: params.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const financialGuard = hasFinancialAccess
      ? 'O usuário possui acesso financeiro. Pode discutir dados financeiros normalmente.'
      : 'REGRA CRÍTICA: O usuário NÃO possui acesso a dados financeiros. Se algum contexto contiver valores monetários, custos, preços de contratos ou dados financeiros, NÃO os mencione.';

    const systemPrompt = `Você é consultora sênior em Suporte Técnico de TI e Cyber Segurança (15+ anos de experiência).

## Especialidades
- Segurança da informação, Microsoft (AD, Azure, Entra ID, Exchange, Teams, Intune)
- Google Workspace, redes, firewalls, VPN
- LGPD, ISO 27001, NIST, CIS Controls, MITRE ATT&CK

## Diretrizes
- Você tem acesso direto aos dados do sistema através de ferramentas (tools)
- SEMPRE consulte dados reais antes de responder sobre chamados, clientes ou estatísticas
- NUNCA invente dados — se não encontrar, diga que não há dados disponíveis
- Responda em português brasileiro, profissional e objetiva
- Use formatação markdown para clareza
- Ao citar tickets, use o formato **Ticket #NÚMERO**

## Proteção de Dados
${financialGuard}

## Contexto do Usuário
- Nome: ${session.user.name}
- Perfil: ${userRole}
${isStaff ? '- Acesso: Staff (todos os tickets)' : '- Acesso: Apenas tickets da própria empresa'}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16).map(h => ({ role: h.role, content: h.content })),
    ];

    // Call with tools for function calling
    const tools = isStaff ? getToolsForApi() : [];
    
    const aiResult = await callAIWithResilience(messages, {
      stream: false,
      maxTokens: 2000,
      temperature: 0.5,
      tools: tools.length > 0 ? tools : undefined,
    });

    if ('error' in aiResult) {
      return NextResponse.json({ error: aiResult.error }, { status: aiResult.status || 500 });
    }

    // Handle non-streaming response with potential tool calls
    let finalContent = '';
    
    try {
      const responseBody = await aiResult.response.text();
      let toolCalls: any[] = [];
      
      // Try parsing as regular JSON first (non-streaming response)
      try {
        const jsonResp = JSON.parse(responseBody);
        const choice = jsonResp.choices?.[0];
        if (choice?.message?.content) {
          finalContent = choice.message.content;
        }
        if (choice?.message?.tool_calls) {
          toolCalls = choice.message.tool_calls;
        }
      } catch {
        // Fallback: parse as SSE format
        const lines = responseBody.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
            try {
              const parsed = JSON.parse(line.slice(6));
              const choice = parsed.choices?.[0];
              if (choice?.message?.content) {
                finalContent += choice.message.content;
              }
              if (choice?.delta?.content) {
                finalContent += choice.delta.content;
              }
              if (choice?.message?.tool_calls) {
                toolCalls = choice.message.tool_calls;
              }
            } catch {}
          }
        }
      }

      console.log(`[AI] First call: content=${finalContent?.length || 0} chars, toolCalls=${toolCalls.length}`);

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        const toolResults: { role: string; content: string; tool_call_id?: string }[] = [];
        
        for (const tc of toolCalls) {
          const fnName = tc.function?.name;
          let fnArgs: Record<string, any> = {};
          try { fnArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}
          
          const result = await executeAiTool(fnName, fnArgs);
          toolResults.push({
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
          });
        }

        // Second call with tool results
        const followUpMessages = [
          ...messages,
          { role: 'assistant', content: finalContent || null, tool_calls: toolCalls },
          ...toolResults,
        ];

        const followUpResult = await callAIWithResilience(followUpMessages, {
          stream: true,
          maxTokens: 2000,
          temperature: 0.5,
        });

        if ('error' in followUpResult) {
          // Fallback: return tool data directly
          finalContent = `Dados consultados:\n\n${toolResults.map(r => r.content).join('\n')}`;
        } else {
          // Check if the response is SSE stream or JSON
          const contentType = followUpResult.response.headers.get('content-type') || '';
          const isStreamResponse = contentType.includes('text/event-stream') || contentType.includes('text/plain');
          
          if (isStreamResponse && followUpResult.response.body) {
            // Stream the follow-up response
            const reader = followUpResult.response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            
            const stream = new ReadableStream({
              async start(ctrl) {
                const enc = new TextEncoder();
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    ctrl.enqueue(enc.encode(chunk));
                    
                    // Extract content for saving
                    const chunkLines = chunk.split('\n');
                    for (const cl of chunkLines) {
                      if (cl.startsWith('data: ') && cl.slice(6) !== '[DONE]') {
                        try {
                          const p = JSON.parse(cl.slice(6));
                          fullContent += p.choices?.[0]?.delta?.content || '';
                        } catch {}
                      }
                    }
                  }
                } catch (e) { console.error('[AI] Stream error:', e); }
                finally {
                  ctrl.close();
                  if (fullContent) {
                    await prisma.aiMessage.create({ data: { conversationId: params.id, role: 'assistant', content: fullContent } });
                    await prisma.aiConversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } });
                  }
                }
              },
            });

            return new Response(stream, {
              headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
            });
          } else {
            // Non-streaming JSON response — parse and convert to SSE for frontend
            const followUpBody = await followUpResult.response.text();
            try {
              const jsonResp = JSON.parse(followUpBody);
              finalContent = jsonResp.choices?.[0]?.message?.content || '';
            } catch {
              // Try SSE parsing
              const lines = followUpBody.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
                  try {
                    const p = JSON.parse(line.slice(6));
                    finalContent += p.choices?.[0]?.delta?.content || p.choices?.[0]?.message?.content || '';
                  } catch {}
                }
              }
            }
          }
        }
      }
    } catch (parseError) {
      console.error('[AI] Parse error:', parseError);
    }

    // If we got here, either no tool calls or tool calls with fallback
    if (!finalContent) {
      finalContent = 'Desculpe, não consegui processar sua solicitação. Tente novamente.';
    }

    // Save assistant message
    await prisma.aiMessage.create({ data: { conversationId: params.id, role: 'assistant', content: finalContent } });
    await prisma.aiConversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

    // Return as stream for frontend compatibility
    const encoder = new TextEncoder();
    const fakeStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: finalContent } }] })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(fakeStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
  } catch (error) {
    console.error('[AI Conversation Messages] Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
