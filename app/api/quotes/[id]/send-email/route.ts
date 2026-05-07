export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { sendNotificationEmail } from '@/lib/notifications';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const role = session.user.role;
  if (!['ADMIN', 'SUPPORT', 'FINANCE'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { name: true } },
      ticket: { select: { number: true, subject: true } },
      items: { orderBy: { order: 'asc' } },
    },
  });
  if (!quote) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });

  const body = await request.json();
  const emails: string[] = body.emails || [];
  if (emails.length === 0) return NextResponse.json({ error: 'Nenhum email informado' }, { status: 400 });

  // Montar conteúdo do email
  const itemsHtml = quote.items.map(it =>
    `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;">${it.description}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:center;">${it.quantity}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right;">R$ ${it.unitPrice.toFixed(2)}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;text-align:right;">R$ ${it.total.toFixed(2)}</td></tr>`
  ).join('');

  const quoteLabel = quote.ticket ? `#${quote.number}-${quote.ticket.number}` : `#${quote.number}`;
  const subject = `Orçamento ${quoteLabel} — ${quote.title}`;
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
      <h2 style="color:#2563eb;">Orçamento ${quoteLabel}</h2>
      <p><strong>Título:</strong> ${quote.title}</p>
      ${quote.company ? `<p><strong>Empresa:</strong> ${quote.company.name}</p>` : ''}
      ${quote.ticket ? `<p><strong>Chamado:</strong> #${quote.ticket.number} — ${quote.ticket.subject}</p>` : ''}
      ${quote.description ? `<p><strong>Descrição:</strong> ${quote.description}</p>` : ''}
      ${quote.validUntil ? `<p><strong>Válido até:</strong> ${new Date(quote.validUntil).toLocaleDateString('pt-BR')}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Item</th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:center;">Qtd</th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;">Unitário</th>
            <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <table style="width:100%;margin-top:8px;">
        <tr><td style="text-align:right;padding:4px 12px;">Subtotal:</td><td style="text-align:right;padding:4px 12px;font-weight:bold;">R$ ${quote.subtotal.toFixed(2)}</td></tr>
        ${quote.discount > 0 ? `<tr><td style="text-align:right;padding:4px 12px;">Desconto:</td><td style="text-align:right;padding:4px 12px;">- R$ ${quote.discount.toFixed(2)}</td></tr>` : ''}
        <tr style="font-size:18px;"><td style="text-align:right;padding:8px 12px;font-weight:bold;">Total:</td><td style="text-align:right;padding:8px 12px;font-weight:bold;color:#2563eb;">R$ ${quote.total.toFixed(2)}</td></tr>
      </table>
      ${quote.notes ? `<p style="margin-top:16px;color:#666;"><strong>Observações:</strong> ${quote.notes}</p>` : ''}
      <hr style="margin:24px 0;border:0;border-top:1px solid #e5e7eb;" />
      <p style="color:#999;font-size:12px;">Este orçamento foi enviado pela equipe Winner Tecnologia.</p>
    </div>
  `;

  // Enviar para cada destinatário
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const email of emails) {
    try {
      await sendNotificationEmail({
        recipientEmail: email,
        subject,
        body: htmlBody,
        isHtml: true,
      });
      results.push({ email, ok: true });
    } catch (err: any) {
      console.error(`[QuoteSendEmail] Erro ao enviar para ${email}:`, err);
      results.push({ email, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ results });
}
