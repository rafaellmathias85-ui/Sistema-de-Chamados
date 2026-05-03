import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Default status config (usado quando AppSetting não existe)
const DEFAULT_STATUSES = [
  { key: 'OPEN', label: 'Aberto', color: '#22c55e', enabled: true },
  { key: 'IN_PROGRESS', label: 'Em Andamento', color: '#3b82f6', enabled: true },
  { key: 'IN_PARTNER', label: 'Parceiro', color: '#a855f7', enabled: true },
  { key: 'PAUSED', label: 'Pausado', color: '#f59e0b', enabled: true },
  { key: 'AWAITING_CLIENT', label: 'Aguardando Cliente', color: '#f97316', enabled: true },
  { key: 'RESOLVED', label: 'Resolvido', color: '#06b6d4', enabled: true },
  { key: 'CLOSED', label: 'Fechado', color: '#6b7280', enabled: true },
];

// Status protegidos - não podem ser removidos pois existem regras de negócio dependentes
// (notificações, transferências de ticket, fluxos automáticos, etc.)
const PROTECTED_KEYS = new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const setting = await prisma.appSetting.findUnique({ where: { key: 'ticket_status_config' } });
    if (setting) {
      try {
        const parsed = JSON.parse(setting.value);
        if (Array.isArray(parsed) && parsed.length > 0) return NextResponse.json(parsed);
      } catch {}
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
    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json({ error: 'Lista de status inválida ou vazia' }, { status: 400 });
    }

    // Validação de estrutura e unicidade de keys
    const seenKeys = new Set<string>();
    const normalized: Array<{ key: string; label: string; color: string; enabled: boolean }> = [];
    for (const s of body) {
      if (!s || typeof s !== 'object') {
        return NextResponse.json({ error: 'Item inválido' }, { status: 400 });
      }
      const key = String(s.key || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      const label = String(s.label || '').trim();
      const color = typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#6b7280';
      const enabled = s.enabled !== false;
      if (!key) return NextResponse.json({ error: 'Cada status deve ter um código (key) válido' }, { status: 400 });
      if (!label) return NextResponse.json({ error: `Status "${key}" precisa de um label` }, { status: 400 });
      if (seenKeys.has(key)) return NextResponse.json({ error: `Código "${key}" duplicado` }, { status: 400 });
      seenKeys.add(key);
      normalized.push({ key, label, color, enabled });
    }

    // Garantir que keys protegidos estão presentes
    for (const protKey of Array.from(PROTECTED_KEYS)) {
      if (!seenKeys.has(protKey)) {
        return NextResponse.json({ error: `Status "${protKey}" é protegido e não pode ser removido` }, { status: 400 });
      }
    }

    // Verificar se removeram algum status atualmente em uso (em chamados existentes)
    const inUse = await prisma.ticket.findMany({
      select: { status: true },
      distinct: ['status'],
    });
    const inUseKeys = new Set(inUse.map((t: { status: string }) => t.status));
    const missing: string[] = [];
    for (const k of Array.from(inUseKeys)) {
      if (!seenKeys.has(k)) missing.push(k);
    }
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Os seguintes status não podem ser removidos pois estão em uso por chamados: ${missing.join(', ')}. Migre os chamados antes de remover.`,
      }, { status: 400 });
    }

    await prisma.appSetting.upsert({
      where: { key: 'ticket_status_config' },
      update: { value: JSON.stringify(normalized) },
      create: { key: 'ticket_status_config', value: JSON.stringify(normalized) },
    });

    return NextResponse.json({ success: true, statuses: normalized });
  } catch (error) {
    console.error('Erro ao salvar config de status:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
