import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Obter artigo por slug
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const article = await prisma.kBArticle.findUnique({
      where: { slug: params.slug },
      include: {
        category: { select: { id: true, name: true, icon: true } }
      }
    });

    if (!article) {
      return NextResponse.json({ error: 'Artigo não encontrado' }, { status: 404 });
    }

    // Incrementar visualizações
    await prisma.kBArticle.update({
      where: { id: article.id },
      data: { viewCount: { increment: 1 } }
    });

    return NextResponse.json(article);
  } catch (error) {
    console.error('Erro ao buscar artigo KB:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar artigo' },
      { status: 500 }
    );
  }
}

// PATCH - Atualizar artigo (ADMIN/SUPPORT)
export async function PATCH(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const article = await prisma.kBArticle.findUnique({
      where: { slug: params.slug }
    });

    if (!article) {
      return NextResponse.json({ error: 'Artigo não encontrado' }, { status: 404 });
    }

    const data = await request.json();
    const updateData: any = {};

    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.content !== undefined) updateData.content = data.content.trim();
    if (data.excerpt !== undefined) updateData.excerpt = data.excerpt?.trim();
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
    
    if (data.isPublished !== undefined) {
      updateData.isPublished = data.isPublished;
      if (data.isPublished && !article.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }

    const updated = await prisma.kBArticle.update({
      where: { id: article.id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true, icon: true } }
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar artigo KB:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar artigo' },
      { status: 500 }
    );
  }
}

// DELETE - Excluir artigo (ADMIN)
export async function DELETE(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const article = await prisma.kBArticle.findUnique({
      where: { slug: params.slug }
    });

    if (!article) {
      return NextResponse.json({ error: 'Artigo não encontrado' }, { status: 404 });
    }

    await prisma.kBArticle.delete({ where: { id: article.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir artigo KB:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir artigo' },
      { status: 500 }
    );
  }
}
