// Microsoft Graph API Integration for Email Processing
import { prisma } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  userEmail: string;
}

interface EmailMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: string;
    content: string;
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  ccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  receivedDateTime: string;
  isRead: boolean;
  conversationId: string;
  hasAttachments?: boolean;
}

interface GraphAttachment {
  id: string;
  '@odata.type'?: string;
  name: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string;
  contentBytes?: string; // base64 (FileAttachment)
}

interface ProcessedEmailResult {
  success: boolean;
  ticketId?: string;
  ticketNumber?: number;
  error?: string;
  isReply?: boolean;
}

interface TokenError {
  error: string;
  error_description: string;
  error_codes?: number[];
  timestamp?: string;
  trace_id?: string;
  correlation_id?: string;
}

// Obter token de acesso do Microsoft Graph
export async function getGraphAccessToken(config: GraphConfig): Promise<{ token: string | null; error?: string }> {
  try {
    const tenantId = config.tenantId.trim();
    const clientId = config.clientId.trim();
    const clientSecret = config.clientSecret.trim();
    
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    console.log(`[Graph Auth] Requesting token for tenant=${tenantId}, clientId=${clientId}, secretLength=${clientSecret.length}, email=${config.userEmail}`);
    
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Graph token error response:', errorText);
      
      try {
        const errorData: TokenError = JSON.parse(errorText);
        let errorMessage = errorData.error_description || errorData.error || 'Erro desconhecido';
        
        // Traduzir erros comuns
        if (errorData.error === 'invalid_client') {
          errorMessage = 'Client ID ou Client Secret inválido. Verifique as credenciais no Azure Portal.';
        } else if (errorData.error === 'invalid_request') {
          errorMessage = 'Requisição inválida. Verifique o Tenant ID.';
        } else if (errorData.error === 'unauthorized_client') {
          errorMessage = 'Cliente não autorizado. Verifique se as permissões de aplicativo foram concedidas pelo administrador.';
        } else if (errorData.error === 'invalid_scope') {
          errorMessage = 'Escopo inválido. Configure as permissões Mail.Read e Mail.Send no Azure Portal.';
        }
        
        return { token: null, error: errorMessage };
      } catch {
        return { token: null, error: `Erro HTTP ${response.status}: ${errorText}` };
      }
    }

    const data = await response.json();
    return { token: data.access_token };
  } catch (error) {
    console.error('Error getting Graph token:', error);
    return { 
      token: null, 
      error: `Erro de conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
    };
  }
}

// Listar emails não lidos
export async function getUnreadEmails(
  accessToken: string,
  userEmail: string,
  maxResults: number = 50
): Promise<EmailMessage[]> {
  try {
    const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages?$filter=isRead eq false&$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,isRead,conversationId,hasAttachments`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Graph get emails error:', error);
      return [];
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('Error getting emails:', error);
    return [];
  }
}

