import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - List scripts
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const scripts = await prisma.rmmScript.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(scripts);
  } catch (error) {
    console.error('Error listing scripts:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// POST - Create script
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { name, description, scriptType, content, companyId } = await request.json();

    if (!name || !scriptType || !content) {
      return NextResponse.json({ error: 'Nome, tipo e conteúdo são obrigatórios' }, { status: 400 });
    }

    if (!['bat', 'vbs', 'ps1'].includes(scriptType)) {
      return NextResponse.json({ error: 'Tipo de script inválido (bat, vbs, ps1)' }, { status: 400 });
    }

    const script = await prisma.rmmScript.create({
      data: {
        name,
        description: description || null,
        scriptType,
        content,
        companyId: companyId || null,
        createdBy: session.user.id,
        createdByName: session.user.name || 'Usuário',
        // Auto-approve if admin
        approved: session.user.role === 'ADMIN',
        approvedBy: session.user.role === 'ADMIN' ? session.user.name : null,
        approvedAt: session.user.role === 'ADMIN' ? new Date() : null,
      },
    });

    return NextResponse.json(script, { status: 201 });
  } catch (error) {
    console.error('Error creating script:', error);
    return NextResponse.json({ error: 'Erro ao criar script' }, { status: 500 });
  }
}
