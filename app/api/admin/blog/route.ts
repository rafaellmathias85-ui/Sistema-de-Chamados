import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const posts = await prisma.blogPost.findMany({ orderBy: { publishedAt: 'desc' } });
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { slug, title, excerpt, content, imageUrl, link, category, author, isPublished } = body;
  if (!slug || !title || !excerpt || !content) {
    return NextResponse.json({ error: 'Campos obrigatórios: slug, title, excerpt, content' }, { status: 400 });
  }
  try {
    const post = await prisma.blogPost.create({
      data: {
        slug,
        title,
        excerpt,
        content,
        imageUrl: imageUrl || null,
        link: link || null,
        category: category || 'Tecnologia',
        author: author || 'Equipe Winner',
        isPublished: isPublished ?? true,
      },
    });
    return NextResponse.json(post);
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'Slug já existe' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro ao criar post' }, { status: 500 });
  }
}
