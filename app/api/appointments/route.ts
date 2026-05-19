import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Role } from '@prisma/client';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Formata data "YYYY-MM-DD" para "DD/MM/YYYY" sem usar new Date()
 * Evita bug de timezone onde meia-noite UTC vira dia anterior em UTC-3.
 */
function formatDateBR(dateStr: string | Date): string {
  const str = typeof dateStr === 'string' ? dateStr : dateStr.toISOString();
  const parts = str.slice(0, 10).split('-');
  if (parts.length !== 3) return str;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// GET - List appointments (filtered by date range, technicianId)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const technicianId = searchParams.get('technicianId');
    const ticketId = searchParams.get('ticketId');

    const where: any = {};

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    if (technicianId) {
      where.technicianId = technicianId;
    } else if (session.user.role === 'SUPPORT') {
      // Support only sees own appointments
      where.technicianId = session.user.id;
    }
    // FINANCE e ADMIN veem todos os agendamentos (sem filtro de technicianId)

    if (ticketId) {
      where.ticketId = ticketId;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        ticket: {
          select: {
            number: true,
            subject: true,
            company: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json({ error: 'Erro ao buscar agendamentos' }, { status: 500 });
  }
}

// POST - Create appointment with conflict detection
// Supports autoCreateTicket mode: creates ticket automatically for "Visita Técnica"
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const {
      ticketId: existingTicketId,
      autoCreateTicket,
      companyId,
      requesterName,
      requesterEmail,
      technicianId,
      date,
      startTime,
      endTime,
      observation,
      notifyClient = false,
      autoNotify7Days = false,
    } = body;

    if (!technicianId || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    let ticketId = existingTicketId;

    // Auto-create ticket flow
    if (autoCreateTicket) {
      if (!companyId) {
        return NextResponse.json({ error: 'Empresa obrigatória para criar chamado' }, { status: 400 });
      }

      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
      }

      const dateStr = formatDateBR(date);

      // Resolve creator (solicitante): try to find a User in the company by email,
      // fallback to logged-in user if not found. This ensures "Solicitante" shows the
      // client (not the admin/support user creating the appointment).
      let resolvedCreatorId: string = session.user.id;
      if (requesterEmail) {
        try {
          const clientUser = await prisma.user.findFirst({
            where: {
              email: requesterEmail,
              companyId: companyId,
            },
            select: { id: true },
          });
          if (clientUser?.id) {
            resolvedCreatorId = clientUser.id;
          }
        } catch (e) {
          console.warn('[appointments] Failed to resolve client user by email:', e);
        }
      }

      const ticket = await prisma.ticket.create({
        data: {
          subject: 'Visita Técnica',
          description: `Visita técnica agendada para ${dateStr} das ${startTime} às ${endTime}.${requesterName ? `\nSolicitante: ${requesterName}` : ''}${requesterEmail ? ` (${requesterEmail})` : ''}${observation ? `\nObservação: ${observation}` : ''}`,
          status: 'OPEN',
          priority: 'MEDIUM',
          creatorId: resolvedCreatorId,
          companyId: companyId,
          assigneeId: technicianId,
        },
      });
      ticketId = ticket.id;
    }

    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId ou autoCreateTicket obrigatório' }, { status: 400 });
    }

    // Validate ticket exists
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, number: true, subject: true, company: { select: { name: true } } } });
    if (!ticket) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    // Get technician name
    const tech = await prisma.user.findUnique({ where: { id: technicianId }, select: { name: true } });
    if (!tech) {
      return NextResponse.json({ error: 'Técnico não encontrado' }, { status: 404 });
    }

    // Conflict detection: check overlapping appointments for same technician on same date
    const dateObj = new Date(date);
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await prisma.appointment.findMany({
      where: {
        technicianId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });

    // Check time overlap
    const newStart = startTime;
    const newEnd = endTime;
    const conflict = existing.find(appt => {
      return (newStart < appt.endTime && newEnd > appt.startTime);
    });

    if (conflict) {
      return NextResponse.json({
        error: `Conflito de horário! Técnico já tem agendamento de ${conflict.startTime} às ${conflict.endTime} nesta data.`,
        conflict: true,
      }, { status: 409 });
    }

    const appointment = await prisma.appointment.create({
      data: {
        ticketId,
        technicianId,
        technicianName: tech.name,
        date: startOfDay,
        startTime,
        endTime,
        observation: observation || null,
        companyId: companyId || null,
        requesterName: requesterName || null,
        requesterEmail: requesterEmail || null,
        notifyClient: !!notifyClient,
        autoNotify7Days: !!autoNotify7Days,
        createdById: session.user.id,
        createdByName: session.user.name || 'Usuário',
      },
      include: {
        ticket: {
          select: { number: true, subject: true, company: { select: { name: true } } },
        },
      },
    });

    // Log in ticket history
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        action: 'appointment_created',
        toValue: `${startTime}-${endTime} com ${tech.name}`,
        note: `Visita técnica agendada para ${formatDateBR(date)}`,
        userId: session.user.id,
        userName: session.user.name || 'Usuário',
        userRole: session.user.role as Role,
      },
    });

    // Send confirmation emails
    const dateStr = formatDateBR(date);
    const templateData = {
      ticketNumber: ticket.number,
      requesterName: requesterName || '',
      technicianName: tech.name,
      date: dateStr,
      rawDate: date,
      startTime,
      endTime,
      observation: observation || '',
      companyName: ticket.company?.name || '',
    };

    // 1. Email para o solicitante/cliente (somente se notifyClient ativo)
    if (requesterEmail && notifyClient) {
      try {
        const { sendNotificationEmail } = await import('@/lib/notifications');
        await sendNotificationEmail({
          notificationId: process.env.NOTIF_ID_CONFIRMAO_VISITA_TCNICA || '',
          recipientEmail: requesterEmail,
          subject: `📅 Visita Técnica Confirmada - Chamado #${ticket.number}`,
          body: getAppointmentConfirmationTemplate(templateData),
        });
        console.log(`[Visita] Email de confirmação enviado para cliente: ${requesterEmail}`);
      } catch (emailErr) {
        console.error('Erro ao enviar email de confirmação ao cliente:', emailErr);
      }
    }

    // 2. Email para o técnico responsável
    try {
      const techUser = await prisma.user.findUnique({ where: { id: technicianId }, select: { email: true } });
      if (techUser?.email) {
        const { sendNotificationEmail } = await import('@/lib/notifications');
        await sendNotificationEmail({
          notificationId: process.env.NOTIF_ID_CONFIRMAO_VISITA_TCNICA || '',
          recipientEmail: techUser.email,
          subject: `🔧 Visita Técnica Atribuída - Chamado #${ticket.number}`,
          body: getTechnicianAppointmentTemplate({
            ...templateData,
            techEmail: techUser.email,
            requesterEmail: requesterEmail || '',
          }),
        });
        console.log(`[Visita] Email de agendamento enviado para técnico: ${techUser.email}`);
      }
    } catch (emailErr) {
      console.error('Erro ao enviar email para técnico:', emailErr);
    }

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json({ error: 'Erro ao criar agendamento' }, { status: 500 });
  }
}

