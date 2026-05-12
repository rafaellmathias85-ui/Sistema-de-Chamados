import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  OPEN: 'Aberto', IN_PROGRESS: 'Em Andamento', IN_PARTNER: 'Com Parceiro',
  PAUSED: 'Pausado', AWAITING_CLIENT: 'Aguardando Cliente',
  RESOLVED: 'Resolvido', CLOSED: 'Fechado',
};
const priorityLabels: Record<string, string> = {
  LOW: 'Baixa', MEDIUM: 'M\u00e9dia', HIGH: 'Alta', CRITICAL: 'Cr\u00edtica',
};

function csvEscape(val: string | null | undefined) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });
    }

    if (!['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role as string)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'csv').toLowerCase();
    const statusFilter = url.searchParams.get('status') || '';
    const priorityFilter = url.searchParams.get('priority') || '';
    const companyId = url.searchParams.get('companyId') || '';
    const assigneeId = url.searchParams.get('assigneeId') || '';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    const forwardedToFinance = url.searchParams.get('forwardedToFinance');

    const where: any = {};
    if (statusFilter) where.status = statusFilter;
    if (priorityFilter) where.priority = priorityFilter;
    if (companyId) where.companyId = companyId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (forwardedToFinance === 'true') where.forwardedToFinance = true;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        creator: { select: { name: true, email: true } },
        assignee: { select: { name: true, email: true } },
        company: { select: { name: true, domain: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Campos comuns para todos os formatos
    const rowsPlain = tickets.map((t: any) => ({
      numero: t.number,
      assunto: t.subject,
      descricao: (t.description || '').slice(0, 2000),
      status: statusLabels[t.status] || t.status,
      prioridade: priorityLabels[t.priority] || t.priority,
      empresa: t.company?.name || '',
      empresaDominio: t.company?.domain || '',
      solicitante: t.creator?.name || '',
      solicitanteEmail: t.creator?.email || '',
      responsavel: t.assignee?.name || 'N\u00e3o atribu\u00eddo',
      responsavelEmail: t.assignee?.email || '',
      categoria: t.category?.name || '',
      financeiro: t.forwardedToFinance ? 'Sim' : 'N\u00e3o',
      valor: t.financialValue ? Number(t.financialValue) : null,
      faturado: t.faturado ? 'Sim' : 'N\u00e3o',
      criadoEm: fmtDate(t.createdAt),
      atualizadoEm: fmtDate(t.updatedAt),
      resolvidoEm: fmtDate(t.resolvedAt),
      fechadoEm: fmtDate(t.closedAt),
      source: t.source || 'web',
    }));

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      return new NextResponse(JSON.stringify(rowsPlain, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="chamados-export-${stamp}.json"`,
        },
      });
    }

    if (format === 'xlsx' || format === 'xls') {
      const ws = XLSX.utils.json_to_sheet(rowsPlain);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Chamados');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="chamados-export-${stamp}.xlsx"`,
        },
      });
    }

    // Default CSV
    const headers = Object.keys(rowsPlain[0] || { numero: '', assunto: '', descricao: '', status: '', prioridade: '', empresa: '', empresaDominio: '', solicitante: '', solicitanteEmail: '', responsavel: '', responsavelEmail: '', categoria: '', financeiro: '', valor: '', faturado: '', criadoEm: '', atualizadoEm: '', resolvidoEm: '', fechadoEm: '', source: '' });
    const csvRows = rowsPlain.map((r: any) => headers.map((h) => csvEscape(r[h] == null ? '' : String(r[h]))).join(','));
    const bom = '\uFEFF';
    const csv = bom + headers.join(',') + '\n' + csvRows.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="chamados-export-${stamp}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting tickets:', error);
    return NextResponse.json({ error: 'Erro ao exportar' }, { status: 500 });
  }
}
