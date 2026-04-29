// Serviço de Notificações por Email
import { prisma } from '@/lib/db';
import nodemailer from 'nodemailer';
import { getGraphAccessToken, sendEmail as sendEmailViaGraphAPI } from '@/lib/microsoft-graph';

interface NotificationParams {
  notificationId?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

interface EmailConfigData {
  supportEmail: string;
  supportPhone: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpSecure: boolean;
  smtpFrom: string | null;
  smtpFromName: string | null;
  notifyNewTicket: boolean;
  notifyTicketUpdate: boolean;
  notifyNewMessage: boolean;
  notifySLAWarning: boolean;
  notifyTicketResolved: boolean;
  notifyTicketClosed: boolean;
  notifyClientNewMessage: boolean;
  notifyClientStatusChange: boolean;
  // Template de Resposta
  templateLogoUrl: string | null;
  templateCompanyName: string | null;
  templatePrimaryColor: string | null;
  templateSecondaryColor: string | null;
  templateFooterText: string | null;
  templateSignatureTitle: string | null;
  templateContactInfo: string | null;
  templateShowTicketNumber: boolean;
  templateShowTechName: boolean;
}

// Cache para configurações de email (evitar muitas consultas ao banco)
let emailConfigCache: EmailConfigData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minuto

export async function getEmailConfig(): Promise<EmailConfigData> {
  const now = Date.now();
  
  // Retornar cache se ainda válido
  if (emailConfigCache && (now - cacheTimestamp) < CACHE_TTL) {
    return emailConfigCache;
  }

  try {
    const config = await prisma.emailConfig.findUnique({
      where: { key: 'main' },
    });

    if (config) {
      emailConfigCache = {
        supportEmail: config.supportEmail,
        supportPhone: config.supportPhone,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUser: config.smtpUser,
        smtpPass: config.smtpPass,
        smtpSecure: config.smtpSecure,
        smtpFrom: config.smtpFrom,
        smtpFromName: config.smtpFromName,
        notifyNewTicket: config.notifyNewTicket,
        notifyTicketUpdate: config.notifyTicketUpdate,
        notifyNewMessage: config.notifyNewMessage,
        notifySLAWarning: config.notifySLAWarning,
        notifyTicketResolved: config.notifyTicketResolved,
        notifyTicketClosed: config.notifyTicketClosed,
        notifyClientNewMessage: config.notifyClientNewMessage,
        notifyClientStatusChange: config.notifyClientStatusChange,
        // Template de Resposta
        templateLogoUrl: config.templateLogoUrl,
        templateCompanyName: config.templateCompanyName,
        templatePrimaryColor: config.templatePrimaryColor,
        templateSecondaryColor: config.templateSecondaryColor,
        templateFooterText: config.templateFooterText,
        templateSignatureTitle: config.templateSignatureTitle,
        templateContactInfo: config.templateContactInfo,
        templateShowTicketNumber: config.templateShowTicketNumber,
        templateShowTechName: config.templateShowTechName,
      };
      cacheTimestamp = now;
      return emailConfigCache;
    }
  } catch (error) {
    console.error('Error fetching email config:', error);
  }

  // Configurações padrão
  return {
    supportEmail: 'chamados@wticorp.com.br',
    supportPhone: '5511986810480',
    smtpHost: null,
    smtpPort: 587,
    smtpUser: null,
    smtpPass: null,
    smtpSecure: false,
    smtpFrom: null,
    smtpFromName: 'Winner Tecnologia',
    notifyNewTicket: true,
    notifyTicketUpdate: true,
    notifyNewMessage: true,
    notifySLAWarning: true,
    notifyTicketResolved: true,
    notifyTicketClosed: true,
    notifyClientNewMessage: true,
    notifyClientStatusChange: true,
    // Template padrão
    templateLogoUrl: null,
    templateCompanyName: 'Winner Tecnologia',
    templatePrimaryColor: '#3B82F6',
    templateSecondaryColor: '#FF6B35',
    templateFooterText: 'Atenciosamente,',
    templateSignatureTitle: 'Equipe de Suporte',
    templateContactInfo: null,
    templateShowTicketNumber: true,
    templateShowTechName: true,
  };
}

// Limpar cache quando configurações forem atualizadas
export function clearEmailConfigCache() {
  emailConfigCache = null;
  cacheTimestamp = 0;
}

// Enviar email via SMTP (Nodemailer)
async function sendEmailViaSMTP(config: EmailConfigData, params: NotificationParams): Promise<boolean> {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    console.log('SMTP não configurado, pulando envio de email');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 587,
      secure: config.smtpSecure, // true para 465, false para 587
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      tls: {
        // Para Exchange/Office 365
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });

