import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getStorageProvider, isLocalPath } from '@/lib/storage';
import { getFileUrl } from '@/lib/s3';
import mime from 'mime-types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attachments/[id]
 * Retorna o arquivo como stream (local) ou redirect para presigned URL (S3).
 * Valida sessão + permissão por ticket.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar attachment com ticket para validação de acesso
    const attachment = await prisma.ticketAttachment.findUnique({
      where: { id: params.id },
      include: {
        ticket: {
          select: { companyId: true },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });
    }

    // Controle de acesso: clientes só veem anexos dos seus tickets
    if (session.user.role === 'CLIENT' && session.user.companyId !== attachment.ticket.companyId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const { cloudStoragePath, fileName, fileType } = attachment;

    // --- Provider Local ---
    if (isLocalPath(cloudStoragePath)) {
      const storage = getStorageProvider();
      const stream = await storage.getStream(cloudStoragePath);
      const mimeType = fileType || mime.lookup(fileName) || 'application/octet-stream';

      // Converter Node Readable para Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
          stream.on('end', () => controller.close());
          stream.on('error', (err: Error) => controller.error(err));
        },
      });

      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // --- Provider S3 ---
    const signedUrl = await getFileUrl(cloudStoragePath, attachment.isPublic);
    return NextResponse.redirect(signedUrl, 302);

  } catch (error) {
    console.error('[Attachments] Erro ao servir anexo:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
