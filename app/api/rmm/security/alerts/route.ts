export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET - List alerts
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved');
    const type = searchParams.get('type');

    const where: any = {};
    if (resolved !== null && resolved !== '') where.resolved = resolved === 'true';
    if (type) where.type = type;

    const alerts = await prisma.securityAlert.findMany({
      where,
      include: { machine: { select: { hostname: true, ipAddress: true, company: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Security alerts error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Excluir alerta de segurança
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    await prisma.securityAlert.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete security alert error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH - Resolve alert
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const alert = await prisma.securityAlert.update({
      where: { id },
      data: { resolved: true, resolvedAt: new Date(), resolvedBy: session.user.name || session.user.email },
    });

    return NextResponse.json(alert);
  } catch (error) {
    console.error('Resolve alert error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
