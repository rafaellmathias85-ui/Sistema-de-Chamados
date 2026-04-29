export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getFileUrl, deleteFile } from '@/lib/s3';
import { getSession } from '@/lib/session';

// GET — gerar URL assinada para visualizar a NF
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

    // Generate signed URL for inline viewing (not forced download)
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { createS3Client, getBucketConfig } = await import('@/lib/aws-config');
    const { bucketName } = getBucketConfig();
    const s3 = createS3Client();
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: ticket.notaFiscalPath,
      ResponseContentDisposition: 'inline',
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Erro ao obter URL da NF:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE — remover NF do S3 e limpar campo no banco
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

    // Delete from S3
    try {
      await deleteFile(ticket.notaFiscalPath);
    } catch (s3Err) {
      console.error('Erro ao deletar arquivo do S3 (continuando):', s3Err);
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
