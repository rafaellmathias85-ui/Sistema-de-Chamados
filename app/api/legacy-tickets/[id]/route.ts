export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const ticket = await prisma.legacyTicket.findUnique({
      where: { id: params.id },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Chamado arquivado nao encontrado' }, { status: 404 });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('GET /api/legacy-tickets/[id] error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar chamado arquivado' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas admin pode excluir' }, { status: 403 });
    }

    await prisma.legacyTicket.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/legacy-tickets/[id] error:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir chamado arquivado' },
      { status: 500 }
    );
  }
}
