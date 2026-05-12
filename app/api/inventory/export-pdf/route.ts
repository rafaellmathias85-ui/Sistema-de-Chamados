import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function usageColor(val: number | null): string {
  if (val == null) return '#64748b';
  if (val >= 90) return '#ef4444';
  if (val >= 70) return '#eab308';
  return '#22c55e';
}

function usageBar(val: number | null): string {
  if (val == null) return '<span style="color:#64748b;">—</span>';
  const color = usageColor(val);
  const pct = Math.min(val, 100);
  return `<div style="display:flex;align-items:center;gap:6px;">
    <span style="font-size:12px;font-family:monospace;color:${color};min-width:42px;">${val.toFixed(1)}%</span>
    <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;min-width:50px;">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;"></div>
    </div>
  </div>`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const statusFilter = url.searchParams.get('status') || '';

    const where: any = {};
    if (session.user.role === 'CLIENT') {
      if (!session.user.companyId) {
        return NextResponse.json({ error: 'Sem empresa vinculada' }, { status: 403 });
      }
      where.companyId = session.user.companyId;
    } else if (['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      const companyId = url.searchParams.get('companyId');
      if (companyId) where.companyId = companyId;
    }

    if (statusFilter) where.status = statusFilter;
    if (search) {
      where.OR = [
        { hostname: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { os: { contains: search, mode: 'insensitive' } },
      ];
    }

    const machines = await prisma.rmmMachine.findMany({
      where,
      include: { company: { select: { name: true } } },
      orderBy: { hostname: 'asc' },
    });

    const isStaff = ['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role);
    const onlineCount = machines.filter((m: any) => m.status === 'Ligado').length;
    const offlineCount = machines.length - onlineCount;

    const tableRows = machines.map((m: any) => {
      const statusBadge = m.status === 'Ligado'
        ? '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#dcfce7;color:#16a34a;">Online</span>'
        : '<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#fee2e2;color:#dc2626;">Offline</span>';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:500;">${escapeHtml(m.hostname || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${escapeHtml(m.username || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${escapeHtml(m.os || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${statusBadge}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${usageBar(m.cpuUsage)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${usageBar(m.ramUsage)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${usageBar(m.diskUsage)}</td>
        ${isStaff ? `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${escapeHtml(m.company?.name || '—')}</td>` : ''}
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; }
  .header { background: linear-gradient(135deg, #0f172a 0%, #164e63 100%); color: #fff; padding: 28px 30px; }
  .header h1 { margin: 0 0 4px 0; font-size: 20px; font-weight: 700; }
  .header p { margin: 0; font-size: 12px; opacity: 0.8; }
  .content { padding: 20px 30px; }
  .stats { display: flex; gap: 12px; margin-bottom: 20px; }
  .stat-card { flex: 1; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; }
  .stat-value { font-size: 22px; font-weight: 700; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  thead tr { background: #f1f5f9; }
  th { padding: 10px 10px; text-align: left; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
  .footer { text-align: center; padding: 16px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; margin-top: 24px; }
</style></head><body>
  <div class="header">
    <h1>Inventário de Máquinas</h1>
    <p>Relatório gerado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
  </div>
  <div class="content">
    <div class="stats">
      <div class="stat-card"><div class="stat-value" style="color:#0ea5e9;">${machines.length}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#22c55e;">${onlineCount}</div><div class="stat-label">Online</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#ef4444;">${offlineCount}</div><div class="stat-label">Offline</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Hostname</th>
        <th>Usuário</th>
        <th>SO</th>
        <th style="text-align:center;">Status</th>
        <th>CPU</th>
        <th>RAM</th>
        <th>Disco</th>
        ${isStaff ? '<th>Empresa</th>' : ''}
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <div class="footer">Winner Tecnologia · Inventário de Máquinas</div>
</body></html>`;

    // Call HTML2PDF API
    const createRes = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: html,
        pdf_options: {
          format: 'A4',
          landscape: true,
          margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
          print_background: true,
        },
      }),
    });

    if (!createRes.ok) {
      console.error('PDF create failed:', await createRes.text());
      return NextResponse.json({ error: 'Falha ao gerar PDF' }, { status: 500 });
    }

    const { request_id } = await createRes.json();
    if (!request_id) {
      return NextResponse.json({ error: 'Sem request_id do PDF' }, { status: 500 });
    }

    // Poll for result
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const statusRes = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
      });
      const statusData = await statusRes.json();
      if (statusData?.status === 'SUCCESS' && statusData?.result?.result) {
        const pdfBuffer = Buffer.from(statusData.result.result, 'base64');
        const dateStr = new Date().toISOString().slice(0, 10);
        return new NextResponse(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="inventario-${dateStr}.pdf"`,
          },
        });
      }
      if (statusData?.status === 'FAILED') {
        console.error('PDF generation failed:', statusData?.result);
        return NextResponse.json({ error: 'Falha na geração do PDF' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Timeout na geração do PDF' }, { status: 500 });
  } catch (error) {
    console.error('Error generating inventory PDF:', error);
    return NextResponse.json({ error: 'Erro ao gerar relatório PDF' }, { status: 500 });
  }
}
