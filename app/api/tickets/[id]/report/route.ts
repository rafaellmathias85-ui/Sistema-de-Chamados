import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  OPEN: 'Aberto', IN_PROGRESS: 'Em Andamento', IN_PARTNER: 'Com Parceiro',
  PAUSED: 'Pausado', AWAITING_CLIENT: 'Aguardando Cliente',
  RESOLVED: 'Resolvido', CLOSED: 'Fechado',
};
const priorityLabels: Record<string, string> = {
  LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica', NONE: 'Sem SLA',
};
const priorityColors: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444', NONE: '#94a3b8',
};
const statusColors: Record<string, string> = {
  OPEN: '#eab308', IN_PROGRESS: '#a855f7', IN_PARTNER: '#6366f1',
  PAUSED: '#f97316', AWAITING_CLIENT: '#06b6d4', RESOLVED: '#22c55e', CLOSED: '#6b7280',
};

function fmtDate(d: Date | string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(d: Date | string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function calcResolutionTime(createdAt: Date | string, resolvedAt: Date | string | null): string {
  if (!resolvedAt) return '\u2014';
  const diff = new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes} minutos`;
}

/**
 * Limpa HTML de email para exibição no PDF.
 * Remove tags perigosas/complexas que o Playwright não renderiza bem no PDF.
 */
function cleanHtmlForPdf(html: string): string {
  // Remove style tags e conteúdo
  let clean = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove script tags
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove links (manter texto)
  clean = clean.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
  // Remover imagens grandes (CID, inline) que quebram o layout
  clean = clean.replace(/<img[^>]*>/gi, '');
  // Limitar largura de tabelas
  clean = clean.replace(/<table/gi, '<table style="max-width:100%;border-collapse:collapse;"');
  return clean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { name: true, email: true } },
        assignee: { select: { name: true } },
        company: { select: { name: true } },
        category: { select: { name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Chamado n\u00e3o encontrado' }, { status: 404 });
    }

    if (session.user.role === 'CLIENT' && ticket.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Notas internas NÃO entram no PDF (informação interna da equipe)
    const messages = ticket.messages.filter((m: any) => !m.isInternal);

    const tenant = await prisma.tenant.findFirst();
    const html = buildReportHtml(ticket, messages, tenant);

    const { htmlToPdf } = await import('@/lib/pdf');
    const pdfBuffer = await htmlToPdf(html, {
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
      printBackground: true,
    });
    if (!pdfBuffer) {
      return NextResponse.json({ error: 'Falha ao gerar PDF' }, { status: 500 });
    }
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio_chamado_${ticket.number}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json({ error: 'Erro ao gerar relat\u00f3rio' }, { status: 500 });
  }
}

function buildReportHtml(ticket: any, messages: any[], tenant: any) {
  const logoSrc = tenant?.logoUrl ? tenant.logoUrl : getLogoBase64();
  // Nome da empresa para o relatório: prioriza env var > tenant do banco > fallback
  // Nome fixo para o relatório PDF — não usar tenant.name para evitar nomes herdados de cadastros antigos
  const companyName = process.env.REPORT_COMPANY_NAME || 'Winner Tecnologia';

  const resStart = ticket.serviceStartedAt || ticket.createdAt;
  const resEnd = ticket.serviceEndedAt || ticket.resolvedAt || ticket.closedAt;
  const resTime = calcResolutionTime(resStart, resEnd);
  const genDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' });
  const genTime = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  // Messages HTML
  const msgHtml = messages.map((m: any, idx: number) => {
    const isClient = m.authorRole === 'CLIENT';
    const roleName = isClient ? 'Cliente' : (m.authorRole === 'ADMIN' ? 'Administrador' : 'Suporte T\u00e9cnico');
    const roleColor = isClient ? '#2563eb' : (m.authorRole === 'ADMIN' ? '#9f1239' : '#166534');
    const roleBg = isClient ? '#dbeafe' : (m.authorRole === 'ADMIN' ? '#fce7f3' : '#dcfce7');
    const borderColor = isClient ? '#93c5fd' : (m.authorRole === 'ADMIN' ? '#f9a8d4' : '#86efac');
    const contentBg = isClient ? '#f0f7ff' : (m.authorRole === 'ADMIN' ? '#fdf2f8' : '#f0fdf4');

    // Corpo da mensagem: prioriza bodyClean > contentHtml (sanitizado) > content (texto puro)
    let bodyHtml: string;
    if (m.bodyClean) {
      bodyHtml = `<div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(m.bodyClean)}</div>`;
    } else if (m.contentHtml) {
      bodyHtml = `<div style="line-height:1.6;word-break:break-word;max-width:100%;overflow:hidden;">${cleanHtmlForPdf(m.contentHtml)}</div>`;
    } else {
      bodyHtml = `<div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(m.content || '')}</div>`;
    }



    return `
    <div style="margin-bottom:16px;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:32px;height:32px;border-radius:50%;background:${roleBg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:${roleColor};border:2px solid ${borderColor};">
            ${(m.authorName || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <span style="font-weight:600;font-size:13px;color:#0f172a;">${escapeHtml(m.authorName || 'Sistema')}</span>
            <span style="display:inline-block;margin-left:8px;background:${roleBg};color:${roleColor};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;">${roleName}</span>
          </div>
        </div>
        <span style="font-size:11px;color:#94a3b8;white-space:nowrap;">${fmtDate(m.createdAt)}</span>
      </div>
      <div style="background:${contentBg};border-radius:10px;padding:14px 16px;font-size:12.5px;line-height:1.7;color:#1e293b;border-left:4px solid ${borderColor};margin-left:18px;">
        ${bodyHtml}
      </div>
    </div>`;
  }).join('');

  // Resumo das interações
  const clientCount = messages.filter((m: any) => m.authorRole === 'CLIENT').length;
  const staffCount = messages.filter((m: any) => m.authorRole !== 'CLIENT').length;

  // Descrição
  let descriptionHtml = '';
  if (ticket.descriptionHtml) {
    descriptionHtml = cleanHtmlForPdf(ticket.descriptionHtml);
  } else if (ticket.description) {
    descriptionHtml = `<div style="white-space:pre-wrap;">${escapeHtml(ticket.description)}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    color: #1e293b;
    font-size: 13px;
    line-height: 1.5;
    background: #fff;
  }

  /* ========== HEADER ========== */
  .rpt-header {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%);
    padding: 28px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .rpt-header-left { display: flex; align-items: center; gap: 16px; }
  .rpt-header-right { text-align: right; }
  .rpt-header-right .rpt-label {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.6);
    margin-bottom: 2px;
  }
  .rpt-header-right .rpt-ticket-num {
    font-size: 32px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.5px;
  }
  .rpt-header-right .rpt-date {
    font-size: 10px;
    color: rgba(255,255,255,0.5);
    margin-top: 2px;
  }

  /* ========== SUBJECT BAR ========== */
  .rpt-subject {
    background: #2563eb;
    color: #fff;
    padding: 14px 32px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  /* ========== CONTENT ========== */
  .rpt-content { padding: 28px 32px; }

  /* ========== SECTION LABELS ========== */
  .rpt-section {
    font-size: 11px;
    font-weight: 700;
    color: #2563eb;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin: 28px 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #dbeafe;
  }
  .rpt-section:first-child { margin-top: 0; }

  /* ========== INFO GRID ========== */
  .rpt-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: #f8fafc;
  }
  .rpt-info-cell {
    padding: 12px 16px;
    border-bottom: 1px solid #e2e8f0;
    border-right: 1px solid #e2e8f0;
  }
  .rpt-info-cell:nth-child(3n) { border-right: none; }
  .rpt-info-cell:nth-last-child(-n+3) { border-bottom: none; }
  .rpt-info-cell .rpt-cell-label {
    font-size: 10px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .rpt-info-cell .rpt-cell-value {
    font-size: 13px;
    font-weight: 500;
    color: #0f172a;
  }

  /* ========== BADGES ========== */
  .rpt-badge {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 14px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
  }
  .rpt-priority-badge {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 14px;
    font-size: 11px;
    font-weight: 700;
  }

  /* ========== DESCRIPTION ========== */
  .rpt-description {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 20px;
    font-size: 13px;
    line-height: 1.7;
    color: #334155;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  /* ========== INTERACTIONS COUNTER ========== */
  .rpt-interactions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 28px 0 14px;
    padding-bottom: 6px;
    border-bottom: 2px solid #dbeafe;
  }
  .rpt-interactions-label {
    font-size: 11px;
    font-weight: 700;
    color: #2563eb;
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }
  .rpt-interactions-count {
    font-size: 11px;
    color: #64748b;
    font-weight: 500;
  }

  /* ========== FOOTER ========== */
  .rpt-footer {
    margin-top: 30px;
    padding-top: 16px;
    border-top: 2px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #94a3b8;
    line-height: 1.5;
  }

  /* ========== NOTICE ========== */
  .rpt-notice {
    margin-top: 24px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 10px;
    padding: 14px 18px;
    font-size: 11px;
    color: #0c4a6e;
    line-height: 1.6;
  }
  .rpt-notice strong { color: #075985; }
</style>
</head>
<body>

  <!-- HEADER -->
  <div class="rpt-header">
    <div class="rpt-header-left">
      ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="height:50px;width:auto;" />` : `<div style="color:#fff;font-size:22px;font-weight:800;">${escapeHtml(companyName)}</div>`}
    </div>
    <div class="rpt-header-right">
      <div class="rpt-label">Relat\u00f3rio de Chamado</div>
      <div class="rpt-ticket-num">#${ticket.number}</div>
      <div class="rpt-date">${genDate} \u00e0s ${genTime}</div>
    </div>
  </div>

  <!-- SUBJECT -->
  <div class="rpt-subject">${escapeHtml(ticket.subject)}</div>

  <div class="rpt-content">

    <!-- INFO SECTION -->
    <div class="rpt-section" style="margin-top:0;">Informa\u00e7\u00f5es do Chamado</div>
    <div class="rpt-info-grid">
      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Status</div>
        <div class="rpt-cell-value"><span class="rpt-badge" style="background:${statusColors[ticket.status] || '#6b7280'};">${statusLabels[ticket.status] || ticket.status}</span></div>
      </div>
      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Prioridade</div>
        <div class="rpt-cell-value"><span class="rpt-priority-badge" style="background:${(priorityColors[ticket.priority] || '#94a3b8')}22;color:${priorityColors[ticket.priority] || '#94a3b8'};border:1px solid ${priorityColors[ticket.priority] || '#94a3b8'};">${priorityLabels[ticket.priority] || ticket.priority}</span></div>
      </div>
      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Categoria</div>
        <div class="rpt-cell-value">${escapeHtml(ticket.category?.name || '\u2014')}</div>
      </div>

      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Data de Abertura</div>
        <div class="rpt-cell-value">${fmtDate(ticket.createdAt)}</div>
      </div>
      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Data de Encerramento</div>
        <div class="rpt-cell-value">${fmtDate(ticket.closedAt || ticket.resolvedAt)}</div>
      </div>
      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Tempo de Resolu\u00e7\u00e3o</div>
        <div class="rpt-cell-value">${resTime}</div>
      </div>

      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Solicitante</div>
        <div class="rpt-cell-value">${escapeHtml(ticket.creator?.name || '\u2014')}</div>
      </div>
      <div class="rpt-info-cell">
        <div class="rpt-cell-label">T\u00e9cnico Respons\u00e1vel</div>
        <div class="rpt-cell-value">${escapeHtml(ticket.assignee?.name || 'N\u00e3o atribu\u00eddo')}</div>
      </div>
      <div class="rpt-info-cell">
        <div class="rpt-cell-label">Empresa</div>
        <div class="rpt-cell-value">${escapeHtml(ticket.company?.name || '\u2014')}</div>
      </div>
    </div>

    ${descriptionHtml ? `
    <!-- DESCRI\u00c7\u00c3O -->
    <div class="rpt-section">Descri\u00e7\u00e3o do Chamado</div>
    <div class="rpt-description">${descriptionHtml}</div>` : ''}

    <!-- INTERA\u00c7\u00d5ES -->
    ${messages.length > 0 ? `
    <div class="rpt-interactions-header">
      <span class="rpt-interactions-label">Hist\u00f3rico de Intera\u00e7\u00f5es</span>
      <span class="rpt-interactions-count">${messages.length} intera\u00e7\u00e3o(es) &mdash; ${clientCount} cliente / ${staffCount} suporte</span>
    </div>
    ${msgHtml}` : `
    <div class="rpt-section">Hist\u00f3rico de Intera\u00e7\u00f5es</div>
    <div style="text-align:center;padding:24px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:13px;color:#94a3b8;font-style:italic;">Nenhuma intera\u00e7\u00e3o registrada neste chamado.</div>`}

    <!-- AVISO DE CONFIDENCIALIDADE -->
    <div class="rpt-notice">
      <strong>Aviso de Confidencialidade:</strong> Este relat\u00f3rio \u00e9 confidencial e destinado exclusivamente ao cliente solicitante.
      As informa\u00e7\u00f5es contidas neste documento referem-se ao atendimento prestado pela ${escapeHtml(companyName)}
      e n\u00e3o devem ser reproduzidas ou distribu\u00eddas sem autoriza\u00e7\u00e3o pr\u00e9via.
    </div>

    <!-- FOOTER -->
    <div class="rpt-footer">
      <div>
        <strong>${escapeHtml(companyName)}</strong><br/>
        Suporte T\u00e9cnico Especializado
      </div>
      <div style="text-align:right;">
        Documento gerado em ${genDate} \u00e0s ${genTime}<br/>
        Ticket #${ticket.number} &bull; Gerado automaticamente pelo sistema de chamados
      </div>
    </div>
  </div>

</body></html>`;
}