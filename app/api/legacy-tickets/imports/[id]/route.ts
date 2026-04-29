export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/legacy-tickets/imports/[id]
// Detalhes do lote
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const batch = await prisma.legacyImportBatch.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { tickets: true } },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Lote nao encontrado' }, { status: 404 });
    }

    return NextResponse.json({ batch });
  } catch (error: any) {
    console.error('Error fetching import batch:', error);
    return NextResponse.json({ error: 'Erro ao buscar lote' }, { status: 500 });
  }
}

// DELETE /api/legacy-tickets/imports/[id]
// Desfaz a importacao removendo os tickets que foram CRIADOS por este lote
// (tickets que eram atualizacoes de registros ja existentes NAO sao afetados)
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const batch = await prisma.legacyImportBatch.findUnique({
      where: { id: params.id },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Lote nao encontrado' }, { status: 404 });
    }

    if (batch.undoneAt) {
      return NextResponse.json({ error: 'Este lote ja foi desfeito anteriormente' }, { status: 400 });
    }

    // Contar antes de remover
    const toDeleteCount = await prisma.legacyTicket.count({
      where: { importBatchId: params.id },
    });

    // Remove os tickets ligados a este lote (apenas os criados por ele)
    const deleted = await prisma.legacyTicket.deleteMany({
      where: { importBatchId: params.id },
    });

    // Marca o lote como desfeito (mantem registro historico)
    await prisma.legacyImportBatch.update({
      where: { id: params.id },
      data: {
        undoneAt: new Date(),
        undoneBy: session.user.id,
      },
    });

    return NextResponse.json({
      ok: true,
      deletedCount: deleted.count,
      expectedCount: toDeleteCount,
    });
  } catch (error: any) {
    console.error('Error undoing import batch:', error);
    return NextResponse.json(
      { error: 'Erro ao desfazer importacao: ' + (error?.message || 'desconhecido') },
      { status: 500 }
    );
  }
}