// Marcar email como lido
export async function markEmailAsRead(
  accessToken: string,
  userEmail: string,
  messageId: string
): Promise<boolean> {
  try {
    const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${messageId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error marking email as read:', error);
    return false;
  }
}

// ==================================================================
// Buscar anexos de um email e salvar no S3 + criar TicketAttachment
// ==================================================================
export async function getEmailAttachments(
  accessToken: string,
  userEmail: string,
  messageId: string,
): Promise<GraphAttachment[]> {
  try {
    const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${messageId}/attachments?$top=50`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const error = await response.text();
      console.error('[Graph] getEmailAttachments error:', error);
      return [];
    }
    const data = await response.json();
    return (data.value || []) as GraphAttachment[];
  } catch (error) {
    console.error('[Graph] getEmailAttachments exception:', error);
    return [];
  }
}

/**
 * Salva os anexos de um email (Microsoft Graph) no S3 e cria
 * registros TicketAttachment associados ao ticket informado.
 *
 * - Ignora anexos inline (conteudo embutido em imagens ja vem no HTML).
 * - Gera uma key S3 unica com prefixo do tenant (AWS_FOLDER_PREFIX).
 * - Em caso de erro parcial, continua com os outros anexos.
 */
export async function saveEmailAttachmentsToTicket(
  accessToken: string,
  userEmail: string,
  messageId: string,
  ticketId: string,
  uploader: { id: string; name: string },
): Promise<{ saved: number; cidMap: Record<string, string> }> {
  const attachments = await getEmailAttachments(accessToken, userEmail, messageId);
  if (!attachments.length) return { saved: 0, cidMap: {} };

  const storage = getStorageProvider();
  let saved = 0;
  const cidMap: Record<string, string> = {}; // cid -> URL

  for (const att of attachments) {
    try {
      // So processamos FileAttachment (outros tipos sao reference/item)
      if (att['@odata.type'] !== '#microsoft.graph.fileAttachment' || !att.contentBytes) {
        continue;
      }

      const buffer = Buffer.from(att.contentBytes, 'base64');
      const safeName = (att.name || 'anexo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
      const contentType = att.contentType || 'application/octet-stream';

      // Imagens explicitamente inline (marcadas pelo servidor): salvar e mapear CID para URL.
      // Não usamos contentType.startsWith('image/') como critério porque o Outlook/M365
      // inclui contentId em anexos de imagem normais (clipe 📎), o que causava anexos
      // sendo tratados como inline sem criar registros TicketAttachment.
      if (att.contentId && att.isInline) {
        const inlineName = `tickets/${ticketId}/inline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safeName}`;
        const { cloudStoragePath } = await storage.save(inlineName, buffer, contentType, true);
        const url = await storage.getUrl(cloudStoragePath, true);
        const cleanCid = att.contentId.replace(/^<|>$/g, '');
        cidMap[cleanCid] = url;
        continue;
      }

      // Anexo regular (inclui imagens com contentId mas isInline=false).
      // Se tem contentId, mapear CID para resolução no HTML (Gmail via M365).
      const fileName = `tickets/${ticketId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safeName}`;
      const { cloudStoragePath } = await storage.save(fileName, buffer, contentType, false);

      if (att.contentId) {
        const url = await storage.getUrl(cloudStoragePath, false);
        const cleanCid = att.contentId.replace(/^<|>$/g, '');
        cidMap[cleanCid] = url;
      }

      await prisma.ticketAttachment.create({
        data: {
          fileName: att.name || safeName,
          fileSize: att.size || buffer.length,
          fileType: contentType,
          cloudStoragePath,
          isPublic: false,
          ticketId,
          uploadedById: uploader.id,
          uploadedByName: uploader.name,
        },
      });
      saved++;
    } catch (err) {
      console.error('[Graph] erro ao salvar anexo', att?.name, err);
    }
  }

  if (saved > 0) {
    console.log(`[Graph] ${saved} anexo(s) salvo(s) no ticket ${ticketId}`);
  }
  if (Object.keys(cidMap).length > 0) {
    console.log(`[Graph] ${Object.keys(cidMap).length} imagem(ns) inline mapeada(s) para ticket ${ticketId}`);
  }
  return { saved, cidMap };
}

/**
 * Substitui referências cid: no HTML por URLs públicas.
 * Usado para exibir imagens inline de emails corretamente.
 */
export function replaceCidReferences(html: string, cidMap: Record<string, string>): string {
  if (!html || !cidMap || Object.keys(cidMap).length === 0) return html;
  let result = html;
  for (const [cid, url] of Object.entries(cidMap)) {
    // Substitui cid:xxx e cid:xxx (com ou sem < >)
    result = result.replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), url);
  }
  return result;
}

// Mover email para pasta
export async function moveEmailToFolder(
  accessToken: string,
  userEmail: string,
  messageId: string,
  folderName: string
): Promise<boolean> {
  try {
    // Primeiro, obter o ID da pasta de destino
    const foldersUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders?$filter=displayName eq '${folderName}'`;
    const foldersResponse = await fetch(foldersUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!foldersResponse.ok) {
      // Tentar criar a pasta se não existir
      const createFolderUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders`;
      const createResponse = await fetch(createFolderUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: folderName }),
      });
      
      if (!createResponse.ok) {
        console.error('Error creating folder');
        return false;
      }
    }

    const foldersData = await foldersResponse.json();
    const folder = foldersData.value?.[0];
    
    if (!folder) {
      // Criar pasta
      const createFolderUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders`;
      const createResponse = await fetch(createFolderUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: folderName }),
      });
      
      if (!createResponse.ok) {
        console.error('Error creating folder');
        return false;
      }
      
      const newFolder = await createResponse.json();
      
      // Mover email
      const moveUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${messageId}/move`;
      const moveResponse = await fetch(moveUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destinationId: newFolder.id }),
      });
      
      return moveResponse.ok;
    }

    // Mover email para pasta existente
    const moveUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${messageId}/move`;
    const moveResponse = await fetch(moveUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ destinationId: folder.id }),
    });

    return moveResponse.ok;
  } catch (error) {
    console.error('Error moving email:', error);
    return false;
  }
}

