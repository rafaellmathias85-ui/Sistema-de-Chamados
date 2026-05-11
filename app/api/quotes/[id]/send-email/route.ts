export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { sendNotificationEmail } from '@/lib/notifications';
import { buildQuoteHtml, buildQuoteNumber } from '@/lib/quote-template';

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

  // Tenant para logo / branding
  let tenant: any = null;
  try {
    tenant = await prisma.tenant.findFirst({ select: { name: true, primaryColor: true, logoUrl: true } });
  } catch {}

  // Corpo do e-mail = mesmo HTML do preview (sem anexo)
  const htmlBody = buildQuoteHtml(quote, tenant);
  const quoteNum = buildQuoteNumber(quote);
  const subject = `Orçamento #${quoteNum} — ${quote.title}`;

  // Enviar para cada destinatário
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const email of emails) {
    try {
      const ok = await sendNotificationEmail({
        recipientEmail: email,
        subject,
        body: htmlBody,
        isHtml: true,
      });
      results.push({ email, ok });
    } catch (err: any) {
      console.error(`[QuoteSendEmail] Erro ao enviar para ${email}:`, err);
      results.push({ email, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ results });
}
