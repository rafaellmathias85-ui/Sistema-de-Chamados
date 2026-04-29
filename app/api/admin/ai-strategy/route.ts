import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getCurrentStrategy, setStrategy, AIStrategy } from '@/lib/ai-providers';

export const dynamic = 'force-dynamic';

const VALID_STRATEGIES: AIStrategy[] = ['failover', 'round_robin', 'weighted', 'task_based', 'least_latency'];

/**
 * GET /api/admin/ai-strategy
 * Retorna a estratégia atual de roteamento de IA.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const current = await getCurrentStrategy();

    return NextResponse.json({
      strategy: current,
      available: VALID_STRATEGIES,
      descriptions: {
        failover: 'Prioridade fixa: P1 → P2 → P3 (mais conservador, default)',
        round_robin: 'Alterna entre os provedores em sequência (distribuição uniforme)',
        weighted: 'Seleção probabilística por peso (configurável via AI_WEIGHT_*)',
        task_based: 'Escolhe o melhor para cada tipo de tarefa (fast/creative/complex)',
        least_latency: 'Escolhe sempre o provedor com menor latência recente',
      },
    });
  } catch (err) {
    console.error('[AI Strategy GET]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/ai-strategy
 * Atualiza a estratégia. Persiste em AppSetting (key='ai.strategy').
 * Body: { strategy: 'failover' | 'round_robin' | 'weighted' | 'task_based' | 'least_latency' }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const strategy = body?.strategy as AIStrategy;

    if (!strategy || !VALID_STRATEGIES.includes(strategy)) {
      return NextResponse.json(
        { error: 'Estratégia inválida', valid: VALID_STRATEGIES },
        { status: 400 }
      );
    }

    await setStrategy(strategy);

    return NextResponse.json({
      success: true,
      strategy,
      message: `Estratégia alterada para ${strategy}`,
    });
  } catch (err) {
    console.error('[AI Strategy PUT]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
