import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Gera número sequencial para o ticket (ex: #1234)
 */
async function getNextTicketNumber(): Promise<number> {
  const last = await prisma.ticket.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (last?.number || 0) + 1;
}

/**
 * Tenta encontrar ou criar um contato/empresa a partir do telefone.
 * Retorna { companyId, userId, tenantId } ou null se não encontrar tenant ativo.
 */
async function resolveContact(phone: string, senderName: string | null) {
  // Buscar integração ativa para determinar o tenant
  const integration = await prisma.whatsAppIntegration.findFirst({
    where: { status: 'active' },
    select: { tenantId: true },
  });
  if (!integration?.tenantId) return null;
  const tenantId = integration.tenantId;

  // Normalizar telefone (remover +, espaços, etc)
  const cleanPhone = phone.replace(/\D/g, '');

  // Tentar encontrar empresa pelo telefone
  const company = await prisma.company.findFirst({
    where: {
      tenantId,
      OR: [
        { phone: { contains: cleanPhone.slice(-8) } },
        { phone: { contains: phone } },
      ],
    },
    include: { users: { take: 1 } },
  });

  if (company) {
    // Se empresa não tem usuário, criar um
    let userId = company.users[0]?.id;
    if (!userId) {
      const user = await prisma.user.create({
        data: {
          email: `whatsapp_${cleanPhone}@placeholder.local`,
          password: 'WHATSAPP_NO_LOGIN',
          name: senderName || `WhatsApp ${phone}`,
          role: 'CLIENT',
          companyId: company.id,
          tenantId,
        },
      });
      userId = user.id;
    }
    return { companyId: company.id, userId, tenantId };
  }

  // Se não encontrou, criar empresa e usuário genéricos
  const newCompany = await prisma.company.create({
    data: {
      name: senderName || `WhatsApp ${phone}`,
      phone: phone,
      tenantId,
    },
  });

  const newUser = await prisma.user.create({
    data: {
      email: `whatsapp_${cleanPhone}@placeholder.local`,
      password: 'WHATSAPP_NO_LOGIN',
      name: senderName || `WhatsApp ${phone}`,
      role: 'CLIENT',
      companyId: newCompany.id,
      tenantId,
    },
  });

  return {
    companyId: newCompany.id,
    userId: newUser.id,
    tenantId,
  };
}

/**
 * Cria ticket automaticamente a partir de mensagem WhatsApp recebida.
 */
async function createTicketFromWhatsApp(
  phone: string,
  message: string,
  senderName: string | null,
  logId: string
) {
  const contact = await resolveContact(phone, senderName);
  if (!contact) {
    console.log('[WhatsApp] Nenhum tenant com WhatsApp ativo, ticket não criado');
    return null;
  }

  const number = await getNextTicketNumber();
  const subj = message.length > 80 ? message.substring(0, 77) + '...' : message;

  const ticket = await prisma.ticket.create({
    data: {
      number,
      subject: `[WhatsApp] ${subj}`,
      description: `Mensagem recebida via WhatsApp de ${senderName || phone}:\n\n${message}`,
      status: 'OPEN',
      priority: 'MEDIUM',
      source: 'whatsapp',
      companyId: contact.companyId,
      creatorId: contact.userId,
      tenantId: contact.tenantId,
    },
  });

  // Vincular o log ao ticket
  await prisma.whatsAppLog.update({
    where: { id: logId },
    data: { ticketId: ticket.id },
  });

  console.log(`[WhatsApp] Ticket #${number} criado para ${phone}`);
  return ticket;
}

/**
 * Endpoint de Webhook para receber mensagens do WhatsApp.
 * Cada gateway (Meta, Evolution, Z-API) envia payloads diferentes.
 * Aceita o webhook, registra log e cria ticket automaticamente.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[WhatsApp Webhook] Received:', JSON.stringify(body).substring(0, 500));

    // Extrair dados genéricos do webhook (formato varia por gateway)
    const phone = body?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '')
      || body?.from
      || body?.sender?.phone
      || body?.phone
      || 'unknown';
    const message = body?.data?.message?.conversation
      || body?.data?.message?.extendedTextMessage?.text
      || body?.message?.text
      || body?.text
      || body?.body
      || '';
    const senderName = body?.data?.pushName
      || body?.sender?.name
      || body?.name
      || null;
    const externalId = body?.data?.key?.id
      || body?.messageId
      || body?.id
      || null;

    if (!message || phone === 'unknown') {
      return NextResponse.json({ status: 'ignored', reason: 'no_message' });
    }

    // Registrar no log
    const log = await prisma.whatsAppLog.create({
      data: {
        senderPhone: phone,
        senderName,
        messageBody: message,
        messageType: 'text',
        direction: 'in',
        externalId,
      },
    });

    // Verificar se já existe ticket aberto recente do mesmo telefone (evitar duplicatas)
    const recentTicket = await prisma.ticket.findFirst({
      where: {
        source: 'WHATSAPP',
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        company: {
          OR: [
            { phone: { contains: phone.replace(/\D/g, '').slice(-8) } },
            { phone: { contains: phone } },
          ],
        },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // últimas 24h
      },
    });

    if (recentTicket) {
      // Encontrar o userId associado ao telefone para o authorId
      const contact = await resolveContact(phone, senderName);
      const authorId = contact?.userId || recentTicket.creatorId;
      
      // Adicionar mensagem ao ticket existente
      await prisma.ticketMessage.create({
        data: {
          ticketId: recentTicket.id,
          content: message,
          authorId,
          authorName: senderName || phone,
          authorRole: 'CLIENT',
          isInternal: false,
        },
      });
      await prisma.whatsAppLog.update({
        where: { id: log.id },
        data: { ticketId: recentTicket.id },
      });
      console.log(`[WhatsApp] Mensagem adicionada ao ticket #${recentTicket.number}`);
    } else {
      // Criar novo ticket
      await createTicketFromWhatsApp(phone, message, senderName, log.id);
    }

    return NextResponse.json({ status: 'received' });
  } catch (error) {
    console.error('[WhatsApp Webhook] Error:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}

// GET para verificação de webhook (Meta requer)
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token) {
    // Validar token contra config do tenant
    const integration = await prisma.whatsAppIntegration.findFirst({
      where: { webhookSecret: token, status: 'active' },
    });
    if (integration) {
      return new NextResponse(challenge || 'OK', { status: 200 });
    }
    return NextResponse.json({ error: 'Token inválido' }, { status: 403 });
  }

  return NextResponse.json({ status: 'WhatsApp Webhook endpoint ativo' });
}
