import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  OPEN: 'Aberto', IN_PROGRESS: 'Em Andamento', IN_PARTNER: 'Com Parceiro',
  PAUSED: 'Pausado', AWAITING_CLIENT: 'Aguardando Cliente', RESOLVED: 'Resolvido', CLOSED: 'Fechado',
};

const clientTypeLabels: Record<string, string> = {
  CONTRATO: 'Contrato', AVULSO: 'Avulso', PROJETO: 'Projeto', PARCEIRO: 'Parceiro',
};

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const companyId = searchParams.get('companyId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const hasValue = searchParams.get('hasValue');
    const faturadoFilter = searchParams.get('faturado');
    const search = searchParams.get('search');

    const dateField = searchParams.get('dateField') || 'createdAt';

    const where: any = { forwardedToFinance: true };
    if (companyId) where.companyId = companyId;
    if (dateFrom || dateTo) {
      const field = dateField === 'dataFaturamento' ? 'dataFaturamento' : 'createdAt';
      where[field] = {};
      if (dateFrom) where[field].gte = new Date(dateFrom);
      if (dateTo) where[field].lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    if (hasValue === 'true') where.financialValue = { not: null };
    else if (hasValue === 'false') where.financialValue = null;
    if (faturadoFilter === 'true') where.faturado = true;
    else if (faturadoFilter === 'false') where.faturado = false;
    if (search) {
      const num = parseInt(search);
      if (!isNaN(num)) where.OR = [{ number: num }, { subject: { contains: search, mode: 'insensitive' } }];
      else where.subject = { contains: search, mode: 'insensitive' };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        creator: { select: { name: true, email: true } },
        company: { select: { name: true, clientType: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatCurrency = (v: any) => v ? Number(v).toFixed(2).replace('.', ',') : '';
    const formatDate = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '';

    if (format === 'csv') {
      const header = 'Número;Empresa;Tipo;Assunto;Status;Criado em;Valor (R$);Faturado;Data Faturamento;Observações';
      const rows = tickets.map(t => [
        t.number,
        `"${t.company.name}"`,
        clientTypeLabels[t.company.clientType] || t.company.clientType,
        `"${t.subject.replace(/"/g, '""')}"`,
        statusLabels[t.status] || t.status,
        formatDate(t.createdAt),
        formatCurrency(t.financialValue),
        t.faturado ? 'Sim' : 'Não',
        formatDate(t.dataFaturamento),
        `"${(t.financialNotes || '').replace(/"/g, '""')}"`
      ].join(';'));

      const csvContent = '﻿' + [header, ...rows].join('\n');
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="financeiro_${new Date().toISOString().slice(0,10)}.csv"`,
        },
      });
    }

    // HTML for PDF rendering (client-side via print)
    return NextResponse.json({ tickets: tickets.map(t => ({
      number: t.number,
      company: t.company.name,
      clientType: clientTypeLabels[t.company.clientType] || t.company.clientType,
      subject: t.subject,
      status: statusLabels[t.status] || t.status,
      createdAt: formatDate(t.createdAt),
      value: formatCurrency(t.financialValue),
      faturado: t.faturado ? 'Sim' : 'Não',
      dataFaturamento: formatDate(t.dataFaturamento),
      notes: t.financialNotes || '',
    }))});
  } catch (error) {
    console.error('Error exporting finance:', error);
    return NextResponse.json({ error: 'Erro ao exportar' }, { status: 500 });
  }
}
