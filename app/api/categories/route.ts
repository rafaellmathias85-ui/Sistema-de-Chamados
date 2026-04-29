import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Listar categorias
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const parentOnly = searchParams.get('parentOnly') === 'true';
    const flat = searchParams.get('flat') === 'true';

    const where: any = {};
    if (activeOnly) where.isActive = true;
    if (parentOnly) where.parentId = null;

    const categories = await prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tickets: true, children: true } },
        parent: { select: { id: true, name: true, color: true } },
        children: flat ? false : {
          where: activeOnly ? { isActive: true } : {},
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { tickets: true } },
          },
        },
      },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Criar categoria
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem criar categorias' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, color, parentId } = body;

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    // Verificar se já existe na mesma hierarquia
    const existing = await prisma.category.findFirst({
      where: { 
        name,
        parentId: parentId || null,
      },
    });
    if (existing) {
      return NextResponse.json({ error: 'Categoria já existe neste nível' }, { status: 400 });
    }

    // Se tem parentId, verificar se a categoria pai existe
    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ error: 'Categoria pai não encontrada' }, { status: 400 });
      }
    }

    const category = await prisma.category.create({
      data: { 
        name, 
        description, 
        color: color || '#3B82F6',
        parentId: parentId || null,
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { tickets: true, children: true } },
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
