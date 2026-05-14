export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/webfilter/categories — Listar categorias + domínios
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const categories = await prisma.webFilterCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        domains: { orderBy: { domain: 'asc' } },
        _count: { select: { domains: true, logs: true } },
      },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error listing web filter categories:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/webfilter/categories — Criar categoria customizada
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { name, slug, description, icon, domains } = await request.json();
    if (!name || !slug) return NextResponse.json({ error: 'name e slug obrigatórios' }, { status: 400 });

    const category = await prisma.webFilterCategory.create({
      data: {
        name,
        slug,
        description: description || null,
        icon: icon || null,
        isSystem: false,
        tenantId: session.user.tenantId || null,
        domains: domains?.length ? {
          create: domains.map((d: string) => ({ domain: d, source: 'manual' })),
        } : undefined,
      },
      include: { domains: true },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Slug já existe' }, { status: 409 });
    }
    console.error('Error creating web filter category:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
