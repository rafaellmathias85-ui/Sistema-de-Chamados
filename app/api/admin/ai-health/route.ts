import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { runHealthCheck } from '@/lib/ai-providers';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/ai-health
 * Executa um health-check em todos os provedores de IA configurados,
 * em paralelo, com mensagem mínima e timeout de 10s por provedor.
 *
 * Resposta:
 * {
 *   overall: 'all_ok' | 'partial' | 'all_down',
 *   okCount: number,
 *   totalProviders: number,
 *   results: [{ name, model, status, httpStatus?, latencyMs, error? }],
 *   timestamp: string
 * }
 *
 * Acesso restrito a ADMIN.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const result = await runHealthCheck();
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    console.error('[AI Health] Erro inesperado:', err);
    return NextResponse.json(
      { error: 'Erro ao executar health check', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET para conveniência (mesmo comportamento do POST).
 */
export async function GET() {
  return POST();
}
