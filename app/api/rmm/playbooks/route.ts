export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET - List playbooks
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const playbooks = await prisma.rmmPlaybook.findMany({
      include: { _count: { select: { executions: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(playbooks);
  } catch (error) {
    console.error('Playbooks error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Create playbook
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { name, description, trigger, condition, action, scriptType, enabled } = await request.json();
    if (!name || !trigger || !action) {
      return NextResponse.json({ error: 'Nome, trigger e ação são obrigatórios' }, { status: 400 });
    }

    const playbook = await prisma.rmmPlaybook.create({
      data: {
        name,
        description: description || null,
        trigger,
        condition: condition || null,
        action,
        scriptType: scriptType || 'powershell',
        enabled: enabled !== false,
      },
    });

    return NextResponse.json(playbook, { status: 201 });
  } catch (error) {
    console.error('Create playbook error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH - Update playbook
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { id, ...data } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const playbook = await prisma.rmmPlaybook.update({ where: { id }, data });
    return NextResponse.json(playbook);
  } catch (error) {
    console.error('Update playbook error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Delete playbook
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    await prisma.rmmPlaybook.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete playbook error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
