export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';
import { getSession } from '@/lib/session';

// GET — gerar URL para visualizar a NF
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'FINANCE', 'SUPPORT'].includes(session.user.role)) {
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
    const url = await storage.getUrl(ticket.notaFiscalPath, false);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Erro ao obter URL da NF:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE — remover NF e limpar campo no banco
export async function DELETE(
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

    // Delete from storage
    try {
      const storage = getStorageProvider();
      await storage.delete(ticket.notaFiscalPath);
    } catch (storageErr) {
      console.error('Erro ao deletar arquivo do storage (continuando):', storageErr);
    }

    // Clear from DB
    await prisma.ticket.update({
      where: { id: params.id },
      data: { notaFiscalPath: null },
    });

    // Add history
    await prisma.ticketHistory.create({
      data: {
        ticketId: params.id,
        action: 'nf_removed',
        fromValue: ticket.notaFiscalPath,
        toValue: null,
        userId: session.user.id,
        userName: session.user.name || 'Usuário',
        userRole: session.user.role as any,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover NF:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