    const fromEmail = config.smtpFrom || config.smtpUser;
    const fromName = config.smtpFromName || 'Winner Tecnologia';

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.recipientEmail,
      subject: params.subject,
      html: params.isHtml !== false ? params.body : undefined,
      text: params.isHtml === false ? params.body : undefined,
    });

    console.log(`Email enviado para ${params.recipientEmail}`);
    return true;
  } catch (error) {
    console.error('Erro ao enviar email via SMTP:', error);
    return false;
  }
}

// Enviar email via API Abacus (fallback)
async function sendEmailViaAbacus(params: NotificationParams): Promise<boolean> {
  const { notificationId, recipientEmail, subject, body, isHtml = true } = params;

  if (!process.env.ABACUSAI_API_KEY || !notificationId) {
    console.log('API Abacus não configurada');
    return false;
  }

  try {
    const appUrl = process.env.NEXTAUTH_URL || '';
    const appName = 'Winner Tecnologia';
    const senderEmail = appUrl ? `noreply@${new URL(appUrl).hostname}` : 'noreply@mail.abacusai.app';

    const response = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: notificationId,
        subject,
        body,
        is_html: isHtml,
        recipient_email: recipientEmail,
        sender_email: senderEmail,
        sender_alias: appName,
      }),
    });

    const result = await response.json();
    
    if (!result.success) {
      if (result.notification_disabled) {
        console.log(`Notification ${notificationId} disabled by user`);
        return true;
      }
      console.error('Failed to send notification:', result.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending notification via Abacus:', error);
    return false;
  }
}

// Enviar email via Microsoft Graph API
async function sendEmailViaGraph(params: NotificationParams): Promise<boolean> {
  try {
    const emailConfig = await prisma.emailConfig.findUnique({
      where: { key: 'main' },
    });

    if (!emailConfig?.graphEnabled || !emailConfig.graphTenantId || 
        !emailConfig.graphClientId || !emailConfig.graphClientSecret || 
        !emailConfig.graphUserEmail) {
      console.log('[Notificação] Graph API não configurado para envio');
      return false;
    }

    const graphConfig = {
      tenantId: emailConfig.graphTenantId.trim(),
      clientId: emailConfig.graphClientId.trim(),
      clientSecret: emailConfig.graphClientSecret.trim(),
      userEmail: emailConfig.graphUserEmail.trim().toLowerCase(),
    };

    const tokenResult = await getGraphAccessToken(graphConfig);
    if (!tokenResult.token) {
      console.error('[Notificação] Erro ao obter token Graph:', tokenResult.error);
      return false;
    }

    const success = await sendEmailViaGraphAPI(
      tokenResult.token,
      graphConfig.userEmail,
      params.recipientEmail,
      params.subject,
      params.body
    );

    if (success) {
      console.log(`[Notificação] Email enviado via Graph API para ${params.recipientEmail}`);
    } else {
      console.error(`[Notificação] Falha ao enviar email via Graph API para ${params.recipientEmail}`);
    }

    return success;
  } catch (error) {
    console.error('[Notificação] Erro ao enviar email via Graph:', error);
    return false;
  }
}

export async function sendNotificationEmail(params: NotificationParams): Promise<boolean> {
  const config = await getEmailConfig();
  
  // 1. Tentar enviar via Microsoft Graph API (preferido - usa chamados@wticorp.com.br)
  const graphSent = await sendEmailViaGraph(params);
  if (graphSent) return true;
  
  // 2. Tentar enviar via SMTP
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    const smtpSent = await sendEmailViaSMTP(config, params);
    if (smtpSent) return true;
  }
  
  // 3. Fallback para API Abacus
  console.log('[Notificação] Tentando fallback via API Abacus...');
  return sendEmailViaAbacus(params);
}

// Função auxiliar para enviar notificação de novo chamado
export async function notifyNewTicket(data: {
  ticketNumber: number;
  subject: string;
  description: string;
  priority: string;
  creatorName: string;
  creatorEmail: string;
  companyName: string;
  ticketUrl: string;
}): Promise<boolean> {
  const config = await getEmailConfig();
  
  if (!config.notifyNewTicket) {
    console.log('Notificação de novo chamado desativada');
    return true;
  }

  return sendNotificationEmail({
    notificationId: process.env.NOTIF_ID_NOVO_CHAMADO || process.env.NOTIF_ID_NOVO_CHAMADO_CRIADO || '',
    recipientEmail: config.supportEmail,
    subject: `🎫 Novo Chamado #${data.ticketNumber} - ${data.subject}`,
    body: getNewTicketEmailTemplate(data),
  });
}