// Enviar email de resposta
export async function sendEmail(
  accessToken: string,
  userEmail: string,
  to: string,
  subject: string,
  htmlBody: string,
  attachments?: Array<{ filename: string; contentBase64: string; contentType?: string }>
): Promise<boolean> {
  try {
    const url = `https://graph.microsoft.com/v1.0/users/${userEmail}/sendMail`;

    const message: any = {
      subject,
      body: {
        contentType: 'HTML',
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    };

    if (attachments && attachments.length > 0) {
      message.attachments = attachments.map(a => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.contentType || 'application/octet-stream',
        contentBytes: a.contentBase64,
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    return response.ok || response.status === 202;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Determinar prioridade baseada no assunto
function determinePriority(subject: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const subjectLower = subject.toLowerCase();
  
  if (subjectLower.includes('urgente') || subjectLower.includes('crítico') || subjectLower.includes('emergência')) {
    return 'CRITICAL';
  }
  if (subjectLower.includes('importante') || subjectLower.includes('prioridade')) {
    return 'HIGH';
  }
  if (subjectLower.includes('dúvida') || subjectLower.includes('informação')) {
    return 'LOW';
  }
  return 'MEDIUM';
}

// Extrair número do ticket do assunto (padrões: [Ticket #123], #123, Chamado 123, Re: ... #123, etc)
function extractTicketNumber(subject: string): number | null {
  const patterns = [
    /\[Ticket\s*#?(\d+)\]/i,
    /\[Chamado\s*#?(\d+)\]/i,
    /Ticket\s*#?(\d+)/i,
    /Chamado\s*#?(\d+)/i,
    /Re:\s*.*#(\d+)/i,
    /#(\d+)\s*[-–]/,
    /Chamado\s*#(\d+)\s*criado/i,
  ];
  
  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

// Buscar ticket existente pelo conversationId do Graph
async function findTicketByConversationId(conversationId: string): Promise<string | null> {
  if (!conversationId) return null;
  
  // Buscar emails processados que tenham o mesmo conversationId em emails anteriores
  // O conversationId é salvo no campo messageId prefixado para identificação
  const processedEmail = await prisma.processedEmail.findFirst({
    where: {
      messageId: { startsWith: `conv:${conversationId}` },
      ticketId: { not: null },
    },
    select: { ticketId: true },
    orderBy: { processedAt: 'desc' },
  });
  
  return processedEmail?.ticketId || null;
}

// Reabrir ticket fechado e registrar histórico
async function reopenTicket(ticketId: string, reason: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true, reopenCount: true },
  });
  
  if (!ticket || (ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED')) return;
  
  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'OPEN',
        reopenedFlag: true,
        reopenedAt: new Date(),
        reopenCount: (ticket.reopenCount || 0) + 1,
        closedAt: null,
        resolvedAt: null,
        alertAssignee: true, // sempre alertar responsavel na reabertura
      },
    }),
    prisma.ticketHistory.create({
      data: {
        ticketId,
        action: 'reopened',
        fromValue: ticket.status,
        toValue: 'OPEN',
        note: reason,
        userId: 'system',
        userName: 'Sistema',
        userRole: 'ADMIN',
      },
    }),
  ]);
}

// Adicionar interação (mensagem) a um ticket existente
async function addInteractionToTicket(
  ticketId: string,
  content: string,
  authorId: string,
  authorName: string,
  authorRole: 'CLIENT' | 'SUPPORT' | 'ADMIN' | 'FINANCE',
  opts?: {
    contentHtmlRaw?: string | null;
    fromEmail?: string | null;
    fromName?: string | null;
    subject?: string | null;
    receivedAt?: Date | null;
    to?: string | null;
    cc?: string | null;
  },
): Promise<void> {
  let contentHtml: string | null = null;
  let bodyClean: string | null = null;
  let bodyQuoted: string | null = null;
  let bodyParseMethod: 'parsed' | 'raw' | 'fallback' = 'raw';

  try {
    const { sanitizeEmailHtmlAdvanced, generateEmailHeader } = await import('@/lib/email-sanitizer');
    const { parseEmailBody } = await import('@/lib/email-parser');
    if (opts?.contentHtmlRaw) {
      const parsed = parseEmailBody(opts.contentHtmlRaw, true);
      bodyClean = parsed.bodyClean || null;
      bodyQuoted = parsed.bodyQuoted || null;
      bodyParseMethod = parsed.bodyParseMethod as any;
      const header = generateEmailHeader({
        from: opts.fromEmail,
        fromName: opts.fromName,
        date: opts.receivedAt || new Date(),
        subject: opts.subject,
        to: opts.to || null,
        cc: opts.cc || null,
      });
      contentHtml = header + sanitizeEmailHtmlAdvanced(opts.contentHtmlRaw);
    } else if (content) {
      const parsed = parseEmailBody(content, false);
      bodyClean = parsed.bodyClean || null;
      bodyQuoted = parsed.bodyQuoted || null;
      bodyParseMethod = parsed.bodyParseMethod as any;
    }
  } catch (e) {
    console.error('[Graph] addInteraction parse/sanitize error:', e);
  }

  await prisma.ticketMessage.create({
    data: {
      ticketId,
      content,
      contentHtml,
      bodyClean,
      bodyQuoted,
      bodyParseMethod,
      isInternal: false,
      authorId,
      authorName,
      authorRole,
      visibleToClient: true,
    },
  });

  // Ativar alerta ao responsavel sempre que cliente responder via email
  // (bug corrigido: emails inbound nao estavam disparando alertAssignee)
  const ticketCurrent = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { assigneeId: true },
  });
  const updateData: any = { updatedAt: new Date() };
  if (authorRole === 'CLIENT' && ticketCurrent?.assigneeId) {
    updateData.alertAssignee = true;
  }
  await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
  });

  // Emitir evento client_reply para telemetria/toast em tempo real
  try {
    const { emitEvent } = await import('@/lib/events');
    emitEvent({
      type: 'client_reply',
      entityType: 'ticket',
      entityId: ticketId,
      severity: 'info',
      actorId: authorId,
      actorName: authorName || undefined,
      metadata: { source: 'microsoft-graph-inbox' },
    }).catch(() => {});
  } catch {}
}

