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
  const cs = await prisma.caseStudy.findUnique({ where: { id: params.id } });
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(cs);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await check())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { slug, theme, title, summary, content, imageUrl, metrics, isPublished, order } = body;
  try {
    const cs = await prisma.caseStudy.update({
      where: { id: params.id },
      data: {
        ...(slug !== undefined && { slug }),
        ...(theme !== undefined && { theme }),
        ...(title !== undefined && { title }),
        ...(summary !== undefined && { summary }),
        ...(content !== undefined && { content: content || null }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(metrics !== undefined && { metrics: metrics || [] }),
        ...(isPublished !== undefined && { isPublished }),
        ...(order !== undefined && { order }),
      },
    });
    return NextResponse.json(cs);
  } catch (e: any) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Slug já existe' }, { status: 409 });
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await check())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await prisma.caseStudy.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erro ao deletar' }, { status: 500 });
  }
}
