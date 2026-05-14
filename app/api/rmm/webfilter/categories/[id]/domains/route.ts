export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST /api/rmm/webfilter/categories/[id]/domains — Adicionar domínios a uma categoria
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { domains } = await request.json();
    if (!Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json({ error: 'domains[] obrigatório' }, { status: 400 });
    }

    // Verificar categoria existe
    const category = await prisma.webFilterCategory.findUnique({ where: { id: params.id } });
    if (!category) return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });

    let inserted = 0;
    for (const domain of domains.slice(0, 200)) {
      try {
        await prisma.webFilterCategoryDomain.create({
          data: {
            categoryId: params.id,
            domain: typeof domain === 'string' ? domain : domain.domain,
            isRegex: typeof domain === 'object' ? domain.isRegex || false : false,
            source: 'manual',
          },
        });
        inserted++;
      } catch (e: any) {
        // Ignora duplicatas (unique constraint)
        if (e?.code !== 'P2002') throw e;
      }
    }

    return NextResponse.json({ ok: true, inserted });
  } catch (error) {
    console.error('Error adding domains to category:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/rmm/webfilter/categories/[id]/domains?domain=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    if (!domain) return NextResponse.json({ error: 'domain obrigatório' }, { status: 400 });

    await prisma.webFilterCategoryDomain.deleteMany({
      where: { categoryId: params.id, domain },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error removing domain from category:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
