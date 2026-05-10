import { NextRequest, NextResponse } from 'next/server';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Rota pública para servir imagens uploadadas (ex: capas de blog/cases).
 * Aceita ?path=local:... ou path absoluto S3.
 * Apenas content-type de imagem. Cache forte.
 */
export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'path obrigatório' }, { status: 400 });

    const storage = getStorageProvider();
    const stream = await storage.getStream(path);

    // Detectar extensão
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const ctMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    };
    const contentType = ctMap[ext] || 'application/octet-stream';

    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Apenas imagens' }, { status: 400 });
    }

    // @ts-ignore - stream Node.js Readable, Next aceita
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('Erro ao servir imagem:', error?.message);
    return NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 });
  }
}
