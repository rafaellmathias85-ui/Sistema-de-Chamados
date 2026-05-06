export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFileUrl } from '@/lib/s3';

// GET /api/rmm/installers/[id]/download?token=xxx
// Endpoint publico (sem login) para download via token.
// Retorna 302 redirect para URL S3 assinada (1h validade).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 });
    }
    const installer = await prisma.rmmInstaller.findUnique({
      where: { id: params.id },
    });
    if (!installer || !installer.active || installer.downloadToken !== token) {
      return NextResponse.json({ error: 'Pacote não encontrado ou token inválido' }, { status: 404 });
    }
    const url = await getFileUrl(installer.cloudStoragePath, false);
    // metricas
    await prisma.rmmInstaller.update({
      where: { id: installer.id },
      data: {
        downloadCount: { increment: 1 },
        lastDownloadAt: new Date(),
      },
    }).catch(() => {});
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Download installer error:', error);
    return NextResponse.json({ error: 'Erro no download' }, { status: 500 });
  }
}