function getAppointmentConfirmationTemplate(data: {
  ticketNumber: number;
  requesterName: string;
  technicianName: string;
  date: string;
  startTime: string;
  endTime: string;
  observation: string;
  companyName: string;
  rawDate?: Date | string;
}): string {
  // Parse data real do agendamento para exibir no ícone de calendário
  const rawDate = data.rawDate ? new Date(data.rawDate) : parseBrazilianDate(data.date);
  const monthsShort = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const monthsLong = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const weekdaysLong = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const day = rawDate && !isNaN(rawDate.getTime()) ? rawDate.getUTCDate() : 0;
  const monthShort = rawDate && !isNaN(rawDate.getTime()) ? monthsShort[rawDate.getUTCMonth()] : '';
  const monthLong = rawDate && !isNaN(rawDate.getTime()) ? monthsLong[rawDate.getUTCMonth()] : '';
  const year = rawDate && !isNaN(rawDate.getTime()) ? rawDate.getUTCFullYear() : '';
  const weekday = rawDate && !isNaN(rawDate.getTime()) ? weekdaysLong[rawDate.getUTCDay()] : '';
  const longDate = day ? `${weekday}, ${day} de ${monthLong} de ${year}` : data.date;

  // Template com suporte robusto a Dark Mode em clientes de email
  // - meta color-scheme para impedir inversao automatica
  // - @media prefers-color-scheme: dark para Apple Mail / iOS
  // - [data-ogsc] / [data-ogsb] para Outlook.com
  // - Cabecalho com cor forte (laranja/azul) que sobrevive a inversao
  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>Visita Técnica Confirmada</title>
  <style>
    /* Reset basico */
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse !important; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }

    /* Forcar light mode - evita inversao automatica do cliente */
    :root { color-scheme: light only; supported-color-schemes: light only; }

    /* Dark mode overrides para clientes que insistem em inverter */
    @media (prefers-color-scheme: dark) {
      .wti-header { background: #0A1628 !important; background-color: #0A1628 !important; }
      .wti-header-title { color: #ffffff !important; }
      .wti-header-subtitle { color: #cbd5e1 !important; }
      .wti-header-kicker { color: #93c5fd !important; }
      .wti-body { background: #ffffff !important; color: #0f172a !important; }
      .wti-body p, .wti-body td, .wti-body span, .wti-body strong { color: #0f172a !important; }
      .wti-card-bg { background: #f1f5f9 !important; }
      .wti-footer { background: #0f172a !important; }
      .wti-footer-text { color: #cbd5e1 !important; }
      .wti-day { color: #0f172a !important; background: #ffffff !important; }
      .wti-month { color: #ffffff !important; background: #dc2626 !important; }
      .wti-year { color: #64748b !important; background: #f1f5f9 !important; }
    }

    /* Outlook.com (roundcube) */
    [data-ogsc] .wti-header { background: #0A1628 !important; }
    [data-ogsc] .wti-header-title { color: #ffffff !important; }
    [data-ogsc] .wti-header-subtitle { color: #cbd5e1 !important; }
    [data-ogsc] .wti-header-kicker { color: #93c5fd !important; }
    [data-ogsc] .wti-footer-text { color: #cbd5e1 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;color-scheme:light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.08);">
          <!-- Header com cor de marca forte (azul institucional) -->
          <tr>
            <td class="wti-header" bgcolor="#0A1628" style="background:#0A1628;background-color:#0A1628;padding:32px 20px;text-align:center;">
              <!--[if mso]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
                <v:fill type="solid" color="#0A1628" />
                <v:textbox inset="0,0,0,0">
              <![endif]-->
              <div class="wti-header-kicker" style="color:#93c5fd;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:2px;font-weight:700;margin-bottom:8px;text-transform:uppercase;mso-line-height-rule:exactly;">
                <font color="#93c5fd">Winner Tecnologia</font>
              </div>
              <h1 class="wti-header-title" style="color:#ffffff;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;mso-line-height-rule:exactly;line-height:30px;">
                <font color="#ffffff">📅 Visita Técnica Confirmada</font>
              </h1>
              <p class="wti-header-subtitle" style="color:#cbd5e1;margin:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
                <font color="#cbd5e1">Chamado #${data.ticketNumber}</font>
              </p>
              <!--[if mso]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td class="wti-body" bgcolor="#ffffff" style="background:#ffffff;padding:30px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
              <p style="color:#0f172a;font-size:15px;margin:0 0 12px 0;">
                <font color="#0f172a">Olá${data.requesterName ? ` <strong>${data.requesterName}</strong>` : ''},</font>
              </p>
              <p style="color:#334155;font-size:15px;margin:0 0 20px 0;">
                <font color="#334155">Sua visita técnica foi agendada com sucesso. Confira os detalhes abaixo:</font>
              </p>

              <!-- Data destacada com icone de calendario -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:18px 0 22px 0;">
                <tr>
                  <td style="width:110px;vertical-align:top;">
                    <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,0.08);width:96px;">
                      <tr>
                        <td class="wti-month" bgcolor="#dc2626" style="background:#dc2626;color:#ffffff;text-align:center;padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;">
                          <font color="#ffffff">${monthShort || 'MÊS'}</font>
                        </td>
                      </tr>
                      <tr>
                        <td class="wti-day" bgcolor="#ffffff" style="background:#ffffff;text-align:center;padding:14px 0;font-family:Arial,Helvetica,sans-serif;font-size:40px;font-weight:800;color:#0f172a;line-height:1;border:1px solid #e2e8f0;border-top:0;border-bottom:0;">
                          <font color="#0f172a">${day || '—'}</font>
                        </td>
                      </tr>
                      <tr>
                        <td class="wti-year" bgcolor="#f1f5f9" style="background:#f1f5f9;text-align:center;padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;border:1px solid #e2e8f0;border-top:0;">
                          <font color="#64748b">${year || ''}</font>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding-left:18px;vertical-align:middle;">
                    <div style="color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">
                      <font color="#64748b">Data agendada</font>
                    </div>
                    <div style="color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;line-height:1.3;">
                      <font color="#0f172a">${longDate}</font>
                    </div>
                    <div style="color:#2563eb;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;margin-top:6px;">
                      <font color="#2563eb">🕐 ${data.startTime} às ${data.endTime}</font>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Tabela detalhes -->
              <table class="wti-card-bg" width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#f1f5f9" style="background:#f1f5f9;border-radius:8px;border:1px solid #e2e8f0;margin:20px 0;">
                <tr>
                  <td style="padding:14px 20px;">
                    <table width="100%" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;">
                          <font color="#334155"><strong>👤 Técnico responsável:</strong></font>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-size:14px;">
                          <font color="#0f172a">${data.technicianName}</font>
                        </td>
                      </tr>
                      ${data.companyName ? `
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;">
                          <font color="#334155"><strong>🏢 Empresa:</strong></font>
                        </td>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-size:14px;">
                          <font color="#0f172a">${data.companyName}</font>
                        </td>
                      </tr>
                      ` : ''}
                      ${data.observation ? `
                      <tr>
                        <td style="padding:8px 0;color:#334155;vertical-align:top;font-size:14px;">
                          <font color="#334155"><strong>📝 Observação:</strong></font>
                        </td>
                        <td style="padding:8px 0;text-align:right;color:#0f172a;white-space:pre-wrap;font-size:14px;">
                          <font color="#0f172a">${data.observation}</font>
                        </td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:13px;text-align:center;margin-top:24px;">
                <font color="#64748b">Em caso de dúvidas ou necessidade de reagendamento, entre em contato conosco.</font>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="wti-footer" bgcolor="#0f172a" style="background:#0f172a;padding:18px;text-align:center;">
              <p class="wti-footer-text" style="color:#cbd5e1;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:500;">
                <font color="#cbd5e1">Winner Tecnologia — Sistema de Chamados</font>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Converte uma string "dd/MM/yyyy" (formato pt-BR) em Date.
 */
function parseBrazilianDate(d: string): Date | null {
  if (!d) return null;
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`);
}

// Template de email para o técnico sobre visita atribuída
function getTechnicianAppointmentTemplate(data: {
  ticketNumber: number;
  requesterName: string;
  requesterEmail: string;
  technicianName: string;
  techEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  observation: string;
  companyName: string;
  rawDate?: Date | string;
}): string {
  const rawDate = data.rawDate ? new Date(data.rawDate) : parseBrazilianDate(data.date);
  const weekdaysLong = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const monthsLong = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const day = rawDate && !isNaN(rawDate.getTime()) ? rawDate.getUTCDate() : 0;
  const monthLong = rawDate && !isNaN(rawDate.getTime()) ? monthsLong[rawDate.getUTCMonth()] : '';
  const year = rawDate && !isNaN(rawDate.getTime()) ? rawDate.getUTCFullYear() : '';
  const weekday = rawDate && !isNaN(rawDate.getTime()) ? weekdaysLong[rawDate.getUTCDay()] : '';
  const longDate = day ? `${weekday}, ${day} de ${monthLong} de ${year}` : data.date;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
      <div style="background: linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%); padding: 30px; text-align: center;">
        <p style="color: #93c5fd; font-size: 13px; letter-spacing: 2px; font-weight: 700; margin: 0 0 8px 0; text-transform: uppercase;">Winner Tecnologia</p>
        <h1 style="color: white; margin: 0; font-size: 24px;">🔧 Visita Técnica Atribuída</h1>
        <p style="color: #cbd5e1; margin: 10px 0 0 0; font-size: 14px;">Chamado #${data.ticketNumber}</p>
      </div>
      <div style="padding: 30px; background: white;">
        <p style="color: #334155; font-size: 15px; margin: 0 0 16px 0;">
          Olá <strong>${data.technicianName}</strong>,
        </p>
        <p style="color: #334155; font-size: 15px; margin: 0 0 20px 0;">
          Uma visita técnica foi atribuída a você. Confira os detalhes:
        </p>
        
        <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">📅 Data:</strong>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right; color: #1e293b; font-weight: bold;">
                ${longDate}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">🕐 Horário:</strong>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right; color: #2563eb; font-weight: bold;">
                ${data.startTime} às ${data.endTime}
              </td>
            </tr>
            ${data.companyName ? `
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">🏢 Empresa:</strong>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right; color: #1e293b;">
                ${data.companyName}
              </td>
            </tr>
            ` : ''}
            ${data.requesterName ? `
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">👤 Solicitante:</strong>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right; color: #1e293b;">
                ${data.requesterName}${data.requesterEmail ? ` (${data.requesterEmail})` : ''}
              </td>
            </tr>
            ` : ''}
            ${data.observation ? `
            <tr>
              <td style="padding: 8px 0;">
                <strong style="color: #64748b;">📝 Observação:</strong>
              </td>
              <td style="padding: 8px 0; text-align: right; color: #1e293b;">
                ${data.observation}
              </td>
            </tr>
            ` : ''}
          </table>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">
          Confirme sua disponibilidade e prepare-se para o atendimento.
        </p>
      </div>
      <div style="background: #1e293b; padding: 20px; text-align: center;">
        <p style="color: #94a3b8; margin: 0; font-size: 12px;">
          Winner Tecnologia - Sistema de Chamados
        </p>
      </div>
    </div>
  `;
}

// PATCH - Edit/reschedule appointment
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { id, technicianId, date, startTime, endTime, observation, notifyClient, autoNotify7Days } = body;

    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const existing = await prisma.appointment.findUnique({
      where: { id },
      include: { ticket: { select: { id: true, number: true, subject: true, company: { select: { name: true } } } } },
    });
    if (!existing) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });

    // Support can only edit own appointments
    if (session.user.role === 'SUPPORT' && existing.technicianId !== session.user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const updateData: any = {};
    const newTechId = technicianId || existing.technicianId;
    const newDate = date || existing.date;
    const newStart = startTime || existing.startTime;
    const newEnd = endTime || existing.endTime;

    if (technicianId && technicianId !== existing.technicianId) {
      const tech = await prisma.user.findUnique({ where: { id: technicianId }, select: { name: true } });
      if (!tech) return NextResponse.json({ error: 'Técnico não encontrado' }, { status: 404 });
      updateData.technicianId = technicianId;
      updateData.technicianName = tech.name;
    }

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      updateData.date = d;
    }
    if (startTime) updateData.startTime = startTime;
    if (endTime) updateData.endTime = endTime;
    if (observation !== undefined) updateData.observation = observation || null;
    if (notifyClient !== undefined) updateData.notifyClient = notifyClient;
    if (autoNotify7Days !== undefined) {
      updateData.autoNotify7Days = autoNotify7Days;
      if (!autoNotify7Days) updateData.reminderSent = false;
    }

    // Check conflicts (exclude current appointment)
    if (date || startTime || endTime || technicianId) {
      const dateObj = new Date(newDate);
      const startOfDay = new Date(dateObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateObj);
      endOfDay.setHours(23, 59, 59, 999);

      const others = await prisma.appointment.findMany({
        where: { technicianId: newTechId, date: { gte: startOfDay, lte: endOfDay }, id: { not: id } },
      });

      const conflict = others.find(a => newStart < a.endTime && newEnd > a.startTime);
      if (conflict) {
        return NextResponse.json({
          error: `Conflito de horário! Técnico já tem agendamento de ${conflict.startTime} às ${conflict.endTime} nesta data.`,
          conflict: true,
        }, { status: 409 });
      }
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: { ticket: { select: { number: true, subject: true, company: { select: { name: true } } } } },
    });

    // Update ticket description if date changed
    if (date || startTime || endTime) {
      const dateStr = formatDateBR(updated.date);
      await prisma.ticket.update({
        where: { id: existing.ticketId },
        data: {
          description: `Visita técnica reagendada para ${dateStr} das ${updated.startTime} às ${updated.endTime}.${existing.requesterName ? `\nSolicitante: ${existing.requesterName}` : ''}${existing.requesterEmail ? ` (${existing.requesterEmail})` : ''}${updated.observation ? `\nObservação: ${updated.observation}` : ''}`,
        },
      });
    }

    // Log in ticket history
    const changes: string[] = [];
    if (date && new Date(date).toISOString().slice(0, 10) !== new Date(existing.date).toISOString().slice(0, 10))
      changes.push(`Data: ${formatDateBR(existing.date)} → ${formatDateBR(date)}`);
    if (startTime && startTime !== existing.startTime) changes.push(`Início: ${existing.startTime} → ${startTime}`);
    if (endTime && endTime !== existing.endTime) changes.push(`Fim: ${existing.endTime} → ${endTime}`);
    if (technicianId && technicianId !== existing.technicianId) changes.push(`Técnico alterado`);

    if (changes.length > 0) {
      await prisma.ticketHistory.create({
        data: {
          ticketId: existing.ticketId,
          action: 'appointment_updated',
          fromValue: `${existing.startTime}-${existing.endTime}`,
          toValue: `${updated.startTime}-${updated.endTime}`,
          note: `Visita técnica reagendada: ${changes.join('; ')}`,
          userId: session.user.id,
          userName: session.user.name || 'Usuário',
          userRole: session.user.role as Role,
        },
      });
    }

    // Send reschedule email to client if notifyClient
    if (notifyClient && existing.requesterEmail) {
      try {
        const dateStr = formatDateBR(updated.date);
        const { sendNotificationEmail } = await import('@/lib/notifications');
        await sendNotificationEmail({
          notificationId: process.env.NOTIF_ID_CONFIRMAO_VISITA_TCNICA || '',
          recipientEmail: existing.requesterEmail,
          subject: `📅 Visita Técnica Reagendada - Chamado #${existing.ticket.number}`,
          body: getAppointmentConfirmationTemplate({
            ticketNumber: existing.ticket.number,
            requesterName: existing.requesterName || '',
            technicianName: updated.technicianName,
            date: dateStr,
            rawDate: updated.date,
            startTime: updated.startTime,
            endTime: updated.endTime,
            observation: updated.observation || '',
            companyName: existing.ticket.company?.name || '',
          }),
        });
      } catch (emailErr) {
        console.error('Erro ao enviar email de reagendamento:', emailErr);
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating appointment:', error);
    return NextResponse.json({ error: 'Erro ao atualizar agendamento' }, { status: 500 });
  }
}

// DELETE - Remove appointment
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const appt = await prisma.appointment.findUnique({ where: { id } });
    if (!appt) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    // Support can only delete own appointments
    if (session.user.role === 'SUPPORT' && appt.technicianId !== session.user.id) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    await prisma.appointment.delete({ where: { id } });

    // Log in ticket history
    await prisma.ticketHistory.create({
      data: {
        ticketId: appt.ticketId,
        action: 'appointment_deleted',
        fromValue: `${appt.startTime}-${appt.endTime} com ${appt.technicianName}`,
        note: `Agendamento removido`,
        userId: session.user.id,
        userName: session.user.name || 'Usuário',
        userRole: session.user.role as Role,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    return NextResponse.json({ error: 'Erro ao excluir agendamento' }, { status: 500 });
  }
}