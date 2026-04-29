import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Listar empresas com resumo financeiro
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (!['ADMIN', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        clientType: true,
        _count: {
          select: {
            tickets: {
              where: { forwardedToFinance: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Calcular totais por empresa
    const companiesWithTotals = await Promise.all(
      companies.map(async (company: any) => {
        const aggregate = await prisma.ticket.aggregate({
          where: {
            companyId: company.id,
            forwardedToFinance: true,
          },
          _sum: { financialValue: true },
        });

        return {
          ...company,
          ticketCount: company._count.tickets,
          totalValue: aggregate._sum.financialValue || 0,
        };
      })
    );

    return NextResponse.json(companiesWithTotals.filter(c => c.ticketCount > 0));
  } catch (error) {
    console.error('Error fetching finance companies:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar empresas' },
      { status: 500 }
    );
  }
}
