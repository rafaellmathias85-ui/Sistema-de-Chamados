import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em Andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
  IN_PARTNER: 'Com Parceiro',
  PAUSED: 'Pausado',
  AWAITING_CLIENT: 'Aguardando Cliente'
};

const priorityLabels: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica'
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return new Date(date).toLocaleString('pt-BR');
}

// GET - Exportar relatório em CSV, XLS ou PDF
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const type = searchParams.get('type') || 'overview';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyId = searchParams.get('companyId');
    const period = searchParams.get('period') || 'day';

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const where: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;
    if (companyId) where.companyId = companyId;

    // Buscar dados baseado no tipo de relatório
    let data: (string | number | null)[][];
    let headers: string[];
    let title: string;

    switch (type) {
      case 'overview':
      case 'timeline':
      default: {
        const tickets = await prisma.ticket.findMany({
          where,
          include: {
            creator: { select: { name: true, email: true } },
            assignee: { select: { name: true } },
            company: { select: { name: true } },
            category: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        });

        headers = [
          'Número',
          'Assunto',
          'Status',
          'Prioridade',
          'Categoria',
          'Empresa',
          'Criador',
          'Email',
          'Atribuído',
          'Criado em',
          'Resolvido em'
        ];

        data = tickets.map((t: any) => ([
          t.number,
          t.subject,
          statusLabels[t.status],
          priorityLabels[t.priority],
          t.category?.name || 'Sem categoria',
          t.company.name,
          t.creator.name,
          t.creator.email,
          t.assignee?.name || 'Não atribuído',
          formatDate(t.createdAt),
          formatDate(t.resolvedAt)
        ]));

        title = 'Relatório de Chamados';
        break;
      }

      case 'sla': {
        const tickets = await prisma.ticket.findMany({
          where: {
            ...where,
            OR: [
              { responseDueAt: { not: null } },
              { resolutionDueAt: { not: null } }
            ]
          },
          include: {
            company: { select: { name: true } },
            assignee: { select: { name: true } }
          },
          orderBy: { createdAt: 'desc' }
        });

        headers = [
          'Número',
          'Assunto',
          'Prioridade',
          'Empresa',
          'Atribuído',
          'Prazo Resposta',
          'Primeira Resposta',
          'Status Resposta',
          'Prazo Resolução',
          'Resolvido em',
          'Status Resolução'
        ];

        data = tickets.map((t: any) => {
          const responseStatus = t.responseDueAt && t.firstResponseAt
            ? new Date(t.firstResponseAt) <= new Date(t.responseDueAt) ? 'No prazo' : 'Atrasado'
            : t.responseDueAt && new Date() > new Date(t.responseDueAt) ? 'Vencido' : 'Pendente';

          const resolutionStatus = t.resolutionDueAt && t.resolvedAt
            ? new Date(t.resolvedAt) <= new Date(t.resolutionDueAt) ? 'No prazo' : 'Atrasado'
            : t.resolutionDueAt && new Date() > new Date(t.resolutionDueAt) ? 'Vencido' : 'Pendente';

          return [
            t.number,
            t.subject,
            priorityLabels[t.priority],
            t.company.name,
            t.assignee?.name || 'Não atribuído',
            formatDate(t.responseDueAt),
            formatDate(t.firstResponseAt),
            responseStatus,
            formatDate(t.resolutionDueAt),
            formatDate(t.resolvedAt),
            resolutionStatus
          ];
        });

        title = 'Relatório de SLA';
        break;
      }

      case 'performance': {
        const assignees = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'SUPPORT'] } },
          select: {
            id: true,
            name: true,
            ticketsAssigned: {
              where,
              select: {
                status: true,
                createdAt: true,
                resolvedAt: true,
                resolutionDueAt: true
              }
            }
          }
        });

        headers = [
          'Atendente',
          'Total de Chamados',
          'Resolvidos',
          'Em Aberto',
          'Em Andamento',
          'Tempo Médio (h)',
          'Conformidade SLA (%)'
        ];

        data = assignees.map((a: any) => {
          const tickets = a.ticketsAssigned;
          const resolved = tickets.filter((t: any) => t.status === 'RESOLVED' || t.status === 'CLOSED');
          const avgTime = resolved.length > 0
            ? resolved.reduce((acc: any, t: any) => {
                if (t.resolvedAt) {
                  return acc + (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime());
                }
                return acc;
              }, 0) / resolved.length / (1000 * 60 * 60)
            : 0;

          const slaCompliance = tickets.filter((t: any) =>
            t.resolutionDueAt && t.resolvedAt &&
            new Date(t.resolvedAt) <= new Date(t.resolutionDueAt)
          ).length;

          return [
            a.name,
            tickets.length,
            resolved.length,
            tickets.filter((t: any) => t.status === 'OPEN').length,
            tickets.filter((t: any) => t.status === 'IN_PROGRESS').length,
            Math.round(avgTime * 10) / 10,
            tickets.length > 0 ? Math.round((slaCompliance / tickets.length) * 100) : 100
          ];
        });

        title = 'Relatório de Performance';
        break;
      }

      case 'companies': {
        const companies = await prisma.company.findMany({
          select: {
            name: true,
            tickets: {
              where,
              select: {
                status: true,
                priority: true
              }
            }
          }
        });

        headers = [
          'Empresa',
          'Total de Chamados',
          'Abertos',
          'Em Andamento',
          'Resolvidos',
          'Fechados',
          'Críticos'
        ];

        data = companies
          .filter((c: any) => c.tickets.length > 0)
          .map((c: any) => ([
            c.name,
            c.tickets.length,
            c.tickets.filter((t: any) => t.status === 'OPEN').length,
            c.tickets.filter((t: any) => t.status === 'IN_PROGRESS').length,
            c.tickets.filter((t: any) => t.status === 'RESOLVED').length,
            c.tickets.filter((t: any) => t.status === 'CLOSED').length,
            c.tickets.filter((t: any) => t.priority === 'CRITICAL').length
          ]))
          .sort((a: any, b: any) => (b[1] as number) - (a[1] as number));

        title = 'Relatório por Empresa';
        break;
      }
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const periodStr = startDate && endDate ? ` (${startDate} a ${endDate})` : '';

    // Exportar no formato solicitado
    if (format === 'csv') {
      return exportCSV(headers, data, title, dateStr);
    } else if (format === 'xls') {
      return exportXLS(headers, data, title, dateStr, periodStr);
    } else if (format === 'pdf') {
      return await exportPDF(headers, data, title, dateStr, periodStr);
    }

    return NextResponse.json({ error: 'Formato inválido' }, { status: 400 });

  } catch (error) {
    console.error('Erro ao exportar relatório:', error);
    return NextResponse.json(
      { error: 'Erro ao exportar relatório' },
      { status: 500 }
    );
  }
}

