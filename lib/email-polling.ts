/**
 * Módulo de polling interno para verificação de emails a cada 5 minutos.
 * Iniciado automaticamente pelo instrumentation.ts quando o servidor Next.js sobe.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

async function processEmails() {
  if (isProcessing) {
    console.log('[Email Polling] Processamento anterior ainda em andamento, pulando...');
    return;
  }

  isProcessing = true;
  const startTime = Date.now();

  try {
    // Import dinâmico para evitar problemas de inicialização circular
    const { processAllUnreadEmails } = await import('./microsoft-graph');
    
    console.log(`[Email Polling] [${new Date().toISOString()}] Iniciando verificação de emails...`);
    
    const result = await processAllUnreadEmails();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (result.tokenError) {
      console.error(`[Email Polling] Erro de autenticação: ${result.tokenError}`);
      return;
    }

    if (result.processed > 0) {
      console.log(
        `[Email Polling] Concluído em ${elapsed}s: ${result.tickets} novos chamados, ` +
        `${result.replies || 0} interações de ${result.processed} emails`
      );
    } else {
      console.log(`[Email Polling] Concluído em ${elapsed}s: Nenhum email novo.`);
    }
  } catch (error) {
    console.error('[Email Polling] Erro ao processar emails:', error instanceof Error ? error.message : error);
  } finally {
    isProcessing = false;
  }
}

export function startEmailPolling() {
  // Evitar múltiplas instâncias
  if (pollingTimer) {
    console.log('[Email Polling] Timer já está ativo, ignorando.');
    return;
  }

  console.log(`[Email Polling] Iniciando polling a cada ${POLL_INTERVAL_MS / 1000 / 60} minutos...`);

  // Primeira execução após 30 segundos (dar tempo do servidor estabilizar)
  setTimeout(() => {
    processEmails();
    
    // Agendar execução periódica a cada 5 minutos
    pollingTimer = setInterval(processEmails, POLL_INTERVAL_MS);
    console.log('[Email Polling] Timer configurado com sucesso.');
  }, 30 * 1000);
}

export function stopEmailPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[Email Polling] Timer parado.');
  }
}
