import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - List alert policies
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const policies = await prisma.rmmAlertPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error('Error listing policies:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// POST - Create/update alert policy
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { id, name, companyId, cpuThreshold, ramThreshold, diskThreshold, offlineMinutes, enabled } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });
    }

    const data: any = {
      name,
      companyId: companyId || null,
      cpuThreshold: cpuThreshold !== undefined && cpuThreshold !== '' ? parseFloat(cpuThreshold) : null,
      ramThreshold: ramThreshold !== undefined && ramThreshold !== '' ? parseFloat(ramThreshold) : null,
      diskThreshold: diskThreshold !== undefined && diskThreshold !== '' ? parseFloat(diskThreshold) : null,
      offlineMinutes: offlineMinutes !== undefined && offlineMinutes !== '' ? parseInt(offlineMinutes) : null,
      enabled: enabled !== false,
    };
    if (!id) {
      data.createdBy = session.user.id;
      data.createdByName = session.user.name || 'Admin';
    }

    let policy;
    if (id) {
      policy = await prisma.rmmAlertPolicy.update({ where: { id }, data });
    } else {
      policy = await prisma.rmmAlertPolicy.create({ data });
    }

    return NextResponse.json(policy);
  } catch (error) {
    console.error('Error saving policy:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