function exportCSV(headers: string[], data: (string | number | null)[][], title: string, dateStr: string) {
  const rows = data.map(row =>
    row.map(cell => {
      const str = String(cell ?? '');
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(';')
  );

  const csv = [headers.join(';'), ...rows].join('\n');
  const bom = '﻿';

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="relatorio_${dateStr}.csv"`
    }
  });
}

function exportXLS(headers: string[], data: (string | number | null)[][], title: string, dateStr: string, periodStr: string) {
  // Gerar XML no formato Excel 2003 (compatível com Excel moderno)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Size="11"/>
      <Interior ss:Color="#3B82F6" ss:Pattern="Solid"/>
      <Font ss:Color="#FFFFFF"/>
      <Alignment ss:Horizontal="Center"/>
    </Style>
    <Style ss:ID="title">
      <Font ss:Bold="1" ss:Size="14"/>
      <Alignment ss:Horizontal="Center"/>
    </Style>
    <Style ss:ID="date">
      <Font ss:Size="10" ss:Color="#666666"/>
      <Alignment ss:Horizontal="Center"/>
    </Style>
    <Style ss:ID="data">
      <Alignment ss:Vertical="Center"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Relatório">
    <Table>
      <Row>
        <Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="title">
          <Data ss:Type="String">${escapeXml(title)}</Data>
        </Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="${headers.length - 1}" ss:StyleID="date">
          <Data ss:Type="String">Gerado em: ${new Date().toLocaleString('pt-BR')}${periodStr}</Data>
        </Cell>
      </Row>
      <Row></Row>
      <Row>
        ${headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}
      </Row>
      ${data.map(row => `
      <Row>
        ${row.map(cell => {
          const value = cell ?? '';
          const type = typeof value === 'number' ? 'Number' : 'String';
          return `<Cell ss:StyleID="data"><Data ss:Type="${type}">${escapeXml(String(value))}</Data></Cell>`;
        }).join('')}
      </Row>`).join('')}
    </Table>
  </Worksheet>
</Workbook>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': `attachment; filename="relatorio_${dateStr}.xls"`
    }
  });
}

async function exportPDF(headers: string[], data: (string | number | null)[][], title: string, dateStr: string, periodStr: string) {
  // Gerar HTML para PDF
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Helvetica', 'Arial', sans-serif;
      font-size: 10px;
      color: #333;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #3B82F6;
    }
    .header h1 {
      font-size: 18px;
      color: #1e3a5f;
      margin-bottom: 5px;
    }
    .header .date {
      font-size: 10px;
      color: #666;
    }
    .logo {
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th {
      background-color: #3B82F6;
      color: white;
      padding: 8px 6px;
      text-align: left;
      font-size: 9px;
      font-weight: 600;
    }
    td {
      padding: 6px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 9px;
    }
    tr:nth-child(even) {
      background-color: #f9fafb;
    }
    tr:hover {
      background-color: #f3f4f6;
    }
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 8px;
      color: #666;
    }
    .summary {
      margin-bottom: 15px;
      padding: 10px;
      background-color: #f0f9ff;
      border-radius: 5px;
    }
    .summary-item {
      display: inline-block;
      margin-right: 20px;
    }
    .summary-label {
      font-weight: 600;
      color: #1e3a5f;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <strong style="color: #3B82F6; font-size: 16px;">Winner Tecnologia</strong>
    </div>
    <h1>${title}</h1>
    <p class="date">Gerado em: ${new Date().toLocaleString('pt-BR')}${periodStr}</p>
  </div>

  <div class="summary">
    <span class="summary-item"><span class="summary-label">Total de registros:</span> ${data.length}</span>
  </div>

  <table>
    <thead>
      <tr>
        ${headers.map(h => `<th>${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
      <tr>
        ${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Winner Tecnologia - Sistema de Gestão de Chamados</p>
    <p>Este documento foi gerado automaticamente e não requer assinatura.</p>
  </div>
</body>
</html>`;

  try {
    // Criar requisição de PDF
    const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: html,
        pdf_options: {
          format: 'A4',
          landscape: headers.length > 8,
          margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
          print_background: true
        }
      })
    });

    if (!createResponse.ok) {
      throw new Error('Falha ao criar requisição de PDF');
    }

    const { request_id } = await createResponse.json();
    if (!request_id) {
      throw new Error('ID de requisição não retornado');
    }

    // Aguardar geração do PDF
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id,
          deployment_token: process.env.ABACUSAI_API_KEY
        })
      });

      const statusResult = await statusResponse.json();
      const status = statusResult?.status || 'FAILED';
      const result = statusResult?.result || null;

      if (status === 'SUCCESS') {
        if (result && result.result) {
          const pdfBuffer = Buffer.from(result.result, 'base64');
          return new NextResponse(pdfBuffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="relatorio_${dateStr}.pdf"`
            }
          });
        }
        throw new Error('PDF gerado mas sem dados');
      } else if (status === 'FAILED') {
        throw new Error(result?.error || 'Falha na geração do PDF');
      }

      attempts++;
    }

    throw new Error('Timeout na geração do PDF');

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar PDF. Tente exportar em CSV ou Excel.' },
      { status: 500 }
    );
  }
}