// Função auxiliar para enviar notificação de atualização de status
export async function notifyStatusChange(data: {
  ticketNumber: number;
  subject: string;
  oldStatus: string;
  newStatus: string;
  updatedBy: string;
  ticketUrl: string;
  clientEmail: string;
}): Promise<boolean> {
  const config = await getEmailConfig();
  
  // Notificar cliente sobre mudança de status
  if (config.notifyClientStatusChange) {
    // Verificar se é resolução ou fechamento
    const isResolved = data.newStatus === 'RESOLVED';
    const isClosed = data.newStatus === 'CLOSED';
    
    if ((isResolved && config.notifyTicketResolved) || 
        (isClosed && config.notifyTicketClosed) || 
        (!isResolved && !isClosed && config.notifyTicketUpdate)) {
      await sendNotificationEmail({
        notificationId: process.env.NOTIF_ID_ATUALIZAO_DE_CHAMADO || '',
        recipientEmail: data.clientEmail,
        subject: `📋 Chamado #${data.ticketNumber} - Status Atualizado`,
        body: getTicketUpdateEmailTemplate(data),
      });
    }
  }

  return true;
}

// Função auxiliar para enviar notificação de nova mensagem
export async function notifyNewMessage(data: {
  ticketNumber: number;
  subject: string;
  message: string;
  authorName: string;
  ticketUrl: string;
  recipientEmail: string;
  recipientName?: string;
  isFromClient: boolean;
}): Promise<boolean> {
  const config = await getEmailConfig();
  
  // Se for mensagem do cliente, notificar suporte
  if (data.isFromClient) {
    if (!config.notifyNewMessage) {
      console.log('Notificação de nova mensagem desativada');
      return true;
    }
    return sendNotificationEmail({
      notificationId: process.env.NOTIF_ID_NOVA_MENSAGEM_NO_CHAMADO || '',
      recipientEmail: config.supportEmail,
      subject: `💬 Nova Mensagem - Chamado #${data.ticketNumber}`,
      body: getNewMessageEmailTemplate(data),
    });
  } else {
    // Mensagem do suporte para o cliente - usa template configurável
    if (!config.notifyClientNewMessage) {
      console.log('Notificação de resposta para cliente desativada');
      return true;
    }
    return sendNotificationEmail({
      notificationId: process.env.NOTIF_ID_NOVA_MENSAGEM_NO_CHAMADO || '',
      recipientEmail: data.recipientEmail,
      subject: `💬 Resposta - Chamado #${data.ticketNumber}`,
      body: getClientResponseEmailTemplate({
        ...data,
        config,
      }),
    });
  }
}

// Função auxiliar para enviar alerta de SLA
export async function notifySLAWarning(data: {
  ticketNumber: number;
  subject: string;
  priority: string;
  dueDate: string;
  hoursRemaining: number;
  ticketUrl: string;
}): Promise<boolean> {
  const config = await getEmailConfig();
  
  if (!config.notifySLAWarning) {
    console.log('Alerta de SLA desativado');
    return true;
  }

  return sendNotificationEmail({
    notificationId: process.env.NOTIF_ID_ALERTA_DE_SLA || process.env.NOTIF_ID_ALERTA_SLA || '',
    recipientEmail: config.supportEmail,
    subject: `⚠️ Alerta SLA - Chamado #${data.ticketNumber}`,
    body: getSLAAlertEmailTemplate(data),
  });
}

// Templates de Email

