import { NextRequest, NextResponse } from 'next/server';
import { processIncomingEmails, testImapConnection } from '@/lib/email-processor';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 segundos para processar emails

// POST - Processar emails ou testar conexão
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    // Permitir acesso por API key para automação (webhook/cron)
    const apiKey = request.headers.get('x-api-key');
    const isValidApiKey = apiKey && apiKey === process.env.EMAIL_PROCESS_API_KEY;
    
    if (!session?.user && !isValidApiKey) {
      // Verificar se é admin
      if (session?.user?.role !== 'ADMIN' && !isValidApiKey) {
        return NextResponse.json(
          { error: 'Acesso não autorizado' },
          { status: 403 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const { action } = body;

    // Testar conexão IMAP
    if (action === 'test') {
      const { host, port, user, pass, secure } = body;
      
      if (!host || !user || !pass) {
        return NextResponse.json(
          { error: 'Host, usuário e senha são obrigatórios' },
          { status: 400 }
        );
      }

      const result = await testImapConnection({
        host,
        port: port || 993,
        user,
        pass,
        secure: secure !== false,
      });

      return NextResponse.json(result);
    }

    // Processar emails
    const result = await processIncomingEmails();
    
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error processing emails:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao processar emails' },
      { status: 500 }
    );
  }
}

// GET - Status do processamento
export async function GET() {
  try {
    const session = await getSession();
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acesso não autorizado' },
        { status: 403 }
      );
    }

    // Buscar configurações e estatísticas
    const config = await prisma.emailConfig.findUnique({
      where: { key: 'main' },
      select: {
        imapEnabled: true,
        imapHost: true,
        imapLastCheck: true,
      },
    });

    // Contar emails processados nas últimas 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stats = await prisma.processedEmail.groupBy({
      by: ['status'],
      where: {
        processedAt: { gte: last24h },
      },
      _count: true,
    });

    // Últimos emails processados
    const recentEmails = await prisma.processedEmail.findMany({
      take: 10,
      orderBy: { processedAt: 'desc' },
      include: {
        ticket: {
          select: {
            number: true,
            subject: true,
          },
        },
      },
    });

    return NextResponse.json({
      enabled: config?.imapEnabled || false,
      host: config?.imapHost || null,
      lastCheck: config?.imapLastCheck || null,
      stats24h: {
        processed: stats.find((s: any) => s.status === 'processed')?._count || 0,
        errors: stats.find((s: any) => s.status === 'error')?._count || 0,
        ignored: stats.find((s: any) => s.status === 'ignored')?._count || 0,
      },
      recentEmails,
    });

  } catch (error: any) {
    console.error('Error fetching email status:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar status' },
      { status: 500 }
    );
  }
}
