export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { buildQuoteHtml, buildQuoteNumber, generateQuotePdfBuffer } from '@/lib/quote-template';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { id: true, name: true } },
      ticket: { select: { id: true, number: true, subject: true } },
      items: { orderBy: { order: 'asc' } },
    },
  });
  if (!quote) return NextResponse.json({ error: 'Orcamento nao encontrado' }, { status: 404 });

  if (session.user.role === 'CLIENT') {
    if (quote.companyId !== session.user.companyId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (!['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  let tenant: any = null;
  try {
    tenant = await prisma.tenant.findFirst({ select: { name: true, primaryColor: true, logoUrl: true } });
  } catch {}

  const { searchParams } = new URL(_request.url);
  const format = searchParams.get('format');
  const html = buildQuoteHtml(quote, tenant);

  if (format === 'html') {
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  try {
    const pdfBuffer = await generateQuotePdfBuffer(html);
    if (!pdfBuffer) {
      return NextResponse.json({ error: 'Falha ao gerar PDF' }, { status: 500 });
    }
    const quoteNum = buildQuoteNumber(quote);
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="orcamento-${quoteNum}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating quote PDF:', error);
    return NextResponse.json({ error: 'Erro ao gerar PDF do orcamento' }, { status: 500 });
  }
}
