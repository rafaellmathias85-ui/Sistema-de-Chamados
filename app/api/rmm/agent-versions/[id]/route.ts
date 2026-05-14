export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// PATCH /api/rmm/agent-versions/[id] — Atualizar versão (ativar/desativar, editar changelog)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const data: any = {};
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.isCritical !== undefined) data.isCritical = body.isCritical;
    if (body.changelog !== undefined) data.changelog = body.changelog;
    if (body.downloadUrl !== undefined) data.downloadUrl = body.downloadUrl;

    const updated = await prisma.agentVersion.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({
      ...updated,
      fileSizeBytes: updated.fileSizeBytes.toString(),
    });
  } catch (error) {
    console.error('Error updating agent version:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/rmm/agent-versions/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    await prisma.agentVersion.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting agent version:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
