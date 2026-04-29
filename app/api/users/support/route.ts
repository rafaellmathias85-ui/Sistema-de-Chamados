import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';


export const dynamic = 'force-dynamic';

// GET - Listar usuários de suporte (para atribuição de chamados)
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supportUsers = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPPORT'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(supportUsers);
  } catch (error) {
    console.error('Erro ao listar suporte:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
