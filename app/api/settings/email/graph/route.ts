import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processAllUnreadEmails, testGraphConnection } from '@/lib/microsoft-graph';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Processar emails ou testar conexão
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    // Permitir acesso via API key ou sessão de admin
    const apiKey = request.headers.get('x-api-key');
    const isValidApiKey = apiKey && apiKey === process.env.EMAIL_PROCESS_API_KEY;
    
    if (!isValidApiKey && (!session?.user || session.user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'test') {
      // Testar conexão
      const { tenantId, clientId, clientSecret, userEmail } = body;
      
      if (!tenantId || !clientId || !clientSecret || !userEmail) {
        return NextResponse.json(
          { error: 'Todos os campos são obrigatórios para testar' },
          { status: 400 }
        );
      }

      // Se o clientSecret veio mascarado (••••••••), buscar o real do banco
      let realClientSecret = clientSecret.trim();
      if (realClientSecret === '••••••••' || realClientSecret.match(/^•+$/)) {
        const savedConfig = await prisma.emailConfig.findUnique({
          where: { key: 'main' },
          select: { graphClientSecret: true },
        });
        if (savedConfig?.graphClientSecret) {
          realClientSecret = savedConfig.graphClientSecret;
        } else {
          return NextResponse.json(
            { success: false, message: 'Client Secret não encontrado. Por favor, insira o Client Secret novamente.' },
            { status: 400 }
          );
        }
      }

      const result = await testGraphConnection({
        tenantId: tenantId.trim(),
        clientId: clientId.trim(),
        clientSecret: realClientSecret,
        userEmail: userEmail.trim().toLowerCase(),
      });

      return NextResponse.json(result);
    }

    if (action === 'process') {
      // Processar emails
      const result = await processAllUnreadEmails();
      
      if (result.tokenError) {
        return NextResponse.json({
          success: false,
          message: `Erro de autenticação: ${result.tokenError}`,
          ...result,
        });
      }
      
      return NextResponse.json({
        success: true,
        message: `Processamento concluído: ${result.tickets} novos chamados, ${result.replies || 0} interações adicionadas de ${result.processed} emails`,
        ...result,
      });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('Error in Graph API route:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// GET - Status da configuração
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const config = await prisma.emailConfig.findUnique({
      where: { key: 'main' },
      select: {
        graphEnabled: true,
        graphTenantId: true,
        graphClientId: true,
        graphUserEmail: true,
        graphLastCheck: true,
      },
    });

    // Buscar emails processados recentes
    const recentEmails = await prisma.processedEmail.findMany({
      take: 10,
      orderBy: { processedAt: 'desc' },
      include: {
        ticket: {
          select: { number: true, subject: true },
        },
      },
    });

    return NextResponse.json({
      config: config || { graphEnabled: false },
      recentEmails,
    });
  } catch (error) {
    console.error('Error getting Graph config:', error);
    return NextResponse.json(
      { error: 'Erro ao carregar configuração' },
      { status: 500 }
    );
  }
}
