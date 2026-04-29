import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// PATCH - Atualizar categoria
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem editar categorias' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, color, isActive, parentId } = body;

    // Obter categoria atual
    const current = await prisma.category.findUnique({ where: { id: params.id } });
    if (!current) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    // Verificar se nome já existe no mesmo nível hierárquico
    const targetParentId = parentId !== undefined ? parentId : current.parentId;
    if (name) {
      const existing = await prisma.category.findFirst({
        where: { 
          name, 
          parentId: targetParentId,
          NOT: { id: params.id } 
        },
      });
      if (existing) {
        return NextResponse.json({ error: 'Nome já existe neste nível' }, { status: 400 });
      }
    }

    // Se parentId está sendo alterado, verificar se não está criando ciclo
    if (parentId !== undefined && parentId !== current.parentId) {
      if (parentId === params.id) {
        return NextResponse.json({ error: 'Categoria não pode ser pai de si mesma' }, { status: 400 });
      }
      // Verificar se o novo pai não é filho desta categoria
      if (parentId) {
        const isChild = await isDescendant(parentId, params.id);
        if (isChild) {
          return NextResponse.json({ error: 'Não é possível mover para uma subcategoria' }, { status: 400 });
        }
      }
    }

    const category = await prisma.category.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(color && { color }),
        ...(isActive !== undefined && { isActive }),
        ...(parentId !== undefined && { parentId: parentId || null }),
      },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { tickets: true, children: true } },
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// Função auxiliar para verificar se é descendente
async function isDescendant(categoryId: string, potentialAncestorId: string): Promise<boolean> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { parentId: true },
  });
  
  if (!category || !category.parentId) return false;
  if (category.parentId === potentialAncestorId) return true;
  return isDescendant(category.parentId, potentialAncestorId);
}

// DELETE - Excluir categoria
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir categorias' }, { status: 403 });
    }

    // Verificar se há tickets usando esta categoria
    const ticketCount = await prisma.ticket.count({ where: { categoryId: params.id } });
    if (ticketCount > 0) {
      return NextResponse.json(
        { error: `Não é possível excluir. Existem ${ticketCount} chamados usando esta categoria.` },
        { status: 400 }
      );
    }

    // Verificar se há subcategorias
    const childCount = await prisma.category.count({ where: { parentId: params.id } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Não é possível excluir. Existem ${childCount} subcategorias vinculadas.` },
        { status: 400 }
      );
    }

    await prisma.category.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
