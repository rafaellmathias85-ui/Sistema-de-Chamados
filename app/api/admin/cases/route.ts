import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const cases = await prisma.caseStudy.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'desc' }] });
  return NextResponse.json(cases);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { slug, theme, title, summary, content, imageUrl, metrics, isPublished, order } = body;
  if (!slug || !theme || !title || !summary) {
    return NextResponse.json({ error: 'Campos obrigatórios: slug, theme, title, summary' }, { status: 400 });
  }
  try {
    const cs = await prisma.caseStudy.create({
      data: {
        slug,
        theme,
        title,
        summary,
        content: content || null,
        imageUrl: imageUrl || null,
        metrics: metrics || [],
        isPublished: isPublished ?? true,
        order: order ?? 0,
      },
    });
    return NextResponse.json(cs);
  } catch (e: any) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Slug já existe' }, { status: 409 });
    return NextResponse.json({ error: 'Erro ao criar' }, { status: 500 });
  }
}
