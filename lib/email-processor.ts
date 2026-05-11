// Processador de Emails para Abertura Automática de Chamados
import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { prisma } from '@/lib/db';
import { notifyNewTicket } from '@/lib/notifications';
import { getStorageProvider } from '@/lib/storage';
import { sanitizeEmailHtmlAdvanced, generateEmailHeader, detectBounce } from '@/lib/email-sanitizer';

interface EmailConfig {
  imapEnabled: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  imapPass: string | null;
  imapSecure: boolean;
  imapFolder: string | null;
  imapProcessed: string | null;
  supportEmail: string;
  // Microsoft Graph API
  graphEnabled?: boolean;
  graphTenantId?: string | null;
  graphClientId?: string | null;
  graphClientSecret?: string | null;
  graphUserEmail?: string | null;
}

interface ProcessResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number; // Tickets existentes atualizados
  reopened: number; // Tickets reabertos
  errors: number;
  details: Array<{
    messageId: string;
    from: string;
    subject: string;
    status: 'created' | 'updated' | 'reopened' | 'exists' | 'error' | 'ignored';
    ticketNumber?: number;
    error?: string;
  }>;
}

/**
 * Sanitiza HTML de email para exibição segura e profissional (estilo N-able / Kaseya).
 * Usa sanitize-html (bleach-equivalent) para manter formatacao rica mas remover scripts/handlers.
 * Converte referências CID para data URLs inline quando possível.
 * Adiciona cabeçalho de metadados estilo MSP.
 */
