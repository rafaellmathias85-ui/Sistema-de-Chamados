import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// PATCH - Atualizar categoria (ADMIN)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const category = await prisma.kBCategory.findUnique({
      where: { id: params.id }
    });

    if (!category) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    const data = await request.json();
    const updateData: any = {};

    if (data.name !== undefined) {
      const existing = await prisma.kBCategory.findFirst({
        where: { name: data.name.trim(), id: { not: params.id } }
      });
      if (existing) {
        return NextResponse.json({ error: 'Categoria já existe' }, { status: 400 });
      }
      updateData.name = data.name.trim();
    }
    if (data.description !== undefined) updateData.description = data.description?.trim();
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.order !== undefined) updateData.order = data.order;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.kBCategory.update({
      where: { id: params.id },
      data: updateData
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar categoria KB:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar categoria' },
      { status: 500 }
    );
  }
}

// DELETE - Excluir categoria (ADMIN)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const category = await prisma.kBCategory.findUnique({
      where: { id: params.id },
      include: { _count: { select: { articles: true } } }
    });

    if (!category) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    if (category._count.articles > 0) {
      return NextResponse.json(
        { error: 'Não é possível excluir categoria com artigos' },
        { status: 400 }
      );
    }

    await prisma.kBCategory.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir categoria KB:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir categoria' },
      { status: 500 }
    );
  }
}
