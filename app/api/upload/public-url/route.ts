import { NextRequest, NextResponse } from 'next/server';
import { getFileUrl } from '@/lib/s3';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { cloudStoragePath, isPublic } = await request.json();
    if (!cloudStoragePath) {
      return NextResponse.json({ error: 'cloudStoragePath obrigatório' }, { status: 400 });
    }

    const url = await getFileUrl(cloudStoragePath, isPublic !== false);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Erro ao gerar URL:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
