import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { clearEmailConfigCache } from '@/lib/notifications';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG_KEY = 'main';

// GET - Buscar configurações de email
export async function GET() {
  try {
    const session = await getSession();
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acesso não autorizado' },
        { status: 403 }
      );
    }

    let config = await prisma.emailConfig.findUnique({
      where: { key: DEFAULT_CONFIG_KEY },
    });

    // Se não existir, criar configuração padrão
    if (!config) {
      config = await prisma.emailConfig.create({
        data: {
          key: DEFAULT_CONFIG_KEY,
          supportEmail: 'chamados@wticorp.com.br',
          supportPhone: '5511986810480',
          smtpHost: 'smtp.office365.com',
          smtpPort: 587,
          smtpUser: null,
          smtpPass: null,
          smtpSecure: false,
          smtpFrom: null,
          smtpFromName: 'Winner Tecnologia',
          imapEnabled: false,
          imapHost: 'outlook.office365.com',
          imapPort: 993,
          imapUser: null,
          imapPass: null,
          imapSecure: true,
          imapFolder: 'INBOX',
          imapProcessed: 'Processed',
          notifyNewTicket: true,
          notifyTicketUpdate: true,
          notifyNewMessage: true,
          notifySLAWarning: true,
          notifyTicketResolved: true,
          notifyTicketClosed: true,
          notifyClientNewMessage: true,
          notifyClientStatusChange: true,
        },
      });
    }

    // Não retornar as senhas completas por segurança, apenas indicar se existem
    const response = {
      ...config,
      smtpPass: config.smtpPass ? '••••••••' : null,
      hasPassword: !!config.smtpPass,
      imapPass: config.imapPass ? '••••••••' : null,
      hasImapPassword: !!config.imapPass,
      graphClientSecret: config.graphClientSecret ? '••••••••' : null,
      hasGraphSecret: !!config.graphClientSecret,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching email config:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar configurações' },
      { status: 500 }
    );
  }
}

