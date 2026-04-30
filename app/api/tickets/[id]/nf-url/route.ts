export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';
import { getSession } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      select: { notaFiscalPath: true },
    });

    if (!ticket?.notaFiscalPath) {
      return NextResponse.json({ error: 'Nota fiscal não encontrada' }, { status: 404 });
    }

    const storage = getStorageProvider();
    const url = await storage.getUrl(ticket.notaFiscalPath);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Erro ao obter URL da NF:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