function sanitizeEmailHtml(
  html: string | null,
  attachments?: Attachment[],
  metadata?: { from?: string; fromName?: string; date?: Date; subject?: string },
): string | null {
  if (!html) return null;

  let preProcessed = html;

  // Converter referências CID para inline base64 se temos attachments
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.contentId && att.content) {
        const cid = att.contentId.replace(/[<>]/g, '');
        const mimeType = att.contentType || 'image/png';
        const base64 = att.content.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;
        preProcessed = preProcessed.replace(
          new RegExp(`src\\s*=\\s*["']cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'),
          `src="${dataUrl}"`
        );
      }
    }
  }

  // Sanitização com sanitize-html (mais robusta que regex)
  let sanitized = sanitizeEmailHtmlAdvanced(preProcessed);

  // Adicionar cabeçalho de metadados do email (estilo MSP/N-able)
  if (metadata) {
    const headerHtml = generateEmailHeader({
      from: metadata.from,
      fromName: metadata.fromName,
      date: metadata.date,
      subject: metadata.subject,
    });
    sanitized = headerHtml + sanitized;
  }

  // Limitar tamanho (evitar abusos)
  if (sanitized.length > 200000) {
    sanitized = sanitized.substring(0, 200000) + '<!-- truncated -->';
  }

  return sanitized;
}

// Extrair texto limpo do email preservando formatação (line breaks, parágrafos)
function extractCleanText(parsed: ParsedMail): string {
  let text = parsed.text || '';
  
  // Se não tem texto, tentar extrair do HTML preservando quebras de linha
  if (!text && parsed.html) {
    text = parsed.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Converter tags de bloco em newlines antes de remover tags
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<(p|div|tr|li|h[1-6]|blockquote)[^>]*>/gi, '\n')
      .replace(/<hr[^>]*>/gi, '\n---\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Limpar múltiplas linhas em branco (max 2)
      .replace(/\n{3,}/g, '\n\n')
      // Limpar espaços múltiplos em cada linha
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
  
  return text.trim().substring(0, 10000); // Limitar tamanho
}

// Extrair email do remetente
function extractFromEmail(parsed: ParsedMail): string {
  if (parsed.from?.value?.[0]?.address) {
    return parsed.from.value[0].address.toLowerCase();
  }
  return '';
}

// Extrair nome do remetente
function extractFromName(parsed: ParsedMail): string {
  if (parsed.from?.value?.[0]?.name) {
    return parsed.from.value[0].name;
  }
  return parsed.from?.value?.[0]?.address?.split('@')[0] || 'Cliente';
}

// Determinar prioridade baseada no assunto
function determinePriority(subject: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const subjectLower = subject.toLowerCase();
  
  if (subjectLower.includes('urgente') || 
      subjectLower.includes('crítico') || 
      subjectLower.includes('crítica') ||
      subjectLower.includes('emergencia') ||
      subjectLower.includes('emergência')) {
    return 'CRITICAL';
  }
  
  if (subjectLower.includes('importante') || 
      subjectLower.includes('prioridade alta') ||
      subjectLower.includes('não funciona') ||
      subjectLower.includes('parou')) {
    return 'HIGH';
  }
  
  if (subjectLower.includes('dúvida') || 
      subjectLower.includes('pergunta') ||
      subjectLower.includes('informação')) {
    return 'LOW';
  }
  
  return 'MEDIUM';
}

// Extrair número do ticket do assunto (padrões: [Ticket #123], #123, Chamado 123, etc)
function extractTicketNumber(subject: string): number | null {
  const patterns = [
    /\[Ticket\s*#?(\d+)\]/i,
    /\[Chamado\s*#?(\d+)\]/i,
    /Ticket\s*#?(\d+)/i,
    /Chamado\s*#?(\d+)/i,
    /Re:\s*.*#(\d+)/i,
    /#(\d+)\s*[-–]/,
  ];
  
  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

// Buscar ticket por In-Reply-To ou References headers
async function findTicketByHeaders(parsed: ParsedMail): Promise<string | null> {
  const inReplyTo = parsed.inReplyTo;
  const references = parsed.references;
  
  const messageIds: string[] = [];
  if (inReplyTo) messageIds.push(inReplyTo);
  if (references) {
    if (Array.isArray(references)) {
      messageIds.push(...references);
    } else {
      messageIds.push(references);
    }
  }
  
  if (messageIds.length === 0) return null;
  
  // Buscar emails processados com esses IDs
  const processedEmail = await prisma.processedEmail.findFirst({
    where: {
      messageId: { in: messageIds },
      ticketId: { not: null },
    },
    select: { ticketId: true },
  });
  
  return processedEmail?.ticketId || null;
}

// Salvar anexos do email usando StorageProvider (S3 ou Local)
async function saveEmailAttachments(
  attachments: Attachment[],
  ticketId: string,
  uploadedById: string,
  uploadedByName: string
): Promise<number> {
  if (!attachments || attachments.length === 0) return 0;
  
  const storage = getStorageProvider();
  let saved = 0;
  
  for (const att of attachments) {
    // Ignorar anexos muito pequenos (provavelmente ícones de assinatura < 500 bytes)
    if (!att.content || att.size < 500) continue;
    
    // Imagens inline com contentId são tratadas pela conversão CID→base64/URL
    // Mas salvar como anexo se tiver nome de arquivo real (não é ícone de assinatura)
    if (att.contentDisposition === 'inline' && att.contentType?.startsWith('image/')) {
      // Ignorar SOMENTE se for muito pequeno (ícone de assinatura)
      // ou não tiver nome de arquivo (geralmente assinatura)
      if (att.size < 5000 || !att.filename) {
        continue;
      }
      // Imagens inline maiores que 5KB com nome são anexos reais
    }
    
    try {
      const fileName = att.filename || `attachment_${Date.now()}`;
      const contentType = att.contentType || 'application/octet-stream';
      
      const { cloudStoragePath } = await storage.save(
        `tickets/${ticketId}/${Date.now()}_${fileName}`,
        att.content,
        contentType,
        false,
      );
      
      await prisma.ticketAttachment.create({
        data: {
          ticketId,
          fileName,
          fileSize: att.size || att.content.length,
          fileType: contentType,
          cloudStoragePath,
          isPublic: false,
          uploadedById,
          uploadedByName,
        },
      });
      
      saved++;
    } catch (error) {
      console.error('Erro ao salvar anexo:', error);
    }
  }
  
  return saved;
}

// Reabrir ticket fechado e registrar histórico
async function reopenTicket(ticketId: string, reason: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true, reopenCount: true },
  });
  
  if (!ticket || ticket.status !== 'CLOSED') return;
  
  await prisma.$transaction([
    // Atualizar ticket
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'OPEN',
        reopenedFlag: true,
        reopenedAt: new Date(),
        reopenCount: (ticket.reopenCount || 0) + 1,
        closedAt: null,
        alertAssignee: true, // sempre alertar responsavel na reabertura
      },
    }),
    // Registrar histórico
    prisma.ticketHistory.create({
      data: {
        ticketId,
        action: 'reopened',
        fromValue: 'CLOSED',
        toValue: 'OPEN',
        note: reason,
        userId: 'system',
        userName: 'Sistema',
        userRole: 'ADMIN',
      },
    }),
  ]);
}

// Adicionar interação a ticket existente
async function addInteractionToTicket(
  ticketId: string,
  content: string,
  authorId: string,
  authorName: string,
  authorRole: 'CLIENT' | 'SUPPORT' | 'ADMIN' | 'FINANCE',
  contentHtml?: string | null,
): Promise<void> {
  // Parse email body to separate clean reply from quoted history
  const { parseEmailBody } = await import('@/lib/email-parser');
  const isHtml = !!contentHtml;
  const parsed = parseEmailBody(isHtml ? (contentHtml || '') : content, isHtml);

  await prisma.ticketMessage.create({
    data: {
      ticketId,
      content,
      contentHtml: contentHtml || null,
      bodyClean: parsed.bodyClean || null,
      bodyQuoted: parsed.bodyQuoted || null,
      bodyParseMethod: parsed.bodyParseMethod,
      isInternal: false,
      authorId,
      authorName,
      authorRole,
      visibleToClient: true,
    },
  });

  // Ativar alerta ao responsavel quando cliente responder via email IMAP
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

  // Emitir evento client_reply para telemetria
  try {
    const { emitEvent } = await import('@/lib/events');
    emitEvent({
      type: 'client_reply',
      entityType: 'ticket',
      entityId: ticketId,
      severity: 'info',
      actorId: authorId,
      actorName: authorName || undefined,
      metadata: { source: 'imap-inbox' },
    }).catch(() => {});
  } catch {}
}

export async function processIncomingEmails(): Promise<ProcessResult> {
  const result: ProcessResult = {
    success: false,
    processed: 0,
    created: 0,
    updated: 0,
    reopened: 0,
    errors: 0,
    details: [],
  };

  // Buscar configurações
  const config = await prisma.emailConfig.findUnique({
    where: { key: 'main' },
  }) as EmailConfig | null;

  if (!config || !config.imapEnabled) {
    return { ...result, success: true, details: [{ messageId: '', from: '', subject: '', status: 'ignored', error: 'IMAP desabilitado' }] };
  }

  if (!config.imapHost || !config.imapUser || !config.imapPass) {
    return { ...result, success: false, details: [{ messageId: '', from: '', subject: '', status: 'error', error: 'Configurações IMAP incompletas' }] };
  }

  let client: ImapFlow | null = null;

  try {
    // Conectar ao servidor IMAP
    client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort || 993,
      secure: config.imapSecure,
      auth: {
        user: config.imapUser,
        pass: config.imapPass,
      },
      logger: false,
    });

    await client.connect();

    // Abrir pasta de entrada
    const folder = config.imapFolder || 'INBOX';
    const lock = await client.getMailboxLock(folder);

    try {
      // Buscar emails não lidos
      const messages = client.fetch('1:*', {
        envelope: true,
        source: true,
        flags: true,
      }, { uid: true });

      for await (const msg of messages) {
        // Pular emails já lidos
        if (msg.flags?.has('\\Seen')) {
          continue;
        }

        result.processed++;
        
        const messageId = msg.envelope?.messageId || `${msg.uid}-${Date.now()}`;
        
        try {
          // Verificar se já foi processado
          const existing = await prisma.processedEmail.findUnique({
            where: { messageId },
          });

          if (existing) {
            result.details.push({
              messageId,
              from: msg.envelope?.from?.[0]?.address || '',
              subject: msg.envelope?.subject || '',
              status: 'exists',
            });
            continue;
          }

          // Parsear email completo
          if (!msg.source) {
            throw new Error('Conteúdo do email não disponível');
          }
          
          const parsed: ParsedMail = await simpleParser(msg.source);
          const fromEmail = extractFromEmail(parsed);
          const fromName = extractFromName(parsed);
          const subject = parsed.subject || 'Sem assunto';
          const body = extractCleanText(parsed);
          // Preservar HTML original para renderização rica (com cabeçalho de metadados)
          const emailMetadata = {
            from: fromEmail,
            fromName: fromName,
            date: parsed.date || undefined,
            subject,
          };
          const bodyHtml = sanitizeEmailHtml(parsed.html || null, parsed.attachments, emailMetadata);

          if (!fromEmail) {
            throw new Error('Email do remetente não encontrado');
          }

          // Ignorar emails automáticos de sistemas (Microsoft Outlook, Messaging, etc.)
          const ignoredSenders = ['microsoft outlook', 'messaging', 'postmaster', 'mailer-daemon', 'noreply', 'no-reply'];
          const senderNameLower = (fromName || '').toLowerCase().trim();
          const senderEmailLower = fromEmail.toLowerCase().trim();
          const isIgnoredSender = ignoredSenders.some(s => senderNameLower === s || senderEmailLower.startsWith(s + '@'));
          if (isIgnoredSender) {
            console.log(`[Email] Ignorando email de remetente automático: "${fromName}" <${fromEmail}>`);
            // Marcar como processado sem criar ticket
            await prisma.processedEmail.create({
              data: { messageId: msg.id || `ignored-${Date.now()}`, subject, fromEmail, processedAt: new Date() },
            }).catch(() => {});
            result.processed++;
            result.details.push({ messageId: msg.id || '', from: fromEmail, subject, status: 'ignored', error: `Remetente auto ignorado: ${fromName || fromEmail}` });
            continue;
          }

          // Verificar se é resposta a um ticket existente
          let existingTicketId: string | null = null;
          let existingTicketNumber: number | null = null;
          
          // 1. Buscar por número no assunto
          const ticketNumberFromSubject = extractTicketNumber(subject);
          if (ticketNumberFromSubject) {
            const existingTicket = await prisma.ticket.findUnique({
              where: { number: ticketNumberFromSubject },
              select: { id: true, number: true, status: true },
            });
            if (existingTicket) {
              existingTicketId = existingTicket.id;
              existingTicketNumber = existingTicket.number;
            }
          }
          
          // 2. Se não encontrou, buscar por headers In-Reply-To/References
          if (!existingTicketId) {
            existingTicketId = await findTicketByHeaders(parsed);
            if (existingTicketId) {
              const ticket = await prisma.ticket.findUnique({
                where: { id: existingTicketId },
                select: { number: true },
              });
              existingTicketNumber = ticket?.number || null;
            }
          }

          // Buscar ou criar usuário pelo email
          let user = await prisma.user.findUnique({
            where: { email: fromEmail },
            include: { company: true },
          });

          // Se usuário não existe, criar como cliente
          if (!user) {
            // Tentar encontrar empresa pelo domínio do email
            const emailDomain = fromEmail.split('@')[1];
            let userCompany = await prisma.company.findFirst({
              where: { domain: emailDomain },
            });
            
            // Se não encontrou por domínio, criar empresa baseada no domínio
            if (!userCompany) {
              userCompany = await prisma.company.create({
                data: {
                  name: `Empresa - ${emailDomain}`,
                  domain: emailDomain,
                  email: fromEmail,
                  needsAttention: true, // Marcar para completar cadastro
                },
              });
            }

            // Criar usuário com senha aleatória (precisará redefinir)
            const bcrypt = await import('bcryptjs');
            const randomPassword = Math.random().toString(36).slice(-12);
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            user = await prisma.user.create({
              data: {
                email: fromEmail,
                name: fromName,
                password: hashedPassword,
                role: 'CLIENT',
                companyId: userCompany.id,
              },
              include: { company: true },
            });
          }

          // Se é resposta a ticket existente
          if (existingTicketId) {
            const existingTicket = await prisma.ticket.findUnique({
              where: { id: existingTicketId },
              select: { status: true, number: true },
            });
            
            if (existingTicket) {
              // Se ticket estava fechado, reabrir
              if (existingTicket.status === 'CLOSED') {
                await reopenTicket(existingTicketId, `Reaberto por resposta de email de ${fromEmail}`);
                result.reopened++;
              }
              
              // Adicionar interação
              await addInteractionToTicket(
                existingTicketId,
                body || 'Resposta via email.',
                user.id,
                user.name,
                user.role as 'CLIENT' | 'SUPPORT' | 'ADMIN' | 'FINANCE',
                bodyHtml,
              );
              
              // Salvar anexos
              if (parsed.attachments && parsed.attachments.length > 0) {
                await saveEmailAttachments(
                  parsed.attachments,
                  existingTicketId,
                  user.id,
                  user.name
                );
              }
              
              // Registrar email como processado
              await prisma.processedEmail.create({
                data: {
                  messageId,
                  fromEmail,
                  subject: subject.substring(0, 200),
                  ticketId: existingTicketId,
                  status: 'processed',
                },
              });

              // Marcar email como lido
              await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });

              result.updated++;
              result.details.push({
                messageId,
                from: fromEmail,
                subject,
                status: existingTicket.status === 'CLOSED' ? 'reopened' : 'updated',
                ticketNumber: existingTicket.number,
              });
              continue;
            }
          }

          // Criar novo chamado
          const priority = determinePriority(subject);
          
          // Buscar SLA padrão
          const slaConfig = await prisma.sLAConfig.findFirst({
            where: { priority },
          });

          const now = new Date();
          let responseDueAt: Date | null = null;
          let resolutionDueAt: Date | null = null;

          if (slaConfig && slaConfig.responseTimeHrs > 0) {
            responseDueAt = new Date(now.getTime() + slaConfig.responseTimeHrs * 60 * 60 * 1000);
          }
          if (slaConfig && slaConfig.resolutionHrs > 0) {
            resolutionDueAt = new Date(now.getTime() + slaConfig.resolutionHrs * 60 * 60 * 1000);
          }

          const ticket = await prisma.ticket.create({
            data: {
              subject: subject.substring(0, 200),
              description: body || 'Conteúdo do email não disponível.',
              descriptionHtml: bodyHtml,
              priority,
              status: 'OPEN',
              source: 'email',
              creatorId: user.id,
              companyId: user.companyId!,
              responseDueAt,
              resolutionDueAt,
            },
            include: {
              creator: true,
              company: true,
            },
          });

          // Salvar anexos do email
          if (parsed.attachments && parsed.attachments.length > 0) {
            await saveEmailAttachments(
              parsed.attachments,
              ticket.id,
              user.id,
              user.name
            );
          }

          // Registrar email como processado
          await prisma.processedEmail.create({
            data: {
              messageId,
              fromEmail,
              subject: subject.substring(0, 200),
              ticketId: ticket.id,
              status: 'processed',
            },
          });

          // Marcar email como lido
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });

          // Enviar notificação de novo chamado
          const appUrl = process.env.NEXTAUTH_URL || 'https://winner-tecnologia-si-aq2c13.abacusai.app';
          await notifyNewTicket({
            ticketNumber: ticket.number,
            subject: ticket.subject,
            description: ticket.description.substring(0, 500),
            priority: ticket.priority,
            creatorName: user.name,
            creatorEmail: user.email,
            companyName: user.company?.name || 'N/A',
            ticketUrl: `${appUrl}/tickets/${ticket.id}`,
          });

          result.created++;
          result.details.push({
            messageId,
            from: fromEmail,
            subject,
            status: 'created',
            ticketNumber: ticket.number,
          });

        } catch (error: any) {
          result.errors++;
          
          // Registrar erro
          await prisma.processedEmail.create({
            data: {
              messageId,
              fromEmail: msg.envelope?.from?.[0]?.address || 'unknown',
              subject: msg.envelope?.subject || 'Sem assunto',
              status: 'error',
              errorMsg: error.message?.substring(0, 500),
            },
          }).catch(() => {}); // Ignorar erro ao salvar erro

          result.details.push({
            messageId,
            from: msg.envelope?.from?.[0]?.address || '',
            subject: msg.envelope?.subject || '',
            status: 'error',
            error: error.message,
          });
        }
      }

      // Atualizar timestamp da última verificação
      await prisma.emailConfig.update({
        where: { key: 'main' },
        data: { imapLastCheck: new Date() },
      });

      result.success = true;

    } finally {
      lock.release();
    }

  } catch (error: any) {
    console.error('Erro ao processar emails:', error);
    result.details.push({
      messageId: '',
      from: '',
      subject: '',
      status: 'error',
      error: `Erro de conexão IMAP: ${error.message}`,
    });
  } finally {
    if (client) {
      await client.logout().catch(() => {});
    }
  }

  return result;
}

// Função para testar conexão IMAP
export async function testImapConnection(config: {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}): Promise<{ success: boolean; message: string; folders?: string[]; debug?: string }> {
  let client: ImapFlow | null = null;

  // Log para debug
  console.log('=== IMAP Test Connection ===');
  console.log('Host:', config.host);
  console.log('Port:', config.port);
  console.log('Secure:', config.secure);
  console.log('User:', config.user);
  console.log('Pass length:', config.pass?.length || 0);

  try {
    // Configurações otimizadas para Office 365
    const imapConfig: any = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      logger: false,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      },
    };

    // Para Office 365, usar configurações específicas
    if (config.host.includes('office365') || config.host.includes('outlook')) {
      imapConfig.tls = {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        servername: config.host,
      };
    }

    client = new ImapFlow(imapConfig);

    await client.connect();
    
    // Listar pastas disponíveis
    const folders: string[] = [];
    const mailboxList = await client.list();
    for (const mailbox of mailboxList) {
      folders.push(mailbox.path);
    }

    return {
      success: true,
      message: 'Conexão IMAP estabelecida com sucesso!',
      folders,
    };

  } catch (error: any) {
    console.error('=== IMAP Error Details ===');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response);
    console.error('Error responseCode:', error.responseCode);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    let message = 'Erro ao conectar';
    let debug = `Código: ${error.code || 'N/A'}\nMensagem: ${error.message || 'N/A'}`;
    
    if (error.response) {
      debug += `\nResposta do servidor: ${error.response}`;
    }
    if (error.responseCode) {
      debug += `\nCódigo de resposta: ${error.responseCode}`;
    }
    
    if (error.code === 'EAUTH' || error.authenticationFailed || error.responseCode === 'AUTHENTICATIONFAILED') {
      message = 'Falha na autenticação.';
      
      // Mensagens específicas para Office 365
      if (config.host.includes('office365') || config.host.includes('outlook')) {
        message += '\n\nPara Microsoft 365/Exchange:\n';
        message += '1. Verifique se IMAP está habilitado para esta conta no Admin Center\n';
        message += '2. Se usar MFA, use senha de aplicativo gerada em account.microsoft.com\n';
        message += '3. Aguarde até 24h após habilitar IMAP\n';
        message += '4. O admin pode ter bloqueado autenticação básica\n';
        message += '5. O email correto é: chamados@wticorp.com.br (não alias)';
      }
    } else if (error.code === 'ENOTFOUND') {
      message = 'Servidor não encontrado. Verifique o endereço.';
    } else if (error.code === 'ECONNREFUSED') {
      message = 'Conexão recusada. Verifique host e porta.';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      message = 'Timeout na conexão. O servidor pode estar bloqueando.';
    } else if (error.message) {
      message = error.message;
    }

    return {
      success: false,
      message,
      debug,
    };
  } finally {
    if (client) {
      await client.logout().catch(() => {});
    }
  }
}
