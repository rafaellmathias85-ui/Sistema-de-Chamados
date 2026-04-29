export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getFileUrl } from '@/lib/s3';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const isPublic = searchParams.get('public') === 'true';

    if (!path) {
      return NextResponse.json({ error: 'Path obrigat\u00f3rio' }, { status: 400 });
    }

    const url = await getFileUrl(path, isPublic);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error getting file URL:', error);
    return NextResponse.json({ error: 'Erro ao obter URL' }, { status: 500 });
  }
}
