import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST - Registrar feedback (útil/não útil)
export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { helpful } = await request.json();

    const article = await prisma.kBArticle.findUnique({
      where: { slug: params.slug }
    });

    if (!article) {
      return NextResponse.json({ error: 'Artigo não encontrado' }, { status: 404 });
    }

    await prisma.kBArticle.update({
      where: { id: article.id },
      data: helpful 
        ? { helpfulYes: { increment: 1 } }
        : { helpfulNo: { increment: 1 } }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao registrar feedback:', error);
    return NextResponse.json(
      { error: 'Erro ao registrar feedback' },
      { status: 500 }
    );
  }
}
