import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function check() {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') return null;
  return session;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await check())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const post = await prisma.blogPost.findUnique({ where: { id: params.id } });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await check())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { slug, title, excerpt, content, imageUrl, link, category, author, isPublished } = body;
  try {
    const post = await prisma.blogPost.update({
      where: { id: params.id },
      data: {
        ...(slug !== undefined && { slug }),
        ...(title !== undefined && { title }),
        ...(excerpt !== undefined && { excerpt }),
        ...(content !== undefined && { content }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(link !== undefined && { link: link || null }),
        ...(category !== undefined && { category }),
        ...(author !== undefined && { author }),
        ...(isPublished !== undefined && { isPublished }),
      },
    });
    return NextResponse.json(post);
  } catch (e: any) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Slug já existe' }, { status: 409 });
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await check())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await prisma.blogPost.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erro ao deletar' }, { status: 500 });
  }
}
