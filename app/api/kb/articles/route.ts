import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// GET - Listar artigos
// Clientes só veem artigos que eles próprios criaram (visibility='PRIVATE')
// Admin/Suporte veem todos artigos compartilhados (visibility='SHARED') e seus próprios
export async function GET(request: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');
    const featured = searchParams.get('featured') === 'true';
    const published = searchParams.get('published') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');
    const visibility = searchParams.get('visibility'); // 'private', 'shared', ou null para todos

    const where: any = {};
    
    if (published) {
      where.isPublished = true;
    }
    
    if (categoryId) {
      where.categoryId = categoryId;
    }
    
    if (featured) {
      where.isFeatured = true;
    }
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } },
      ];
    }

    // Filtro de visibilidade baseado no role do usuário
    if (session?.user) {
      if (session.user.role === 'CLIENT') {
        // Cliente só vê seus próprios artigos (private)
        where.authorId = session.user.id;
      } else if (['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
        // Admin/Suporte veem artigos compartilhados OU seus próprios
        if (visibility === 'private') {
          where.authorId = session.user.id;
        } else if (visibility === 'shared') {
          where.visibility = 'SHARED';
        } else {
          // Sem filtro de visibilidade: mostrar compartilhados + próprios
          where.OR = [
            { visibility: 'SHARED' },
            { authorId: session.user.id },
          ];
        }
      }
    } else {
      // Usuário não logado: só artigos publicados e compartilhados
      where.visibility = 'SHARED';
    }

    const [articles, total] = await Promise.all([
      prisma.kBArticle.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true, icon: true }
          }
        },
        orderBy: [
          { isFeatured: 'desc' },
          { viewCount: 'desc' },
          { publishedAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.kBArticle.count({ where }),
    ]);

    return NextResponse.json({
      articles,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Erro ao listar artigos KB:', error);
    return NextResponse.json(
      { error: 'Erro ao listar artigos' },
      { status: 500 }
    );
  }
}

// POST - Criar artigo (ADMIN/SUPPORT/FINANCE)
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || !['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { title, content, excerpt, categoryId, tags, isPublished, isFeatured, visibility } = await request.json();

    if (!title?.trim() || !content?.trim() || !categoryId) {
      return NextResponse.json(
        { error: 'Título, conteúdo e categoria são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar se categoria existe
    const category = await prisma.kBCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    // Gerar slug único
    let slug = generateSlug(title);
    let slugExists = await prisma.kBArticle.findUnique({ where: { slug } });
    let counter = 1;
    while (slugExists) {
      slug = `${generateSlug(title)}-${counter}`;
      slugExists = await prisma.kBArticle.findUnique({ where: { slug } });
      counter++;
    }

    const article = await prisma.kBArticle.create({
      data: {
        title: title.trim(),
        slug,
        content: content.trim(),
        excerpt: excerpt?.trim() || content.substring(0, 200),
        categoryId,
        authorId: session.user.id,
        authorName: session.user.name || 'Admin',
        tags: tags || [],
        isPublished: isPublished || false,
        isFeatured: isFeatured || false,
        publishedAt: isPublished ? new Date() : null,
        visibility: visibility === 'SHARED' ? 'SHARED' : 'PRIVATE',
      },
      include: {
        category: { select: { id: true, name: true, icon: true } }
      }
    });

    return NextResponse.json(article);
  } catch (error) {
    console.error('Erro ao criar artigo KB:', error);
    return NextResponse.json(
      { error: 'Erro ao criar artigo' },
      { status: 500 }
    );
  }
}
