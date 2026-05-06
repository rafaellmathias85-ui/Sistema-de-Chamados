export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generatePresignedUploadUrl } from '@/lib/s3';
import crypto from 'crypto';

// GET /api/rmm/installers?companyId=xxx&active=true
// Lista pacotes de instalacao por empresa.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (!includeArchived) where.active = true;

    const installers = await prisma.rmmInstaller.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(installers);
  } catch (error) {
    console.error('GET /api/rmm/installers error:', error);
    return NextResponse.json({ error: 'Erro ao listar instaladores' }, { status: 500 });
  }
}

// POST /api/rmm/installers
// 2 modos:
//  a) action=presign  -> retorna URL de upload presigned para o cliente enviar o arquivo direto para o S3
//  b) action=register -> apos upload concluido, registra o RmmInstaller no banco com a chave S3
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const body = await request.json();
    const { action, companyId, fileName, contentType, version, packageType, changelog, cloudStoragePath, fileSize, sha256 } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'companyId obrigatório' }, { status: 400 });
    }
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    if (action === 'presign') {
      if (!fileName || !contentType) {
        return NextResponse.json({ error: 'fileName e contentType obrigatórios' }, { status: 400 });
      }
      const presigned = await generatePresignedUploadUrl(
        `installers/${company.id}/${fileName}`,
        contentType,
        false
      );
      return NextResponse.json(presigned);
    }

    if (action === 'register') {
      if (!cloudStoragePath || !fileName || !version || typeof fileSize !== 'number') {
        return NextResponse.json({ error: 'Dados obrigatórios faltando' }, { status: 400 });
      }
      const downloadToken = crypto.randomBytes(24).toString('hex');
      const installer = await prisma.rmmInstaller.create({
        data: {
          companyId,
          fileName,
          version,
          packageType: packageType || 'msi',
          changelog: changelog || null,
          cloudStoragePath,
          fileSize,
          sha256: sha256 || null,
          downloadToken,
          uploadedById: session.user.id,
          uploadedByName: session.user.name || 'Admin',
          tenantId: (session.user as any).tenantId || null,
        },
      });
      return NextResponse.json(installer);
    }

    return NextResponse.json({ error: 'action inválida (presign|register)' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/rmm/installers error:', error);
    return NextResponse.json({ error: 'Erro ao registrar instalador' }, { status: 500 });
  }
}
