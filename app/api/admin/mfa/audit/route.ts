import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - MFA audit logs
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 50;

    const [logs, total] = await Promise.all([
      prisma.mfaAuditLog.findMany({
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.mfaAuditLog.count(),
    ]);

    return NextResponse.json({ logs, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('MFA audit error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
