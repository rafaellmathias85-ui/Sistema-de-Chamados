export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', SENT: 'Enviado', APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#6b7280', SENT: '#3b82f6', APPROVED: '#22c55e',
  REJECTED: '#ef4444', EXPIRED: '#eab308', CANCELLED: '#9ca3af',
};

function buildQuoteHtml(quote: any, tenant: any): string {
  const companyName = tenant?.name || 'Winner Tecnologia';
  const primaryColor = tenant?.primaryColor || '#3B82F6';

  const itemRows = (quote.items || []).map((it: any, idx: number) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;">${idx + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${esc(it.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${it.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmtMoney(it.unitPrice)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmtMoney(it.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#1f2937; background:#fff; padding:40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; padding-bottom:20px; border-bottom:3px solid ${primaryColor}; }
  .logo-area h1 { font-size:22px; color:${primaryColor}; margin-bottom:4px; }
  .logo-area p { font-size:12px; color:#6b7280; }
  .quote-info { text-align:right; }
  .quote-info .number { font-size:28px; font-weight:700; color:${primaryColor}; }
  .quote-info .date { font-size:12px; color:#6b7280; margin-top:4px; }
  .status-badge { display:inline-block; padding:4px 14px; border-radius:20px; font-size:12px; font-weight:600; color:#fff; margin-top:6px; }
  .section { margin-bottom:24px; }
  .section-title { font-size:13px; font-weight:700; text-transform:uppercase; color:${primaryColor}; letter-spacing:0.5px; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid #e5e7eb; }
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; }
  .info-label { font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.5px; }
  .info-value { font-size:14px; color:#1f2937; margin-bottom:8px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  thead th { background:${primaryColor}; color:#fff; padding:10px 12px; text-align:left; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; }
  thead th:first-child { border-radius:6px 0 0 0; }
  thead th:last-child { border-radius:0 6px 0 0; text-align:right; }
  .totals { margin-top:16px; display:flex; justify-content:flex-end; }
  .totals-box { width:280px; }
  .total-row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; color:#4b5563; }
  .total-row.grand { font-size:18px; font-weight:700; color:${primaryColor}; padding-top:10px; margin-top:6px; border-top:2px solid ${primaryColor}; }
  .notes { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px; font-size:13px; color:#4b5563; white-space:pre-wrap; }
  .footer { margin-top:40px; padding-top:16px; border-top:1px solid #e5e7eb; text-align:center; font-size:11px; color:#9ca3af; }
</style></head><body>
  <div class="header">
    <div class="logo-area">
      <h1>${esc(companyName)}</h1>
      <p>CNPJ: 00.000.000/0001-00</p>
    </div>
    <div class="quote-info">
      <div class="number">Orçamento #${quote.number}</div>
      <div class="date">Emitido em ${fmtDate(quote.createdAt)}</div>
      <div class="status-badge" style="background:${STATUS_COLOR[quote.status] || '#6b7280'};">${STATUS_LABEL[quote.status] || quote.status}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Informações do Orçamento</div>
    <div class="info-grid">
      <div><div class="info-label">Título</div><div class="info-value">${esc(quote.title)}</div></div>
      <div><div class="info-label">Empresa</div><div class="info-value">${esc(quote.company?.name) || '—'}</div></div>
      <div><div class="info-label">Chamado vinculado</div><div class="info-value">${quote.ticket ? '#' + quote.ticket.number + ' - ' + esc(quote.ticket.subject) : '—'}</div></div>
      <div><div class="info-label">Validade</div><div class="info-value">${fmtDate(quote.validUntil)}</div></div>
      <div><div class="info-label">Criado por</div><div class="info-value">${esc(quote.createdByName)}</div></div>
    </div>
    ${quote.description ? `<div style="margin-top:10px;"><div class="info-label">Descrição</div><div class="info-value">${esc(quote.description)}</div></div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Itens</div>
    <table>
      <thead><tr>
        <th style="width:40px;text-align:center;">#</th>
        <th>Descrição</th>
        <th style="width:70px;text-align:center;">Qtd</th>
        <th style="width:110px;text-align:right;">Valor Unit.</th>
        <th style="width:110px;text-align:right;">Total</th>
      </tr></thead>
      <tbody>${itemRows || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;">Nenhum item</td></tr>'}</tbody>
    </table>
    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span>Subtotal</span><span>${fmtMoney(quote.subtotal)}</span></div>
        ${quote.discount > 0 ? `<div class="total-row" style="color:#ef4444;"><span>Desconto</span><span>- ${fmtMoney(quote.discount)}</span></div>` : ''}
        <div class="total-row grand"><span>Total</span><span>${fmtMoney(quote.total)}</span></div>
      </div>
    </div>
  </div>

  ${quote.notes ? `<div class="section"><div class="section-title">Observações</div><div class="notes">${esc(quote.notes)}</div></div>` : ''}

  ${quote.rejectionReason ? `<div class="section"><div class="section-title">Motivo da Rejeição</div><div class="notes" style="border-color:#fca5a5;background:#fef2f2;color:#991b1b;">${esc(quote.rejectionReason)}</div></div>` : ''}

  <div class="footer">${esc(companyName)} · Orçamento #${quote.number} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
</body></html>`;
}

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

  // Access control for clients
  if (session.user.role === 'CLIENT') {
    if (quote.companyId !== session.user.companyId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (!['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  // Get tenant info for branding
  let tenant = null;
  try {
    tenant = await prisma.tenant.findFirst({ select: { name: true, primaryColor: true, logoUrl: true } });
  } catch {}

  const { searchParams } = new URL(_request.url);
  const format = searchParams.get('format');

  const html = buildQuoteHtml(quote, tenant);

  // Return HTML preview
  if (format === 'html') {
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // Generate PDF
  try {
    const createRes = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: html,
        pdf_options: {
          format: 'A4',
          landscape: false,
          margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
          print_background: true,
        },
      }),
    });

    if (!createRes.ok) {
      console.error('Quote PDF create failed:', await createRes.text());
      return NextResponse.json({ error: 'Falha ao gerar PDF' }, { status: 500 });
    }

    const { request_id } = await createRes.json();
    if (!request_id) {
      return NextResponse.json({ error: 'Sem request_id do PDF' }, { status: 500 });
    }

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const statusRes = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
      });
      const statusData = await statusRes.json();
      if (statusData?.status === 'SUCCESS' && statusData?.result?.result) {
        const pdfBuffer = Buffer.from(statusData.result.result, 'base64');
        return new NextResponse(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="orcamento-${quote.number}.pdf"`,
          },
        });
      }
      if (statusData?.status === 'FAILED') {
        console.error('Quote PDF failed:', statusData?.result);
        return NextResponse.json({ error: 'Falha na geracao do PDF' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Timeout na geracao do PDF' }, { status: 500 });
  } catch (error) {
    console.error('Error generating quote PDF:', error);
    return NextResponse.json({ error: 'Erro ao gerar PDF do orcamento' }, { status: 500 });
  }
}