// Extrair texto limpo do HTML
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calcular SLA baseado na prioridade
function calculateSLA(priority: string): { responseDue: Date; resolutionDue: Date } {
  const now = new Date();
  const responseDue = new Date(now);
  const resolutionDue = new Date(now);

  switch (priority) {
    case 'CRITICAL':
      responseDue.setHours(responseDue.getHours() + 1);
      resolutionDue.setHours(resolutionDue.getHours() + 4);
      break;
    case 'HIGH':
      responseDue.setHours(responseDue.getHours() + 2);
      resolutionDue.setHours(resolutionDue.getHours() + 8);
      break;
    case 'MEDIUM':
      responseDue.setHours(responseDue.getHours() + 4);
      resolutionDue.setHours(resolutionDue.getHours() + 24);
      break;
    default: // LOW
      responseDue.setHours(responseDue.getHours() + 8);
      resolutionDue.setHours(resolutionDue.getHours() + 48);
  }

  return { responseDue, resolutionDue };
}

// Processar um email: criar chamado novo OU adicionar interação a chamado existente
export async function processEmailToTicket(
  email: EmailMessage,
  accessToken: string,
  config: GraphConfig
): Promise<ProcessedEmailResult> {
  try {
    // Verificar se já foi processado pelo messageId real
    const existingProcessed = await prisma.processedEmail.findFirst({
      where: { messageId: email.id },
    });

    if (existingProcessed) {
      return { success: true, error: 'Email já processado anteriormente' };
    }

    const senderEmail = email.from.emailAddress.address.toLowerCase();
    const senderName = email.from.emailAddress.name || senderEmail;
    const subject = email.subject || 'Sem assunto';
    const bodyText = email.body.contentType === 'html' 
      ? extractTextFromHtml(email.body.content)
      : email.body.content;

    // Ignorar remetentes indesejados (Microsoft Outlook, Messaging, etc.)
    const IGNORED_SENDERS = ['microsoft outlook', 'messaging'];
    const senderNameLower = senderName.toLowerCase().trim();
    if (IGNORED_SENDERS.some(s => senderNameLower === s || senderNameLower.includes(s))) {
      await markEmailAsRead(accessToken, config.userEmail, email.id);
      await prisma.processedEmail.create({
        data: {
          messageId: email.id,
          fromEmail: senderEmail,
          subject,
          status: 'ignored',
        },
      });
      console.log(`🚫 Email ignorado (remetente bloqueado): "${senderName}" <${senderEmail}>`);
      return { success: true, error: `Email ignorado (remetente "${senderName}" na blocklist)` };
    }

    // Ignorar emails enviados pela própria caixa (respostas automáticas do sistema)
    if (senderEmail === config.userEmail.toLowerCase()) {
      // Marcar como lido e registrar como ignorado
      await markEmailAsRead(accessToken, config.userEmail, email.id);
      await prisma.processedEmail.create({
        data: {
          messageId: email.id,
          fromEmail: senderEmail,
          subject,
          status: 'ignored',
        },
      });
      return { success: true, error: 'Email ignorado (enviado pela própria caixa)' };
    }

    // Extrair domínio do email
    const emailDomain = senderEmail.split('@')[1];

    // ===== DETECTAR SE É RESPOSTA A CHAMADO EXISTENTE =====
    let existingTicketId: string | null = null;
    let existingTicketNumber: number | null = null;

    // 1. Buscar pelo número do chamado no assunto
    const ticketNumberFromSubject = extractTicketNumber(subject);
    if (ticketNumberFromSubject) {
      const existingTicket = await prisma.ticket.findUnique({
        where: { number: ticketNumberFromSubject },
        select: { id: true, number: true, status: true },
      });
      if (existingTicket) {
        existingTicketId = existingTicket.id;
        existingTicketNumber = existingTicket.number;
        console.log(`🔗 Email vinculado ao Chamado #${existingTicketNumber} (pelo assunto)`);
      }
    }

    // 2. Se não encontrou pelo assunto, buscar pelo conversationId do Graph
    if (!existingTicketId && email.conversationId) {
      existingTicketId = await findTicketByConversationId(email.conversationId);
      if (existingTicketId) {
        const ticket = await prisma.ticket.findUnique({
          where: { id: existingTicketId },
          select: { number: true },
        });
        existingTicketNumber = ticket?.number || null;
        console.log(`🔗 Email vinculado ao Chamado #${existingTicketNumber} (pelo conversationId)`);
      }
    }

    // Buscar ou criar usuário pelo email
    let user = await prisma.user.findUnique({
      where: { email: senderEmail },
      include: { company: true },
    });

    if (!user) {
      // Tentar encontrar empresa pelo domínio
      let company = await prisma.company.findUnique({
        where: { domain: emailDomain },
      });

      let isNewCompany = false;

      if (!company) {
        const companyNameFromDomain = emailDomain
          .split('.')[0]
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());

        company = await prisma.company.create({
          data: {
            name: companyNameFromDomain,
            domain: emailDomain,
            needsAttention: true,
          },
        });
        isNewCompany = true;
        console.log(`📢 Nova empresa criada: ${companyNameFromDomain} (${emailDomain})`);
      }

      user = await prisma.user.create({
        data: {
          email: senderEmail,
          name: senderName,
          password: '',
          role: 'CLIENT',
          companyId: company.id,
        },
        include: { company: true },
      });

      if (isNewCompany) {
        console.log(`👤 Novo usuário: ${senderName} (${senderEmail}) → ${company.name}`);
      }
    }

    // ===== SE É RESPOSTA A CHAMADO EXISTENTE: ADICIONAR INTERAÇÃO =====
    if (existingTicketId) {
      const existingTicket = await prisma.ticket.findUnique({
        where: { id: existingTicketId },
        select: { status: true, number: true },
      });

      if (existingTicket) {
        // Se ticket estava fechado ou resolvido, reabrir
        if (existingTicket.status === 'CLOSED' || existingTicket.status === 'RESOLVED') {
          await reopenTicket(existingTicketId, `Reaberto por resposta de email de ${senderEmail}`);
          console.log(`🔄 Chamado #${existingTicket.number} reaberto por resposta de ${senderEmail}`);
        }

        // Adicionar mensagem como interação
        const toAddrs = (email.toRecipients || []).map((r) => r.emailAddress.address).join(', ');
        const ccAddrs = (email.ccRecipients || []).map((r) => r.emailAddress.address).join(', ');
        await addInteractionToTicket(
          existingTicketId,
          bodyText || 'Resposta via email.',
          user.id,
          user.name,
          user.role as 'CLIENT' | 'SUPPORT' | 'ADMIN' | 'FINANCE',
          {
            contentHtmlRaw: email.body.contentType === 'html' ? email.body.content : null,
            fromEmail: senderEmail,
            fromName: senderName,
            subject,
            receivedAt: new Date(email.receivedDateTime),
            to: toAddrs || null,
            cc: ccAddrs || null,
          },
        );

        // Salvar anexos do email no S3 + TicketAttachment + resolver CID inline
        // NOTA: email.hasAttachments pode ser false mesmo com imagens inline (assinatura).
        // Verificamos também se o HTML contém referências cid: para garantir resolução.
        const replyHtmlRaw = email.body.contentType === 'html' ? (email.body.content || '') : '';
        const replyHasCidRefs = /src\s*=\s*["']cid:/i.test(replyHtmlRaw);
        if (email.hasAttachments || replyHasCidRefs) {
          try {
            const { saved, cidMap } = await saveEmailAttachmentsToTicket(
              accessToken,
              config.userEmail,
              email.id,
              existingTicketId,
              { id: user.id, name: user.name },
            );
            // Se há imagens inline, atualizar contentHtml + bodyClean + bodyQuoted da ultima mensagem
            if (Object.keys(cidMap).length > 0) {
              const lastMsg = await prisma.ticketMessage.findFirst({
                where: { ticketId: existingTicketId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, contentHtml: true, bodyClean: true, bodyQuoted: true },
              });
              if (lastMsg?.contentHtml) {
                await prisma.ticketMessage.update({
                  where: { id: lastMsg.id },
                  data: {
                    contentHtml: replaceCidReferences(lastMsg.contentHtml, cidMap),
                    ...(lastMsg.bodyClean  ? { bodyClean:  replaceCidReferences(lastMsg.bodyClean,  cidMap) } : {}),
                    ...(lastMsg.bodyQuoted ? { bodyQuoted: replaceCidReferences(lastMsg.bodyQuoted, cidMap) } : {}),
                  },
                });
              }
            }
            if (replyHasCidRefs && Object.keys(cidMap).length === 0) {
              console.warn(`[Graph] HTML contém referências cid: mas nenhum anexo inline retornado para interação do ticket ${existingTicketId}`);
            }
          } catch (errAtt) {
            console.error('[Graph] Falha ao salvar anexos (interação):', errAtt);
          }
        }

        // Registrar email como processado (messageId real)
        await prisma.processedEmail.create({
          data: {
            messageId: email.id,
            fromEmail: senderEmail,
            subject: subject.substring(0, 200),
            ticketId: existingTicketId,
            status: 'processed',
          },
        });

        // Também salvar referência do conversationId para futuras respostas
        if (email.conversationId) {
          await prisma.processedEmail.create({
            data: {
              messageId: `conv:${email.conversationId}:${email.id}`,
              fromEmail: senderEmail,
              subject: subject.substring(0, 200),
              ticketId: existingTicketId,
              status: 'processed',
            },
          }).catch(() => {}); // Ignorar se já existe
        }

        // Marcar email como lido
        await markEmailAsRead(accessToken, config.userEmail, email.id);

        return {
          success: true,
          ticketId: existingTicketId,
          ticketNumber: existingTicketNumber || undefined,
          isReply: true,
        };
      }
    }

    // ===== CRIAR NOVO CHAMADO =====
    // Chamados criados via e-mail entram com prioridade "Baixa" por padrão.
    // O atendente pode ajustar manualmente após triagem.
    const priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    const { responseDue, resolutionDue } = calculateSLA(priority);

    // Preparar HTML sanitizado + cabeçalho (estilo N-able/Kaseya)
    let sanitizedHtml: string | null = null;
    const rawHtml = email.body.contentType === 'html' ? (email.body.content || '') : '';
    try {
      const { sanitizeEmailHtmlAdvanced, generateEmailHeader } = await import('@/lib/email-sanitizer');
      if (rawHtml) {
        const to = (email.toRecipients || []).map((r) => r.emailAddress.address).join(', ');
        const cc = (email.ccRecipients || []).map((r) => r.emailAddress.address).join(', ');
        const header = generateEmailHeader({
          from: senderEmail,
          fromName: senderName,
          date: new Date(email.receivedDateTime),
          subject,
          to: to || null,
          cc: cc || null,
        });
        sanitizedHtml = header + sanitizeEmailHtmlAdvanced(rawHtml);
      }
    } catch (e) {
      console.error('[Graph] Falha ao sanitizar HTML:', e);
    }

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description: bodyText.substring(0, 5000),
        descriptionHtml: sanitizedHtml,
        source: 'email',
        priority,
        status: 'OPEN',
        creatorId: user.id,
        companyId: user.companyId!,
        responseDueAt: responseDue,
        resolutionDueAt: resolutionDue,
      },
    });

    // Salvar anexos no S3 + TicketAttachment + resolver CID inline
    // NOTA: email.hasAttachments pode ser false mesmo com imagens inline (assinatura).
    // Verificamos também se o HTML contém referências cid: para garantir resolução.
    const newTicketHasCidRefs = rawHtml ? /src\s*=\s*["']cid:/i.test(rawHtml) : false;
    if (email.hasAttachments || newTicketHasCidRefs) {
      try {
        const { saved, cidMap } = await saveEmailAttachmentsToTicket(
          accessToken,
          config.userEmail,
          email.id,
          ticket.id,
          { id: user.id, name: user.name },
        );
        // Se há imagens inline, atualizar descriptionHtml do ticket
        if (Object.keys(cidMap).length > 0 && ticket.descriptionHtml) {
          const updatedHtml = replaceCidReferences(ticket.descriptionHtml, cidMap);
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { descriptionHtml: updatedHtml },
          });
        }
        if (newTicketHasCidRefs && Object.keys(cidMap).length === 0) {
          console.warn(`[Graph] HTML contém referências cid: mas nenhum anexo inline retornado para ticket #${ticket.id}`);
        }
      } catch (errAtt) {
        console.error('[Graph] Falha ao salvar anexos (novo ticket):', errAtt);
      }
    }

    // Registrar email como processado (messageId real)
    await prisma.processedEmail.create({
      data: {
        messageId: email.id,
        fromEmail: senderEmail,
        subject,
        ticketId: ticket.id,
        status: 'SUCCESS',
      },
    });

    // Salvar referência do conversationId para vincular futuras respostas
    if (email.conversationId) {
      await prisma.processedEmail.create({
        data: {
          messageId: `conv:${email.conversationId}:${email.id}`,
          fromEmail: senderEmail,
          subject,
          ticketId: ticket.id,
          status: 'processed',
        },
      }).catch(() => {});
    }

    // Marcar email como lido
    await markEmailAsRead(accessToken, config.userEmail, email.id);

    // Mover para pasta "Processados"
    await moveEmailToFolder(accessToken, config.userEmail, email.id, 'Processados');

    // Enviar resposta automática com número do chamado
    const replySubject = `Re: ${subject} - Chamado #${ticket.number} criado`;
    const replyBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #3B82F6; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Winner Tecnologia</h1>
        </div>
        <div style="padding: 30px; background: #f8fafc;">
          <p>Olá <strong>${senderName}</strong>,</p>
          <p>Recebemos sua solicitação e um chamado foi criado automaticamente.</p>
          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #3B82F6; margin: 20px 0;">
            <p style="margin: 0;"><strong>Número do Chamado:</strong> #${ticket.number}</p>
            <p style="margin: 10px 0 0;"><strong>Assunto:</strong> ${subject}</p>
          </div>
          <p>Nossa equipe já está trabalhando para atendê-lo o mais breve possível.</p>
          <p style="color: #64748b; font-size: 13px;">Para acompanhar ou responder, mantenha o número <strong>#${ticket.number}</strong> no assunto do email.</p>
          <p>Atenciosamente,<br><strong>Equipe de Suporte</strong><br>Winner Tecnologia</p>
        </div>
        <div style="background: #1e293b; padding: 15px; text-align: center;">
          <p style="color: #94a3b8; margin: 0; font-size: 12px;">Este é um email automático. Responda mantendo o assunto para atualizar o chamado.</p>
        </div>
      </div>
    `;

    await sendEmail(accessToken, config.userEmail, senderEmail, replySubject, replyBody);

    return {
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.number,
    };
  } catch (error) {
    console.error('Error processing email to ticket:', error);
    
    try {
      await prisma.processedEmail.create({
        data: {
          messageId: email.id,
          fromEmail: email.from.emailAddress.address,
          subject: email.subject || 'Sem assunto',
          status: 'ERROR',
          errorMsg: error instanceof Error ? error.message : 'Erro desconhecido',
        },
      });
    } catch (e) {
      console.error('Error logging failed email:', e);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// Processar todos os emails não lidos
export async function processAllUnreadEmails(): Promise<{
  processed: number;
  tickets: number;
  replies: number;
  errors: number;
  tokenError?: string;
}> {
  // Buscar configuração
  const emailConfig = await prisma.emailConfig.findUnique({
    where: { key: 'main' },
  });

  if (!emailConfig?.graphEnabled) {
    return { processed: 0, tickets: 0, replies: 0, errors: 0 };
  }

  if (!emailConfig.graphTenantId || !emailConfig.graphClientId || 
      !emailConfig.graphClientSecret || !emailConfig.graphUserEmail) {
    console.error('Microsoft Graph API não configurado completamente');
    return { processed: 0, tickets: 0, replies: 0, errors: 0, tokenError: 'Configuração incompleta' };
  }

  const config: GraphConfig = {
    tenantId: emailConfig.graphTenantId.trim(),
    clientId: emailConfig.graphClientId.trim(),
    clientSecret: emailConfig.graphClientSecret.trim(),
    userEmail: emailConfig.graphUserEmail.trim().toLowerCase(),
  };

  // Obter token
  const tokenResult = await getGraphAccessToken(config);
  if (!tokenResult.token) {
    console.error('Não foi possível obter token do Graph API:', tokenResult.error);
    return { processed: 0, tickets: 0, replies: 0, errors: 0, tokenError: tokenResult.error };
  }
  
  const accessToken = tokenResult.token;

  // Buscar APENAS emails não lidos
  const emails = await getUnreadEmails(accessToken, config.userEmail);
  console.log(`📬 Encontrados ${emails.length} emails não lidos`);

  let processed = 0;
  let tickets = 0;
  let replies = 0;
  let errors = 0;

  for (const email of emails) {
    const result = await processEmailToTicket(email, accessToken, config);
    processed++;
    
    if (result.success && result.isReply) {
      replies++;
      console.log(`💬 Interação adicionada ao Chamado #${result.ticketNumber}: ${email.subject}`);
    } else if (result.success && result.ticketNumber) {
      tickets++;
      console.log(`✅ Chamado #${result.ticketNumber} criado para: ${email.subject}`);
    } else if (!result.success) {
      errors++;
      console.log(`❌ Erro ao processar: ${email.subject} - ${result.error}`);
    }
  }

  // Atualizar última verificação
  await prisma.emailConfig.update({
    where: { key: 'main' },
    data: { graphLastCheck: new Date() },
  });

  return { processed, tickets, replies, errors };
}

