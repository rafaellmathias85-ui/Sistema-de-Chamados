import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Buscar configuração WhatsApp do tenant
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const integration = await prisma.whatsAppIntegration.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(integration || null);
  } catch (error) {
    console.error('Error fetching WhatsApp config:', error);
    return NextResponse.json({ error: 'Erro ao buscar configuração' }, { status: 500 });
  }
}

// POST - Criar ou atualizar configuração WhatsApp
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const body = await request.json();
    const { gateway, instanceName, apiKey, apiUrl, webhookSecret, phoneNumber } = body;

    if (!gateway) {
      return NextResponse.json({ error: 'Gateway é obrigatório' }, { status: 400 });
    }

    // Buscar integração existente
    const existing = await prisma.whatsAppIntegration.findFirst({
      where: { tenantId },
    });

    let integration;
    if (existing) {
      integration = await prisma.whatsAppIntegration.update({
        where: { id: existing.id },
        data: {
          gateway,
          instanceName: instanceName || null,
          apiKey: apiKey || null,
          apiUrl: apiUrl || null,
          webhookSecret: webhookSecret || null,
          phoneNumber: phoneNumber || null,
          status: apiKey ? 'connecting' : 'inactive',
        },
      });
    } else {
      integration = await prisma.whatsAppIntegration.create({
        data: {
          tenantId,
          gateway,
          instanceName: instanceName || null,
          apiKey: apiKey || null,
          apiUrl: apiUrl || null,
          webhookSecret: webhookSecret || null,
          phoneNumber: phoneNumber || null,
          status: apiKey ? 'connecting' : 'inactive',
        },
      });
    }

    return NextResponse.json(integration);
  } catch (error) {
    console.error('Error saving WhatsApp config:', error);
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}
