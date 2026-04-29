import { NextRequest, NextResponse } from 'next/server';
import { processAllUnreadEmails } from '@/lib/microsoft-graph';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST - Endpoint para processamento de emails (chamado por scheduled tasks externas ou manualmente)
export async function POST(request: NextRequest) {
  try {
    // Validar API key
    const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
    const expectedKey = process.env.EMAIL_CRON_API_KEY || process.env.EMAIL_PROCESS_API_KEY;
    
    if (!expectedKey) {
      return NextResponse.json({ error: 'API key não configurada no servidor' }, { status: 500 });
    }
    
    if (!apiKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Não autorizado - API key inválida' }, { status: 401 });
    }

    console.log(`[Email Cron] [${new Date().toISOString()}] Iniciando processamento de emails...`);
    
    const result = await processAllUnreadEmails();
    
    if (result.tokenError) {
      console.error(`[Email Cron] Erro de autenticação: ${result.tokenError}`);
      return NextResponse.json({
        success: false,
        message: `Erro de autenticação: ${result.tokenError}`,
        ...result,
      }, { status: 401 });
    }
    
    console.log(`[Email Cron] Concluído: ${result.tickets} novos chamados, ${result.replies || 0} interações de ${result.processed} emails`);
    
    return NextResponse.json({
      success: true,
      message: `Processamento concluído: ${result.tickets} novos chamados, ${result.replies || 0} interações de ${result.processed} emails`,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('Erro no processamento de emails via cron:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor', details: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    );
  }
}

// GET - Health check + garante que o poller está rodando
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  const expectedKey = process.env.EMAIL_CRON_API_KEY || process.env.EMAIL_PROCESS_API_KEY;
  
  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
  }

  // Garante que o poller está rodando (redundância)
  const { ensureEmailPollerRunning } = await import('@/lib/email-poller');
  ensureEmailPollerRunning();
  
  return NextResponse.json({
    status: 'ok',
    service: 'email-cron',
    pollingMode: 'jwt-callback-setInterval',
    interval: '1 minuto',
    timestamp: new Date().toISOString(),
  });
}