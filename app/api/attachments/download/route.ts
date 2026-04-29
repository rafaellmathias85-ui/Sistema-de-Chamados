import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getStorageProvider, isLocalPath } from '@/lib/storage';
import mime from 'mime-types';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attachments/download?path=local:2026/04/uuid.ext
 * Serve arquivos do local storage por path.
 * Usado principalmente para imagens inline de emails (CID→URL).
 * Requer sessão autenticada.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const filePath = request.nextUrl.searchParams.get('path');
    if (!filePath) {
      return NextResponse.json({ error: 'Parâmetro path obrigatório' }, { status: 400 });
    }

    // Somente aceitar paths locais
    if (!isLocalPath(filePath)) {
      return NextResponse.json({ error: 'Path inválido' }, { status: 400 });
    }

    const storage = getStorageProvider();
    const stream = await storage.getStream(filePath);

    // Detectar MIME type pela extensão
    const ext = path.extname(filePath);
    const mimeType = mime.lookup(ext) || 'application/octet-stream';

    // Converter Node Readable para Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err: Error) => controller.error(err));
      },
    });

    // Para imagens inline, usar inline disposition e cache longo
    const isImage = mimeType.startsWith('image/');
    const disposition = isImage ? 'inline' : `attachment; filename="file${ext}"`;

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': disposition,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    if (error?.message?.includes('não encontrado')) {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }
    console.error('[Attachments/Download] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
