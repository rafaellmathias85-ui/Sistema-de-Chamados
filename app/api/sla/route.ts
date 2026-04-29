import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';


export const dynamic = 'force-dynamic';

// GET - Listar configurações de SLA
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const slaConfigs = await prisma.sLAConfig.findMany({
      orderBy: {
        priority: 'asc',
      },
    });

    return NextResponse.json(slaConfigs);
  } catch (error) {
    console.error('Erro ao listar SLA:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Atualizar configurações de SLA
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem configurar SLA' }, { status: 403 });
    }

    const body = await request.json();
    const { priority, responseTimeHrs, resolutionHrs } = body;

    if (!priority || (responseTimeHrs === undefined && priority !== 'NONE') || (resolutionHrs === undefined && priority !== 'NONE')) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    // "Sem SLA" (NONE) = 0 hours means no deadline
    const finalResponseHrs = priority === 'NONE' ? 0 : (responseTimeHrs || 0);
    const finalResolutionHrs = priority === 'NONE' ? 0 : (resolutionHrs || 0);

    const slaConfig = await prisma.sLAConfig.upsert({
      where: { priority },
      update: { responseTimeHrs: finalResponseHrs, resolutionHrs: finalResolutionHrs },
      create: { priority, responseTimeHrs: finalResponseHrs, resolutionHrs: finalResolutionHrs },
    });

    return NextResponse.json(slaConfig);
  } catch (error) {
    console.error('Erro ao configurar SLA:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
