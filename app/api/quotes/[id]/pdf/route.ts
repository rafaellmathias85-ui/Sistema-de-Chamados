export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import path from 'path';
import fs from 'fs';

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: Date | string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('pt-BR');
}

function getLogoBase64(): string {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const logoBuffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch {
    return '';
  }
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', SENT: 'Enviado', APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#6b7280', SENT: '#3b82f6', APPROVED: '#22c55e',
  REJECTED: '#ef4444', EXPIRED: '#eab308', CANCELLED: '#9ca3af',
};

function buildQuoteNumber(quote: any): string {
  if (quote.ticket?.number) {
    return `${quote.number}-${quote.ticket.number}`;
  }
  return `${quote.number}`;
}

function buildQuoteHtml(quote: any, tenant: any): string {
  const companyName = process.env.REPORT_COMPANY_NAME || 'Winner Tecnologia';
  const primaryColor = '#3B82F6';
  const logoSrc = tenant?.logoUrl || getLogoBase64();
  const quoteNum = buildQuoteNumber(quote);

  const itemRows = (quote.items || []).map((it: any, idx: number) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px;">${idx + 1}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${esc(it.description)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;">${it.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">${fmtMoney(it.unitPrice)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:13px;">${fmtMoney(it.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#1f2937; background:#fff; }
  .header { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 24px 40px; display: flex; justify-content: space-between; align-items: center; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-left img { height: 50px; width: auto; }
  .header-left .fallback-name { color: #fff; font-size: 22px; font-weight: 800; }
  .header-right { text-align: right; color: #fff; }
  .header-right .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8; }
  .header-right .number { font-size: 32px; font-weight: 800; margin-top: 2px; }
  .header-right .date { font-size: 12px; opacity: 0.7; margin-top: 4px; }
  .status-bar { padding: 12px 40px; font-size: 14px; font-weight: 600; color: #fff; }
  .content { padding: 30px 40px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: ${primaryColor}; letter-spacing: 1px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid ${primaryColor}; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .info-cell { padding: 14px 16px; border-bottom: 1px solid #e5e7eb; }
  .info-cell:nth-child(3n+2) { border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; }
  .info-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.5px; margin-bottom: 4px; }
  .info-value { font-size: 14px; color: #1f2937; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f8fafc; color: #64748b; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb; }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; text-align: right; }
  .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
  .totals-box { width: 300px; background: #f8fafc; border-radius: 8px; padding: 16px 20px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #4b5563; }
  .total-row.grand { font-size: 20px; font-weight: 800; color: ${primaryColor}; padding-top: 12px; margin-top: 8px; border-top: 2px solid ${primaryColor}; }
  .notes-box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; font-size: 13px; color: #4b5563; white-space: pre-wrap; }
  .rejection-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; font-size: 13px; color: #991b1b; white-space: pre-wrap; }
  .confidential { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; font-size: 12px; color: #92400e; margin-top: 30px; }
  .confidential strong { color: #78350f; }
  .footer { margin-top: 20px; padding-top: 16px; border-top: 2px solid ${primaryColor}; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
  .footer-left { font-weight: 600; color: #374151; }
  .footer-left small { font-weight: 400; color: #9ca3af; display: block; }
</style></head><body>

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      ${logoSrc ? `<img src="${logoSrc}" alt="Logo" />` : `<div class="fallback-name">${esc(companyName)}</div>`}
    </div>
    <div class="header-right">
      <div class="label">Or\u00e7amento</div>
      <div class="number">#${quoteNum}</div>
      <div class="date">${fmtDate(quote.createdAt)}</div>
    </div>
  </div>

  <!-- STATUS BAR -->
  <div class="status-bar" style="background:${STATUS_COLOR[quote.status] || '#6b7280'};">
    ${esc(quote.title)} &mdash; ${STATUS_LABEL[quote.status] || quote.status}
  </div>

  <div class="content">
    <!-- INFO -->
    <div class="section">
      <div class="section-title">Informa\u00e7\u00f5es do Or\u00e7amento</div>
      <div class="info-grid">
        <div class="info-cell"><div class="info-label">Empresa</div><div class="info-value">${esc(quote.company?.name) || '\u2014'}</div></div>
        <div class="info-cell"><div class="info-label">Chamado Vinculado</div><div class="info-value">${quote.ticket ? '#' + quote.ticket.number + ' - ' + esc(quote.ticket.subject) : '\u2014'}</div></div>
        <div class="info-cell"><div class="info-label">Validade</div><div class="info-value">${fmtDate(quote.validUntil)}</div></div>
        <div class="info-cell"><div class="info-label">Criado por</div><div class="info-value">${esc(quote.createdByName)}</div></div>
        <div class="info-cell"><div class="info-label">Data de Cria\u00e7\u00e3o</div><div class="info-value">${fmtDate(quote.createdAt)}</div></div>
        <div class="info-cell"><div class="info-label">Status</div><div class="info-value" style="color:${STATUS_COLOR[quote.status] || '#6b7280'};font-weight:600;">${STATUS_LABEL[quote.status] || quote.status}</div></div>
      </div>
    </div>

    ${quote.description ? `<div class="section"><div class="section-title">Descri\u00e7\u00e3o</div><div class="notes-box">${esc(quote.description)}</div></div>` : ''}

    <!-- ITENS -->
    <div class="section">
      <div class="section-title">Itens do Or\u00e7amento</div>
      <table>
        <thead><tr>
          <th style="width:40px;text-align:center;">#</th>
          <th>Descri\u00e7\u00e3o</th>
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

    ${quote.notes ? `<div class="section"><div class="section-title">Observa\u00e7\u00f5es</div><div class="notes-box">${esc(quote.notes)}</div></div>` : ''}

    ${quote.rejectionReason ? `<div class="section"><div class="section-title">Motivo da Rejei\u00e7\u00e3o</div><div class="rejection-box">${esc(quote.rejectionReason)}</div></div>` : ''}

    <!-- CONFIDENCIAL -->
    <div class="confidential">
      <strong>Aviso de Confidencialidade:</strong> Este or\u00e7amento \u00e9 confidencial e destinado exclusivamente ao cliente indicado. Os valores e condi\u00e7\u00f5es contidas neste documento n\u00e3o devem ser reproduzidos ou distribu\u00eddos sem autoriza\u00e7\u00e3o pr\u00e9via.
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="footer-left">
        ${esc(companyName)}
        <small>Suporte T\u00e9cnico Especializado</small>
      </div>
      <div>
        Documento gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}<br/>
        Or\u00e7amento #${quoteNum} &bull; Gerado automaticamente pelo sistema
      </div>
    </div>
  </div>
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

  if (session.user.role === 'CLIENT') {
    if (quote.companyId !== session.user.companyId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (!['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(quote.status)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
  }

  let tenant = null;
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
    const createRes = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: html,
        pdf_options: {
          format: 'A4',
          landscape: false,
          margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
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
        const quoteNum = buildQuoteNumber(quote);
        return new NextResponse(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="orcamento-${quoteNum}.pdf"`,
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
