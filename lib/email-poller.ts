// Email Poller - Polling automático de emails via setTimeout recursivo
// Iniciado sob demanda pelo callback jwt do NextAuth (lib/auth.ts)
// Usa globalThis para evitar múltiplas instâncias.

const POLL_INTERVAL_MS = 60 * 1000; // 1 minuto
const g = globalThis as any;

export function ensureEmailPollerRunning() {
  // Já rodando? Sai.
  if (g.__emailPollerStarted) return;
  g.__emailPollerStarted = true;

  // Só rodar no servidor
  if (typeof window !== 'undefined') return;

  console.log('[Email Poller] Poller ativado. Primeira execução em 10s, depois a cada 60s.');

  // Agendar primeira execução
  setTimeout(() => {
    pollAndReschedule();
  }, 10_000);
}

async function pollAndReschedule() {
  try {
    const { processAllUnreadEmails } = await import('@/lib/microsoft-graph');
    const now = new Date().toISOString();
    const result = await processAllUnreadEmails();

    if (result.tokenError) {
      console.error(`[Email Poller] [${now}] Erro auth: ${result.tokenError}`);
    } else if (result.processed > 0) {
      console.log(`[Email Poller] [${now}] ${result.tickets} chamados, ${result.replies} interações de ${result.processed} emails`);
    } else {
      console.log(`[Email Poller] [${now}] Nenhum email novo.`);
    }
  } catch (err: any) {
    console.error('[Email Poller] Erro:', err?.message || err);
  }

  // Agendar próxima execução (setTimeout recursivo é mais seguro que setInterval)
  setTimeout(() => {
    pollAndReschedule();
  }, POLL_INTERVAL_MS);
}
