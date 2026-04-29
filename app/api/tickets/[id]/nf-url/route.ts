export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFileUrl } from '@/lib/s3';
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

    // Generate a presigned URL for viewing (not downloading)
    const url = await getFileUrl(ticket.notaFiscalPath, false);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Erro ao obter URL da NF:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
