import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Default status config
const DEFAULT_STATUSES = [
  { key: 'OPEN', label: 'Aberto', color: '#22c55e', enabled: true },
  { key: 'IN_PROGRESS', label: 'Em Andamento', color: '#3b82f6', enabled: true },
  { key: 'IN_PARTNER', label: 'Parceiro', color: '#a855f7', enabled: true },
  { key: 'PAUSED', label: 'Pausado', color: '#f59e0b', enabled: true },
  { key: 'AWAITING_CLIENT', label: 'Aguardando Cliente', color: '#f97316', enabled: true },
  { key: 'RESOLVED', label: 'Resolvido', color: '#06b6d4', enabled: true },
  { key: 'CLOSED', label: 'Fechado', color: '#6b7280', enabled: true },
];

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const setting = await prisma.appSetting.findUnique({ where: { key: 'ticket_status_config' } });
    if (setting) {
      return NextResponse.json(JSON.parse(setting.value));
    }
    return NextResponse.json(DEFAULT_STATUSES);
  } catch (error) {
    console.error('Erro ao buscar config de status:', error);
    return NextResponse.json(DEFAULT_STATUSES);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 400 });
    }

    // Validate structure
    for (const s of body) {
      if (!s.key || !s.label) {
        return NextResponse.json({ error: 'Cada status deve ter key e label' }, { status: 400 });
      }
    }

    await prisma.appSetting.upsert({
      where: { key: 'ticket_status_config' },
      update: { value: JSON.stringify(body) },
      create: { key: 'ticket_status_config', value: JSON.stringify(body) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar config de status:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
