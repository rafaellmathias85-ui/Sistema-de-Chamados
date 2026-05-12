// Compartilhado entre rota de PDF e rota de envio de e-mail do orçamento
import path from 'path';
import fs from 'fs';

export function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

import { TIMEZONE, fmtDateBR, fmtDateLongBR, fmtMoneyBR } from '@/lib/timezone';

export function fmtMoney(v: number): string {
  return fmtMoneyBR(v);
}

export function fmtDate(d: Date | string | null): string {
  return fmtDateBR(d);
}

export function getLogoBase64(): string {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const logoBuffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch {
    return '';
  }
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', SENT: 'Enviado', APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado',
};

export const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#6b7280', SENT: '#3b82f6', APPROVED: '#22c55e',
  REJECTED: '#ef4444', EXPIRED: '#eab308', CANCELLED: '#9ca3af',
};

export function buildQuoteNumber(quote: any): string {
  if (quote.ticket?.number) {
    return `${quote.number}-${quote.ticket.number}`;
  }
  return `${quote.number}`;
}

export function buildQuoteHtml(quote: any, tenant: any): string {
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

  <div class="status-bar" style="background:${STATUS_COLOR[quote.status] || '#6b7280'};">
    ${esc(quote.title)} &mdash; ${STATUS_LABEL[quote.status] || quote.status}
  </div>

  <div class="content">
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

    <div class="confidential">
      <strong>Aviso de Confidencialidade:</strong> Este or\u00e7amento \u00e9 confidencial e destinado exclusivamente ao cliente indicado. Os valores e condi\u00e7\u00f5es contidas neste documento n\u00e3o devem ser reproduzidos ou distribu\u00eddos sem autoriza\u00e7\u00e3o pr\u00e9via.
    </div>

    <div class="footer">
      <div class="footer-left">
        ${esc(companyName)}
        <small>Suporte T\u00e9cnico Especializado</small>
      </div>
      <div>
        Documento gerado em ${fmtDateLongBR(new Date())}<br/>
        Or\u00e7amento #${quoteNum} &bull; Gerado automaticamente pelo sistema
      </div>
    </div>
  </div>
</body></html>`;
}

/**
 * Versão do template email-safe: usa TABLE layout, inline styles,
 * sem <style> block, sem flex/grid, sem base64 logo.
 * Compatível com Gmail, Outlook, Yahoo, Apple Mail.
 */
export function buildQuoteEmailHtml(quote: any, tenant: any): string {
  const companyName = process.env.REPORT_COMPANY_NAME || 'Winner Tecnologia';
  const primaryColor = '#3B82F6';
  const quoteNum = buildQuoteNumber(quote);
  const statusLabel = STATUS_LABEL[quote.status] || quote.status;
  const statusColor = STATUS_COLOR[quote.status] || '#6b7280';

  // Logo: usar URL pública se disponível; caso contrário, apenas texto
  const appUrl = process.env.NEXTAUTH_URL || '';
  const logoUrl = tenant?.logoUrl || (appUrl ? `${appUrl}/logo.png` : '');

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${esc(companyName)}" style="height:45px;width:auto;" />`
    : `<span style="color:#ffffff;font-size:20px;font-weight:800;">${esc(companyName)}</span>`;

  const itemRows = (quote.items || []).map((it: any, idx: number) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px;">${idx + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#1f2937;">${esc(it.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;color:#1f2937;">${it.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:#1f2937;">${fmtMoney(it.unitPrice)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:13px;color:#1f2937;">${fmtMoney(it.total)}</td>
    </tr>`).join('');

  const noItems = `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">Nenhum item</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Orçamento #${quoteNum}</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1f2937;background-color:#f3f4f6;">

<!-- Container -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;"><tr><td align="center" style="padding:20px 10px;">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">

  <!-- Header -->
  <tr><td style="background-color:#1e3a5f;padding:20px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">${logoHtml}</td>
      <td style="text-align:right;vertical-align:middle;">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.7);">ORÇAMENTO</span><br/>
        <span style="font-size:28px;font-weight:800;color:#ffffff;">#${quoteNum}</span><br/>
        <span style="font-size:11px;color:rgba(255,255,255,0.6);">${fmtDate(quote.createdAt)}</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- Status bar -->
  <tr><td style="background-color:${statusColor};padding:10px 30px;font-size:14px;font-weight:600;color:#ffffff;">
    ${esc(quote.title)} &mdash; ${statusLabel}
  </td></tr>

  <!-- Info section -->
  <tr><td style="padding:24px 30px;">
    <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:${primaryColor};letter-spacing:1px;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${primaryColor};">Informações do Orçamento</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;">
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;width:33%;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">EMPRESA</span><br/>
          <span style="font-size:13px;color:#1f2937;">${esc(quote.company?.name) || '—'}</span>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;border-left:1px solid #e5e7eb;width:34%;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">CHAMADO VINCULADO</span><br/>
          <span style="font-size:13px;color:#1f2937;">${quote.ticket ? '#' + quote.ticket.number + ' - ' + esc(quote.ticket.subject) : '—'}</span>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;border-left:1px solid #e5e7eb;width:33%;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">VALIDADE</span><br/>
          <span style="font-size:13px;color:#1f2937;">${fmtDate(quote.validUntil)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 14px;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">CRIADO POR</span><br/>
          <span style="font-size:13px;color:#1f2937;">${esc(quote.createdByName)}</span>
        </td>
        <td style="padding:12px 14px;border-left:1px solid #e5e7eb;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">DATA DE CRIAÇÃO</span><br/>
          <span style="font-size:13px;color:#1f2937;">${fmtDate(quote.createdAt)}</span>
        </td>
        <td style="padding:12px 14px;border-left:1px solid #e5e7eb;">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;">STATUS</span><br/>
          <span style="font-size:13px;font-weight:600;color:${statusColor};">${statusLabel}</span>
        </td>
      </tr>
    </table>
  </td></tr>

  ${quote.description ? `
  <!-- Descrição -->
  <tr><td style="padding:0 30px 24px;">
    <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:${primaryColor};letter-spacing:1px;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${primaryColor};">Descrição</p>
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:14px;font-size:13px;color:#4b5563;white-space:pre-wrap;">${esc(quote.description)}</div>
  </td></tr>` : ''}

  <!-- Itens -->
  <tr><td style="padding:0 30px 24px;">
    <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:${primaryColor};letter-spacing:1px;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${primaryColor};">Itens do Orçamento</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <th style="background:#f8fafc;color:#64748b;padding:8px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e5e7eb;width:40px;">#</th>
        <th style="background:#f8fafc;color:#64748b;padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Descrição</th>
        <th style="background:#f8fafc;color:#64748b;padding:8px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e5e7eb;width:60px;">Qtd</th>
        <th style="background:#f8fafc;color:#64748b;padding:8px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e5e7eb;width:100px;">Valor Unit.</th>
        <th style="background:#f8fafc;color:#64748b;padding:8px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #e5e7eb;width:100px;">Total</th>
      </tr>
      ${itemRows || noItems}
    </table>

    <!-- Totals -->
    <table width="280" cellpadding="0" cellspacing="0" align="right" style="margin-top:16px;background:#f8fafc;border-radius:6px;">
      <tr>
        <td style="padding:8px 16px;font-size:14px;color:#4b5563;">Subtotal</td>
        <td style="padding:8px 16px;font-size:14px;color:#4b5563;text-align:right;">${fmtMoney(quote.subtotal)}</td>
      </tr>
      ${quote.discount > 0 ? `<tr>
        <td style="padding:8px 16px;font-size:14px;color:#ef4444;">Desconto</td>
        <td style="padding:8px 16px;font-size:14px;color:#ef4444;text-align:right;">- ${fmtMoney(quote.discount)}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:12px 16px;font-size:18px;font-weight:800;color:${primaryColor};border-top:2px solid ${primaryColor};">Total</td>
        <td style="padding:12px 16px;font-size:18px;font-weight:800;color:${primaryColor};border-top:2px solid ${primaryColor};text-align:right;">${fmtMoney(quote.total)}</td>
      </tr>
    </table>
    <div style="clear:both;"></div>
  </td></tr>

  ${quote.notes ? `
  <!-- Observações -->
  <tr><td style="padding:0 30px 24px;">
    <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:${primaryColor};letter-spacing:1px;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid ${primaryColor};">Observações</p>
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:14px;font-size:13px;color:#4b5563;white-space:pre-wrap;">${esc(quote.notes)}</div>
  </td></tr>` : ''}

  ${quote.rejectionReason ? `
  <!-- Rejeição -->
  <tr><td style="padding:0 30px 24px;">
    <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:#ef4444;letter-spacing:1px;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #ef4444;">Motivo da Rejeição</p>
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px;font-size:13px;color:#991b1b;white-space:pre-wrap;">${esc(quote.rejectionReason)}</div>
  </td></tr>` : ''}

  <!-- Confidential -->
  <tr><td style="padding:0 30px 20px;">
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;font-size:12px;color:#92400e;">
      <strong style="color:#78350f;">Aviso de Confidencialidade:</strong> Este orçamento é confidencial e destinado exclusivamente ao cliente indicado. Os valores e condições contidas neste documento não devem ser reproduzidos ou distribuídos sem autorização prévia.
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 30px;border-top:2px solid ${primaryColor};">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top;">
        <span style="font-size:12px;font-weight:600;color:#374151;">${esc(companyName)}</span><br/>
        <span style="font-size:11px;color:#9ca3af;">Suporte Técnico Especializado</span>
      </td>
      <td style="text-align:right;vertical-align:top;">
        <span style="font-size:11px;color:#9ca3af;">Documento gerado em ${fmtDateLongBR(new Date())}</span><br/>
        <span style="font-size:11px;color:#9ca3af;">Orçamento #${quoteNum} &bull; Gerado automaticamente pelo sistema</span>
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// Gera PDF via API Abacus, retornando Buffer (ou null se falhar)
export async function generateQuotePdfBuffer(html: string): Promise<Buffer | null> {
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
      console.error('[QuotePDF] create failed:', await createRes.text());
      return null;
    }
    const { request_id } = await createRes.json();
    if (!request_id) return null;

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const statusRes = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
      });
      const statusData = await statusRes.json();
      if (statusData?.status === 'SUCCESS' && statusData?.result?.result) {
        return Buffer.from(statusData.result.result, 'base64');
      }
      if (statusData?.status === 'FAILED') {
        console.error('[QuotePDF] failed:', statusData?.result);
        return null;
      }
    }
    return null;
  } catch (e) {
    console.error('[QuotePDF] erro:', e);
    return null;
  }
}