// PATCH - Atualizar configurações de email
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Acesso não autorizado' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      supportEmail,
      supportPhone,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpSecure,
      smtpFrom,
      smtpFromName,
      imapEnabled,
      imapHost,
      imapPort,
      imapUser,
      imapPass,
      imapSecure,
      imapFolder,
      imapProcessed,
      // Microsoft Graph API
      graphEnabled,
      graphTenantId,
      graphClientId,
      graphClientSecret,
      graphUserEmail,
      notifyNewTicket,
      notifyTicketUpdate,
      notifyNewMessage,
      notifySLAWarning,
      notifyTicketResolved,
      notifyTicketClosed,
      notifyClientNewMessage,
      notifyClientStatusChange,
    } = body;

    // Validar email
    if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
      return NextResponse.json(
        { error: 'Email inválido' },
        { status: 400 }
      );
    }

    // Validar telefone (formato brasileiro)
    if (supportPhone && !/^\d{10,13}$/.test(supportPhone.replace(/\D/g, ''))) {
      return NextResponse.json(
        { error: 'Telefone inválido. Use formato: 5511986810480' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    
    // Campos de contato
    if (supportEmail !== undefined) updateData.supportEmail = supportEmail;
    if (supportPhone !== undefined) updateData.supportPhone = supportPhone?.replace(/\D/g, '') || null;
    
    // Campos SMTP
    if (smtpHost !== undefined) updateData.smtpHost = smtpHost || null;
    if (smtpPort !== undefined) updateData.smtpPort = smtpPort || 587;
    if (smtpUser !== undefined) updateData.smtpUser = smtpUser || null;
    // Apenas atualizar senha se não for o placeholder
    if (smtpPass !== undefined && smtpPass !== '••••••••') {
      updateData.smtpPass = smtpPass || null;
    }
    if (smtpSecure !== undefined) updateData.smtpSecure = smtpSecure;
    if (smtpFrom !== undefined) updateData.smtpFrom = smtpFrom || null;
    if (smtpFromName !== undefined) updateData.smtpFromName = smtpFromName || 'Winner Tecnologia';
    
    // Campos IMAP
    if (imapEnabled !== undefined) updateData.imapEnabled = imapEnabled;
    if (imapHost !== undefined) updateData.imapHost = imapHost || null;
    if (imapPort !== undefined) updateData.imapPort = imapPort || 993;
    if (imapUser !== undefined) updateData.imapUser = imapUser || null;
    // Apenas atualizar senha IMAP se não for o placeholder
    if (imapPass !== undefined && imapPass !== '••••••••') {
      updateData.imapPass = imapPass || null;
    }
    if (imapSecure !== undefined) updateData.imapSecure = imapSecure;
    if (imapFolder !== undefined) updateData.imapFolder = imapFolder || 'INBOX';
    if (imapProcessed !== undefined) updateData.imapProcessed = imapProcessed || 'Processed';
    
    // Campos Microsoft Graph API
    if (graphEnabled !== undefined) updateData.graphEnabled = graphEnabled;
    if (graphTenantId !== undefined) updateData.graphTenantId = graphTenantId?.trim() || null;
    if (graphClientId !== undefined) updateData.graphClientId = graphClientId?.trim() || null;
    // Apenas atualizar secret se não for o placeholder mascarado
    if (graphClientSecret !== undefined && !/^•+$/.test(graphClientSecret || '')) {
      updateData.graphClientSecret = graphClientSecret?.trim() || null;
    }
    if (graphUserEmail !== undefined) updateData.graphUserEmail = graphUserEmail?.trim()?.toLowerCase() || null;
    
    // Campos de notificação
    if (notifyNewTicket !== undefined) updateData.notifyNewTicket = notifyNewTicket;
    if (notifyTicketUpdate !== undefined) updateData.notifyTicketUpdate = notifyTicketUpdate;
    if (notifyNewMessage !== undefined) updateData.notifyNewMessage = notifyNewMessage;
    if (notifySLAWarning !== undefined) updateData.notifySLAWarning = notifySLAWarning;
    if (notifyTicketResolved !== undefined) updateData.notifyTicketResolved = notifyTicketResolved;
    if (notifyTicketClosed !== undefined) updateData.notifyTicketClosed = notifyTicketClosed;
    if (notifyClientNewMessage !== undefined) updateData.notifyClientNewMessage = notifyClientNewMessage;
    if (notifyClientStatusChange !== undefined) updateData.notifyClientStatusChange = notifyClientStatusChange;

    const config = await prisma.emailConfig.upsert({
      where: { key: DEFAULT_CONFIG_KEY },
      update: updateData,
      create: {
        key: DEFAULT_CONFIG_KEY,
        supportEmail: supportEmail || 'chamados@wticorp.com.br',
        supportPhone: supportPhone?.replace(/\D/g, '') || '5511986810480',
        smtpHost: smtpHost || 'smtp.office365.com',
        smtpPort: smtpPort || 587,
        smtpSecure: smtpSecure ?? false,
        smtpFromName: smtpFromName || 'Winner Tecnologia',
        imapEnabled: imapEnabled ?? false,
        imapHost: imapHost || 'outlook.office365.com',
        imapPort: imapPort || 993,
        imapSecure: imapSecure ?? true,
        imapFolder: imapFolder || 'INBOX',
        imapProcessed: imapProcessed || 'Processed',
        ...updateData,
      },
    });

    // Limpar cache de configurações
    clearEmailConfigCache();

    // Não retornar as senhas
    const response = {
      ...config,
      smtpPass: config.smtpPass ? '••••••••' : null,
      hasPassword: !!config.smtpPass,
      imapPass: config.imapPass ? '••••••••' : null,
      hasImapPassword: !!config.imapPass,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error updating email config:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar configurações' },
      { status: 500 }
    );
  }
}
