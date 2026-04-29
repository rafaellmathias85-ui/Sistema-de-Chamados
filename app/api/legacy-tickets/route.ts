export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/legacy-tickets - Listagem de arquivo historico de chamados
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const company = searchParams.get('company') || '';
    const requester = searchParams.get('requester') || '';
    const sourceSystem = searchParams.get('sourceSystem') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (search) {
      where.OR = [
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { requester: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { assignee: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (company) where.company = { contains: company, mode: 'insensitive' };
    if (requester) where.requester = { contains: requester, mode: 'insensitive' };
    if (sourceSystem) where.sourceSystem = sourceSystem;

    const [tickets, total] = await Promise.all([
      prisma.legacyTicket.findMany({
        where,
        orderBy: { ticketDate: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.legacyTicket.count({ where }),
    ]);

    return NextResponse.json({
      tickets,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error('GET /api/legacy-tickets error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar chamados arquivados' },
      { status: 500 }
    );
  }
}

// DELETE /api/legacy-tickets?ids=comma,sep - exclusao multipla (ADMIN apenas)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas admin pode excluir' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids') || '';
    const deleteAll = searchParams.get('all') === 'true';

    if (deleteAll) {
      const result = await prisma.legacyTicket.deleteMany({});
      return NextResponse.json({ deleted: result.count });
    }

    const ids = idsParam.split(',').filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nenhum ID informado' }, { status: 400 });
    }

    const result = await prisma.legacyTicket.deleteMany({
      where: { id: { in: ids } },
    });
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error('DELETE /api/legacy-tickets error:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir chamados arquivados' },
      { status: 500 }
    );
  }
}
