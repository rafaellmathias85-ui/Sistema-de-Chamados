import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - List alerts
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const acknowledged = searchParams.get('acknowledged');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (acknowledged === 'false') where.acknowledged = false;
    else if (acknowledged === 'true') where.acknowledged = true;

    const alerts = await prisma.rmmAlert.findMany({
      where,
      include: {
        machine: { select: { hostname: true, companyId: true, company: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Error listing alerts:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// PATCH - Acknowledge alert com ação: 'close' ou 'create_ticket'
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { alertId, action } = await request.json(); // action: 'close' | 'create_ticket'
    if (!alertId) {
      return NextResponse.json({ error: 'alertId obrigatório' }, { status: 400 });
    }

    const alert = await prisma.rmmAlert.findUnique({
      where: { id: alertId },
      include: {
        machine: {
          select: {
            hostname: true,
            companyId: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!alert) return NextResponse.json({ error: 'Alerta não encontrado' }, { status: 404 });

    const actionTaken = action === 'create_ticket' ? 'ticket_created' : 'closed';
    let ticketId: string | undefined;

    if (action === 'create_ticket') {
      // Criar ticket a partir do alerta
      const typeLabels: Record<string, string> = {
        cpu_high: 'CPU Alta', ram_high: 'RAM Alta', disk_high: 'Disco Alto',
        offline: 'Offline', snmp_offline: 'Rede Offline', service_stopped: 'Serviço Parado',
      };
      const typeLabel = typeLabels[alert.alertType] || alert.alertType;
      const severityLabel = alert.severity === 'critical' ? 'CRÍTICA' : alert.severity === 'warning' ? 'ALTA' : 'MÉDIA';
      const priorityMap: Record<string, string> = { critical: 'CRITICAL', warning: 'HIGH', info: 'MEDIUM' };

      const ticket = await prisma.ticket.create({
        data: {
          subject: `[RMM] ${typeLabel} - ${alert.machine.hostname}`,
          description: [
            `**Alerta RMM gerado automaticamente**`,
            ``,
            `**Tipo:** ${typeLabel}`,
            `**Severidade:** ${severityLabel}`,
            `**Máquina:** ${alert.machine.hostname}`,
            `**Empresa:** ${alert.machine.company?.name || 'N/A'}`,
            `**Mensagem:** ${alert.message}`,
            alert.thresholdValue != null ? `**Limite:** ${alert.thresholdValue}%` : '',
            alert.actualValue != null ? `**Valor Atual:** ${alert.actualValue}%` : '',
            `**Data do Alerta:** ${new Date(alert.createdAt).toLocaleString('pt-BR')}`,
          ].filter(Boolean).join('\\n'),
          status: 'OPEN',
          priority: (priorityMap[alert.severity] || 'MEDIUM') as any,
          source: 'rmm',
          creatorId: session.user.id,
          companyId: alert.machine.company?.id || alert.machine.companyId,
          assigneeId: session.user.id,
          tenantId: session.user.tenantId || undefined,
        },
      });
      ticketId = ticket.id;
    }

    await prisma.rmmAlert.update({
      where: { id: alertId },
      data: {
        acknowledged: true,
        acknowledgedBy: session.user.id,
        acknowledgedByName: session.user.name || session.user.email,
        acknowledgedAt: new Date(),
        actionTaken,
        ...(ticketId ? { ticketId } : {}),
      },
    });

    return NextResponse.json({ success: true, action: actionTaken, ticketId });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// DELETE - Excluir alerta reconhecido (somente ADMIN/SUPPORT)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { alertId } = await request.json();
    if (!alertId) {
      return NextResponse.json({ error: 'alertId obrigatório' }, { status: 400 });
    }

    const alert = await prisma.rmmAlert.findUnique({ where: { id: alertId } });
    if (!alert) {
      return NextResponse.json({ error: 'Alerta não encontrado' }, { status: 404 });
    }
    if (!alert.acknowledged) {
      return NextResponse.json({ error: 'Só é possível excluir alertas reconhecidos' }, { status: 400 });
    }

    await prisma.rmmAlert.delete({ where: { id: alertId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json({ error: 'Erro ao excluir alerta' }, { status: 500 });
  }
}