// Testar conexão com Microsoft Graph
export async function testGraphConnection(config: GraphConfig): Promise<{
  success: boolean;
  message: string;
  emailCount?: number;
  details?: string;
}> {
  try {
    // Validar campos obrigatórios
    if (!config.tenantId || config.tenantId.trim() === '') {
      return { success: false, message: 'Tenant ID não informado.' };
    }
    if (!config.clientId || config.clientId.trim() === '') {
      return { success: false, message: 'Client ID não informado.' };
    }
    if (!config.clientSecret || config.clientSecret.trim() === '') {
      return { success: false, message: 'Client Secret não informado.' };
    }
    if (!config.userEmail || config.userEmail.trim() === '') {
      return { success: false, message: 'Email do usuário não informado.' };
    }

    // Obter token
    const tokenResult = await getGraphAccessToken(config);
    if (!tokenResult.token) {
      return { 
        success: false, 
        message: tokenResult.error || 'Não foi possível obter token de acesso.',
        details: 'Verifique se: 1) O Tenant ID está correto, 2) O Client ID e Secret são válidos, 3) As permissões Mail.Read e Mail.Send estão configuradas no Azure, 4) O consentimento de administrador foi concedido.'
      };
    }

    const accessToken = tokenResult.token;

    // Tentar listar emails
    const url = `https://graph.microsoft.com/v1.0/users/${config.userEmail}/messages?$top=1`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Erro ao acessar caixa de email (HTTP ${response.status})`;
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.code === 'ErrorItemNotFound' || errorData.error?.code === 'MailboxNotEnabledForRESTAPI') {
          errorMessage = `Caixa de correio "${config.userEmail}" não encontrada ou não habilitada para API. Verifique se o email está correto e se é uma caixa Exchange Online.`;
        } else if (errorData.error?.code === 'OrganizationFromTenantGuidNotFound') {
          errorMessage = 'Tenant ID não encontrado. Verifique se o ID está correto.';
        } else if (errorData.error?.code === 'Authorization_RequestDenied') {
          errorMessage = 'Permissão negada. O aplicativo não tem permissão Mail.Read. Configure no Azure Portal e conceda consentimento de administrador.';
        } else if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        errorMessage = errorText;
      }
      
      return { success: false, message: errorMessage };
    }

    // Contar emails não lidos
    const countUrl = `https://graph.microsoft.com/v1.0/users/${config.userEmail}/messages?$filter=isRead eq false&$count=true`;
    const countResponse = await fetch(countUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'ConsistencyLevel': 'eventual',
      },
    });

    let emailCount = 0;
    if (countResponse.ok) {
      const countData = await countResponse.json();
      emailCount = countData.value?.length || 0;
    }

    return {
      success: true,
      message: `✅ Conexão estabelecida com sucesso! ${emailCount} emails não lidos na caixa.`,
      emailCount,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro de conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
    };
  }
}