export function getNewTicketEmailTemplate(data: {
  ticketNumber: number;
  subject: string;
  description: string;
  priority: string;
  creatorName: string;
  creatorEmail: string;
  companyName: string;
  ticketUrl: string;
}): string {
  const priorityColors: Record<string, string> = {
    LOW: '#22C55E',
    MEDIUM: '#F59E0B',
    HIGH: '#EF4444',
    CRITICAL: '#DC2626',
  };

  const priorityLabels: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
      <div style="background: linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🎫 Novo Chamado #${data.ticketNumber}</h1>
      </div>
      <div style="padding: 30px; background: white;">
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <span style="background: ${priorityColors[data.priority]}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            ${priorityLabels[data.priority]}
          </span>
        </div>
        
        <h2 style="color: #1e293b; margin: 0 0 10px 0;">${data.subject}</h2>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #3B82F6; margin: 20px 0;">
          <p style="color: #64748b; margin: 0; white-space: pre-wrap;">${data.description.substring(0, 500)}${data.description.length > 500 ? '...' : ''}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
              <strong style="color: #64748b;">Cliente:</strong>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
              ${data.creatorName}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
              <strong style="color: #64748b;">Email:</strong>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
              <a href="mailto:${data.creatorEmail}" style="color: #3B82F6;">${data.creatorEmail}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
              <strong style="color: #64748b;">Empresa:</strong>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
              ${data.companyName}
            </td>
          </tr>
        </table>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${data.ticketUrl}" style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Ver Chamado
          </a>
        </div>
      </div>
      <div style="background: #1e293b; padding: 20px; text-align: center;">
        <p style="color: #94a3b8; margin: 0; font-size: 12px;">
          Winner Tecnologia - Sistema de Chamados
        </p>
      </div>
    </div>
  `;
}

export function getTicketUpdateEmailTemplate(data: {
  ticketNumber: number;
  subject: string;
  oldStatus: string;
  newStatus: string;
  updatedBy: string;
  ticketUrl: string;
}): string {
  const statusColors: Record<string, string> = {
    OPEN: '#3B82F6',
    IN_PROGRESS: '#F59E0B',
    RESOLVED: '#22C55E',
    CLOSED: '#6B7280',
  };

  const statusLabels: Record<string, string> = {
    OPEN: 'Aberto',
    IN_PROGRESS: 'Em Andamento',
    RESOLVED: 'Resolvido',
    CLOSED: 'Fechado',
  };

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
      <div style="background: linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">📋 Atualização do Chamado #${data.ticketNumber}</h1>
      </div>
      <div style="padding: 30px; background: white;">
        <h2 style="color: #1e293b; margin: 0 0 20px 0;">${data.subject}</h2>
        
        <div style="text-align: center; margin: 30px 0;">
          <table style="margin: 0 auto;">
            <tr>
              <td style="padding: 0 10px;">
                <span style="background: ${statusColors[data.oldStatus]}; color: white; padding: 8px 16px; border-radius: 6px; font-weight: bold; display: inline-block;">
                  ${statusLabels[data.oldStatus]}
                </span>
              </td>
              <td style="padding: 0 10px; font-size: 24px;">→</td>
              <td style="padding: 0 10px;">
                <span style="background: ${statusColors[data.newStatus]}; color: white; padding: 8px 16px; border-radius: 6px; font-weight: bold; display: inline-block;">
                  ${statusLabels[data.newStatus]}
                </span>
              </td>
            </tr>
          </table>
        </div>
        
        <p style="color: #64748b; text-align: center;">Atualizado por: <strong>${data.updatedBy}</strong></p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${data.ticketUrl}" style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Ver Chamado
          </a>
        </div>
      </div>
      <div style="background: #1e293b; padding: 20px; text-align: center;">
        <p style="color: #94a3b8; margin: 0; font-size: 12px;">
          Winner Tecnologia - Sistema de Chamados
        </p>
      </div>
    </div>
  `;
}

