import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const format = searchParams.get('format') || 'csv';
    const fieldsParam = searchParams.get('fields');

    const allFields = ['hostname', 'username', 'os', 'ram', 'cpuModel', 'ipAddress', 'publicIp', 'diskSize', 'gpuInfo', 'status', 'lastCheckin', 'company'];
    const fields = fieldsParam ? fieldsParam.split(',').filter(f => allFields.includes(f)) : allFields;

    const where: any = {};
    if (companyId) where.companyId = companyId;

    const machines = await prisma.rmmMachine.findMany({
      where,
      include: { company: { select: { name: true } } },
      orderBy: { hostname: 'asc' },
    });

    const fieldLabels: Record<string, string> = {
      hostname: 'Hostname',
      username: 'Usuário',
      os: 'Sistema Operacional',
      ram: 'RAM',
      cpuModel: 'Processador',
      ipAddress: 'IP Local',
      publicIp: 'IP Público',
      diskSize: 'Disco',
      gpuInfo: 'GPU',
      status: 'Status',
      lastCheckin: 'Último Checkin',
      company: 'Empresa',
    };

    if (format === 'csv') {
      const header = fields.map(f => fieldLabels[f] || f).join(',');
      const rows = machines.map(m => {
        return fields.map(f => {
          let val = '';
          if (f === 'company') val = m.company?.name || '';
          else if (f === 'lastCheckin') val = m.lastCheckin ? new Date(m.lastCheckin).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
          else val = String((m as any)[f] || '');
          return `"${val.replace(/"/g, '""')}"`;
        }).join(',');
      });

      const csv = [header, ...rows].join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="rmm_machines_${new Date().toISOString().slice(0,10)}.csv"`,
        },
      });
    }

    // JSON format for XLS/PDF generation on frontend
    const data = machines.map(m => {
      const row: Record<string, string> = {};
      fields.forEach(f => {
        if (f === 'company') row[fieldLabels[f]] = m.company?.name || '';
        else if (f === 'lastCheckin') row[fieldLabels[f]] = m.lastCheckin ? new Date(m.lastCheckin).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
        else row[fieldLabels[f]] = String((m as any)[f] || '');
      });
      return row;
    });

    return NextResponse.json({ data, fields: fields.map(f => fieldLabels[f] || f) });
  } catch (error) {
    console.error('Erro ao exportar:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
