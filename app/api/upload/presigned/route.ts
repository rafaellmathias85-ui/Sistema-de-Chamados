import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff', 'image/x-icon',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/xml', 'text/html',
  'application/xml', 'application/json',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/gzip',
  'application/octet-stream',
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'message/rfc822', 'application/vnd.ms-outlook',
];

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { fileName, contentType, isPublic = false } = body;

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName e contentType são obrigatórios' }, { status: 400 });
    }

    const maxSize = 100 * 1024 * 1024;

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 });
    }

    const isLocal = (process.env.STORAGE_PROVIDER || 's3').toLowerCase() === 'local';

    if (isLocal) {
      // Para storage local, retorna URL do endpoint de upload direto
      // O frontend deve usar FormData com POST para este endpoint
      const baseUrl = process.env.NEXTAUTH_URL || '';
      return NextResponse.json({
        uploadUrl: `${baseUrl}/api/upload/direct`,
        cloudStoragePath: '__pending__', // será definido pelo endpoint direct
        maxSize,
        mode: 'direct', // sinaliza para o frontend usar FormData POST
      });
    }

    // S3 mode - usar presigned URL
    const { generatePresignedUploadUrl } = await import('@/lib/s3');
    const { uploadUrl, cloudStoragePath } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      isPublic
    );

    return NextResponse.json({ uploadUrl, cloudStoragePath, maxSize, mode: 'presigned' });
  } catch (error) {
    console.error('Erro ao gerar URL de upload:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
