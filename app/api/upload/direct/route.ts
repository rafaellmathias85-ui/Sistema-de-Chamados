import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getStorageProvider } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Upload direto para storage local (VPS).
 * Recebe o arquivo via FormData, salva usando StorageProvider.
 * Retorna o cloudStoragePath.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const isPublicStr = formData.get('isPublic');
    const isPublic = isPublicStr === 'true';

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não encontrado no formulário' }, { status: 400 });
    }

    // Validar tamanho (100MB)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande. Máximo 100MB.' }, { status: 400 });
    }

    // Validar tipo de arquivo
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv', 'text/xml',
      'application/xml',
      'application/zip', 'application/x-rar-compressed',
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getStorageProvider();
    const { cloudStoragePath } = await storage.save(file.name, buffer, file.type, isPublic);

    return NextResponse.json({ cloudStoragePath, fileName: file.name, fileSize: file.size });
  } catch (error) {
    console.error('Erro no upload direto:', error);
    return NextResponse.json({ error: 'Erro ao fazer upload' }, { status: 500 });
  }
}
