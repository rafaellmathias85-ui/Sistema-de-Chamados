import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Listar tickets encaminhados para o financeiro
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!['ADMIN', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const dateField = searchParams.get('dateField') || 'createdAt'; // 'createdAt' | 'dataFaturamento'
    const hasValue = searchParams.get('hasValue');
    const faturadoFilter = searchParams.get('faturado');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = {
      forwardedToFinance: true,
    };

    if (companyId) {
      where.companyId = companyId;
    }

    if (dateFrom || dateTo) {
      const field = dateField === 'dataFaturamento' ? 'dataFaturamento' : 'createdAt';
      where[field] = {};
      if (dateFrom) {
        where[field].gte = new Date(dateFrom);
      }
      if (dateTo) {
        where[field].lte = new Date(dateTo + 'T23:59:59.999Z');
      }
      // Se filtrar por dataFaturamento, forçar que tenha data de faturamento
      if (field === 'dataFaturamento' && !dateFrom && !dateTo) {
        where[field] = { not: null };
      }
    }

    if (hasValue === 'true') {
      where.financialValue = { not: null };
    } else if (hasValue === 'false') {
      where.financialValue = null;
    }

    if (faturadoFilter === 'true') {
      where.faturado = true;
    } else if (faturadoFilter === 'false') {
      where.faturado = false;
    }

    // Search by ticket number or subject
    if (search) {
      const num = parseInt(search);
      if (!isNaN(num)) {
        where.OR = [
          { number: num },
          { subject: { contains: search, mode: 'insensitive' } },
        ];
      } else {
        where.subject = { contains: search, mode: 'insensitive' };
      }
    }

    const [tickets, total, stats] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          creator: { select: { name: true, email: true } },
          company: { select: { name: true, clientType: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ticket.count({ where }),
      prisma.ticket.aggregate({
        where,
        _sum: { financialValue: true },
        _count: { id: true },
      }),
    ]);

    const pendingCount = await prisma.ticket.count({
      where: { ...where, financialValue: null },
    });

    const faturadoCount = await prisma.ticket.count({
      where: { ...where, faturado: true },
    });

    const faturadoValue = await prisma.ticket.aggregate({
      where: { ...where, faturado: true },
      _sum: { financialValue: true },
    });

    return NextResponse.json({
      tickets,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalValue: stats._sum.financialValue || 0,
        totalTickets: stats._count.id,
        pendingValue: pendingCount,
        faturadoCount,
        faturadoValue: faturadoValue._sum.financialValue || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching finance tickets:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar chamados financeiros' },
      { status: 500 }
    );
  }
}
