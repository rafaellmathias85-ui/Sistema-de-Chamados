export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/legacy-tickets/imports
// Lista todos os lotes de importacao ordenados por data decrescente
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

    const batches = await prisma.legacyImportBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    });

    // Mapeia para formato com contagem de tickets ainda ativos
    const result = batches.map((b: any) => ({
      id: b.id,
      fileName: b.fileName,
      sourceSystem: b.sourceSystem,
      totalRows: b.totalRows,
      created: b.created,
      updated: b.updated,
      skipped: b.skipped,
      importedBy: b.importedBy,
      importedByName: b.importedByName,
      createdAt: b.createdAt,
      undoneAt: b.undoneAt,
      undoneBy: b.undoneBy,
      activeTicketsCount: b._count.tickets,
    }));

    return NextResponse.json({ batches: result });
  } catch (error: any) {
    console.error('Error listing import batches:', error);
    return NextResponse.json({ error: 'Erro ao listar lotes' }, { status: 500 });
  }
}
