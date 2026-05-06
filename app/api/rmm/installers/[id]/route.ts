export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { deleteFile } from '@/lib/s3';

// GET /api/rmm/installers/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const installer = await prisma.rmmInstaller.findUnique({
    where: { id: params.id },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!installer) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json(installer);
}

// PATCH /api/rmm/installers/[id] -> arquivar / desarquivar / atualizar metadados
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const body = await req.json();
  const data: any = {};
  if (typeof body.active === 'boolean') data.active = body.active;
  if (typeof body.changelog === 'string') data.changelog = body.changelog;
  if (typeof body.version === 'string') data.version = body.version;
  const updated = await prisma.rmmInstaller.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/rmm/installers/[id] -> remove do S3 e do banco (irreversivel)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const installer = await prisma.rmmInstaller.findUnique({ where: { id: params.id } });
  if (!installer) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try {
    await deleteFile(installer.cloudStoragePath);
  } catch (e) {
    console.warn('Falha ao remover arquivo S3 (continuando):', e);
  }
  await prisma.rmmInstaller.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