export function getNewMessageEmailTemplate(data: {
  ticketNumber: number;
  subject: string;
  message: string;
  authorName: string;
  ticketUrl: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
      <div style="background: linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">💬 Nova Mensagem - Chamado #${data.ticketNumber}</h1>
      </div>
      <div style="padding: 30px; background: white;">
        <h2 style="color: #1e293b; margin: 0 0 20px 0;">${data.subject}</h2>
        
        <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 10px 0;">
            <strong>${data.authorName}</strong> escreveu:
          </p>
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #3B82F6;">
            <p style="color: #1e293b; margin: 0; white-space: pre-wrap;">${data.message}</p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${data.ticketUrl}" style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Responder
          </a>
        </div>
      </div>
      <div style="background: #1e293b; padding: 20px; text-align: center;">
        <p style="color: #94a3b8; margin: 0; font-size: 12px;">
          Winner Tecnologia - Sistema de Chamados
        </p>
      </div>
    </div>
  `;
}

// Template configurável para respostas ao cliente
export function getClientResponseEmailTemplate(data: {
  ticketNumber: number;
  subject: string;
  message: string;
  authorName: string;
  ticketUrl: string;
  recipientName?: string;
  config: EmailConfigData;
}): string {
  const { config } = data;
  const primaryColor = config.templatePrimaryColor || '#3B82F6';
  const secondaryColor = config.templateSecondaryColor || '#FF6B35';
  const companyName = config.templateCompanyName || 'Winner Tecnologia';
  const footerText = config.templateFooterText || 'Atenciosamente,';
  const signatureTitle = config.templateSignatureTitle || 'Equipe de Suporte';
  const showTicketNumber = config.templateShowTicketNumber !== false;
  const showTechName = config.templateShowTechName !== false;
  
  // Gerar iniciais do técnico
  const techInitials = data.authorName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
      <!-- Header com Logo e Número do Chamado -->
      <div style="background: ${primaryColor}; padding: 24px 30px; color: white;">
        <table style="width: 100%;">
          <tr>
            <td style="vertical-align: middle;">
              ${config.templateLogoUrl ? `
                <img src="${config.templateLogoUrl}" alt="${companyName}" style="height: 48px; width: auto;" />
              ` : `
                <div style="font-size: 24px; font-weight: bold;">${companyName}</div>
              `}
              <div style="font-size: 14px; opacity: 0.9; margin-top: 4px;">Sistema de Suporte</div>
            </td>
            ${showTicketNumber ? `
              <td style="text-align: right; vertical-align: middle;">
                <div style="font-size: 12px; opacity: 0.8;">Chamado</div>
                <div style="font-size: 28px; font-weight: bold;">#${data.ticketNumber}</div>
              </td>
            ` : ''}
          </tr>
        </table>
      </div>

      <!-- Corpo do Email -->
      <div style="padding: 30px; background: white;">
        <div style="margin-bottom: 20px;">
          <span style="background: ${secondaryColor}; color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">
            Nova Resposta
          </span>
        </div>
        
        <p style="color: #374151; font-size: 15px; margin: 0 0 20px 0;">
          Olá${data.recipientName ? ` <strong>${data.recipientName}</strong>` : ''},
        </p>
        
        <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px; border-left: 4px solid ${primaryColor};">
          <p style="color: #4b5563; margin: 0; white-space: pre-wrap; line-height: 1.6; font-size: 14px;">${data.message}</p>
        </div>

        <!-- Assinatura do Técnico -->
        <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 24px;">
          <p style="color: #6b7280; margin: 0 0 12px 0; font-size: 14px;">${footerText}</p>
          <table>
            <tr>
              <td style="vertical-align: middle; padding-right: 12px;">
                <div style="width: 44px; height: 44px; background: ${primaryColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; text-align: center; line-height: 44px;">
                  ${techInitials}
                </div>
              </td>
              <td style="vertical-align: middle;">
                ${showTechName ? `<div style="font-weight: 600; color: #1f2937; font-size: 15px;">${data.authorName}</div>` : ''}
                <div style="color: #6b7280; font-size: 13px;">${signatureTitle}</div>
              </td>
            </tr>
          </table>
          ${config.templateContactInfo ? `
            <p style="color: #9ca3af; font-size: 12px; margin: 16px 0 0 0;">${config.templateContactInfo}</p>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${data.ticketUrl}" style="background: ${primaryColor}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; font-size: 14px;">
            Ver Chamado Completo
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #1f2937; padding: 20px 30px; text-align: center;">
        <p style="color: #9ca3af; margin: 0; font-size: 12px;">
          © ${new Date().getFullYear()} ${companyName}. Todos os direitos reservados.
        </p>
        <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 11px;">
          Este email foi enviado automaticamente pelo sistema de suporte.
        </p>
      </div>
    </div>
  `;
}

export function getSLAAlertEmailTemplate(data: {
  ticketNumber: number;
  subject: string;
  priority: string;
  dueDate: string;
  hoursRemaining: number;
  ticketUrl: string;
}): string {
  const priorityLabels: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
  };

  const alertColor = data.hoursRemaining <= 0 ? '#DC2626' : data.hoursRemaining <= 2 ? '#F59E0B' : '#3B82F6';
  const alertText = data.hoursRemaining <= 0 ? 'SLA VENCIDO!' : `Vence em ${data.hoursRemaining}h`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
      <div style="background: ${alertColor}; padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Alerta SLA - Chamado #${data.ticketNumber}</h1>
      </div>
      <div style="padding: 30px; background: white;">
        <div style="background: ${alertColor}15; border: 2px solid ${alertColor}; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
          <span style="color: ${alertColor}; font-size: 18px; font-weight: bold;">
            ${alertText}
          </span>
        </div>
        
        <h2 style="color: #1e293b; margin: 0 0 20px 0;">${data.subject}</h2>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
              <strong style="color: #64748b;">Prioridade:</strong>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
              ${priorityLabels[data.priority]}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
              <strong style="color: #64748b;">Prazo:</strong>
            </td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
              ${data.dueDate}
            </td>
          </tr>
        </table>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${data.ticketUrl}" style="background: ${alertColor}; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Atender Agora
          </a>
        </div>
      </div>
      <div style="background: #1e293b; padding: 20px; text-align: center;">
        <p style="color: #94a3b8; margin: 0; font-size: 12px;">
          Winner Tecnologia - Sistema de Chamados
        </p>
      </div>
    </div>
  `;
}
