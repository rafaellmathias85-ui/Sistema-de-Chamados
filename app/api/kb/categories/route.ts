import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Listar categorias da base de conhecimento
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const includeCount = searchParams.get('includeCount') !== 'false';

    const where = activeOnly ? { isActive: true } : {};

    const categories = await prisma.kBCategory.findMany({
      where,
      include: includeCount ? {
        _count: {
          select: { articles: { where: { isPublished: true } } }
        }
      } : undefined,
      orderBy: { order: 'asc' },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Erro ao listar categorias KB:', error);
    return NextResponse.json(
      { error: 'Erro ao listar categorias' },
      { status: 500 }
    );
  }
}

// POST - Criar categoria (apenas ADMIN)
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { name, description, icon, order } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    // Verificar se já existe
    const existing = await prisma.kBCategory.findUnique({
      where: { name: name.trim() }
    });

    if (existing) {
      return NextResponse.json({ error: 'Categoria já existe' }, { status: 400 });
    }

    const category = await prisma.kBCategory.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon || 'FileText',
        order: order || 0,
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error('Erro ao criar categoria KB:', error);
    return NextResponse.json(
      { error: 'Erro ao criar categoria' },
      { status: 500 }
    );
  }
}
