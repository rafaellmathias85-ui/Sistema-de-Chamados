import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get('format'); // 'csv' for export
    const search = url.searchParams.get('search') || '';
    const statusFilter = url.searchParams.get('status') || '';

    // Build where clause based on role
    const where: any = {};

    // CLIENT sees only their company's machines
    if (session.user.role === 'CLIENT') {
      if (!session.user.companyId) {
        return NextResponse.json([]);
      }
      where.companyId = session.user.companyId;
    } else if (['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      // Staff can filter by company
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

    // CSV export
    if (format === 'csv') {
      const headers = ['Hostname', 'Usu\u00e1rio', 'SO', 'RAM', 'Disco', 'Tamanho Disco', 'Status', 'CPU %', 'RAM %', 'Disco %', 'Empresa'];
      const csvEscape = (v: string | null) => {
        if (!v) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const rows = machines.map((m: any) => [
        csvEscape(m.hostname),
        csvEscape(m.username),
        csvEscape(m.os),
        csvEscape(m.ram),
        csvEscape(m.diskModel),
        csvEscape(m.diskSize),
        csvEscape(m.status),
        m.cpuUsage != null ? m.cpuUsage.toFixed(1) : '',
        m.ramUsage != null ? m.ramUsage.toFixed(1) : '',
        m.diskUsage != null ? m.diskUsage.toFixed(1) : '',
        csvEscape(m.company?.name),
      ].join(','));

      const bom = '\uFEFF';
      const csv = bom + headers.join(',') + '\n' + rows.join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="inventario-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json(machines);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json({ error: 'Erro ao buscar invent\u00e1rio' }, { status: 500 });
  }
}
