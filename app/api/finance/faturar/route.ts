import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendNotificationEmail } from '@/lib/notifications';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Faturar ticket and send email to faturamento@wticorp.com.br
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { ticketId } = await request.json();
    if (!ticketId) {
      return NextResponse.json({ error: 'ID do chamado obrigatório' }, { status: 400 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        company: { select: { name: true } },
        creator: { select: { name: true } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    if (!ticket.forwardedToFinance) {
      return NextResponse.json({ error: 'Chamado não está no financeiro' }, { status: 400 });
    }

    if (ticket.faturado) {
      return NextResponse.json({ error: 'Chamado já foi faturado' }, { status: 400 });
    }

    // Update ticket as faturado
    const now = new Date();
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        faturado: true,
        dataFaturamento: now,
      },
    });

    // Record in history
    await prisma.ticketHistory.create({
      data: {
        ticketId,
        action: 'faturado',
        fromValue: 'false',
        toValue: 'true',
        note: `Faturado por ${session.user.name}`,
        userId: session.user.id,
        userName: session.user.name || 'Usuário',
        userRole: session.user.role as any,
      },
    });

    // Format date as DD/MM/YYYY
    const dateStr = now.toLocaleDateString('pt-BR');

    // Email subject: {CLIENT} [{TICKET#}] [{DATE}]
    const emailSubject = `${ticket.company.name} [#${ticket.number}] [${dateStr}]`;

    // Build email body
    const valorFormatado = ticket.financialValue
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(ticket.financialValue))
      : 'Não definido';

    const emailBody = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>Solicitação de Faturamento</title>
  <style>
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse !important; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    :root { color-scheme: light only; supported-color-schemes: light only; }

    @media (prefers-color-scheme: dark) {
      .wti-header { background: #0A1628 !important; background-color: #0A1628 !important; }
      .wti-header-title { color: #ffffff !important; }
      .wti-header-kicker { color: #93c5fd !important; }
      .wti-body { background: #ffffff !important; color: #0f172a !important; }
      .wti-body td, .wti-body strong { color: #0f172a !important; }
      .wti-label { color: #64748b !important; }
      .wti-value-amount { color: #16a34a !important; }
      .wti-footer { background: #0f172a !important; }
      .wti-footer-text { color: #cbd5e1 !important; }
    }

    [data-ogsc] .wti-header { background: #0A1628 !important; }
    [data-ogsc] .wti-header-title { color: #ffffff !important; }
    [data-ogsc] .wti-header-kicker { color: #93c5fd !important; }
    [data-ogsc] .wti-footer-text { color: #cbd5e1 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;color-scheme:light only;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td class="wti-header" bgcolor="#0A1628" style="background:#0A1628;background-color:#0A1628;padding:32px 20px;text-align:center;">
              <!--[if mso]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
                <v:fill type="solid" color="#0A1628" />
                <v:textbox inset="0,0,0,0">
              <![endif]-->
              <div class="wti-header-kicker" style="color:#93c5fd;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:2px;font-weight:700;margin-bottom:8px;text-transform:uppercase;">
                <font color="#93c5fd">Winner Tecnologia</font>
              </div>
              <h1 class="wti-header-title" style="color:#ffffff;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;">
                <font color="#ffffff">💰 Solicitação de Faturamento</font>
              </h1>
              <!--[if mso]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td class="wti-body" bgcolor="#ffffff" style="background:#ffffff;padding:30px;font-family:Arial,Helvetica,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:10px 0;">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">
                    <font color="#64748b"><strong class="wti-label" style="color:#64748b;">Cliente:</strong></font>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#0f172a;font-size:14px;">
                    <font color="#0f172a">${ticket.company.name}</font>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">
                    <font color="#64748b"><strong class="wti-label" style="color:#64748b;">Chamado:</strong></font>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-size:14px;">
                    <font color="#0f172a">#${ticket.number} - ${ticket.subject}</font>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">
                    <font color="#64748b"><strong class="wti-label" style="color:#64748b;">Valor:</strong></font>
                  </td>
                  <td class="wti-value-amount" style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#16a34a;font-weight:bold;font-size:18px;">
                    <font color="#16a34a">${valorFormatado}</font>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">
                    <font color="#64748b"><strong class="wti-label" style="color:#64748b;">Data:</strong></font>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-size:14px;">
                    <font color="#0f172a">${dateStr}</font>
                  </td>
                </tr>
                ${ticket.financialNotes ? `
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">
                    <font color="#64748b"><strong class="wti-label" style="color:#64748b;">Observações:</strong></font>
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-size:14px;">
                    <font color="#0f172a">${ticket.financialNotes}</font>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding:10px 0;font-size:14px;">
                    <font color="#64748b"><strong class="wti-label" style="color:#64748b;">Faturado por:</strong></font>
                  </td>
                  <td style="padding:10px 0;text-align:right;color:#0f172a;font-size:14px;">
                    <font color="#0f172a">${session.user.name}</font>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="wti-footer" bgcolor="#0f172a" style="background:#0f172a;padding:20px;text-align:center;">
              <p class="wti-footer-text" style="color:#cbd5e1;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;">
                <font color="#cbd5e1">Winner Tecnologia - Sistema de Chamados</font>
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

    // Send email to faturamento
    await sendNotificationEmail({
      notificationId: process.env.NOTIF_ID_NOVO_CHAMADO || '',
      recipientEmail: 'faturamento@wticorp.com.br',
      subject: emailSubject,
      body: emailBody,
      isHtml: true,
    });

    return NextResponse.json({ success: true, message: 'Faturado com sucesso e email enviado!' });
  } catch (error) {
    console.error('Faturar error:', error);
    return NextResponse.json({ error: 'Erro ao faturar' }, { status: 500 });
  }
}
