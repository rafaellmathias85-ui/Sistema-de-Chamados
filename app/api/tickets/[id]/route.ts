import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emitEvent } from '@/lib/events';
import { notifyStatusChange, sendNotificationEmail } from '@/lib/notifications';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';


export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true } },
        company: { select: { name: true } },
        category: { select: { id: true, name: true, color: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Chamado não encontrado' },
        { status: 404 }
      );
    }

    // Verificar permissão - CLIENT só vê da própria empresa; FINANCE tem acesso total como SUPPORT
    if (session.user.role === 'CLIENT' && ticket.companyId !== session.user.companyId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Filtrar notas internas para clientes
    if (session.user.role === 'CLIENT') {
      ticket.messages = ticket.messages.filter((m: any) => !m.isInternal);
    }

    // Retorna o ticket com alertAssignee intacto — o frontend é responsável por limpar o alerta
    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar chamado' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Apenas admin, suporte e financeiro podem atualizar tickets
    if (session.user.role === 'CLIENT') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();
    const { status, assigneeId, priority, categoryId, forwardToFinance, financialValue, financialNotes, clearAlert, faturado, notaFiscalPath, dataFaturamento, resolveFlow, serviceStartedAt, serviceEndedAt } = body;

    // Se for apenas para limpar o alerta, faz update rápido e retorna
    if (clearAlert) {
      await prisma.ticket.update({
        where: { id: params.id },
        data: { alertAssignee: false },
      });
      return NextResponse.json({ ok: true });
    }

    // Buscar ticket atual para comparar status
    const currentTicket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!currentTicket) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    // Bloquear alterações em tickets encaminhados ao financeiro (exceto operações financeiras por ADMIN/FINANCE)
    if (currentTicket.forwardedToFinance && currentTicket.status === 'CLOSED') {
      const isFinancialOperation = (faturado !== undefined || notaFiscalPath !== undefined || financialValue !== undefined || financialNotes !== undefined);
      const isFinanceRole = ['ADMIN', 'FINANCE'].includes(session.user.role);
      if (!clearAlert && !(isFinancialOperation && isFinanceRole)) {
        return NextResponse.json({ error: 'Chamado encaminhado ao financeiro não pode ser alterado' }, { status: 403 });
      }
    }

    // Regra: CLOSED só permitido via resolveFlow (modal de resolução)
    if (status === 'CLOSED' && !resolveFlow && !forwardToFinance && currentTicket.status !== 'CLOSED') {
      return NextResponse.json(
        { error: 'Status "Fechado" só é liberado após o fluxo de resolução (Resolvido → destino financeiro definido).' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    const oldStatus = currentTicket.status;
    const historyEntries: any[] = [];

    if (status) {
      updateData.status = status;
      if (status === 'RESOLVED') {
        updateData.resolvedAt = new Date();
      }
      if (status === 'CLOSED') {
        updateData.closedAt = new Date();
        updateData.resolvedAt = currentTicket.resolvedAt || new Date();
      }
      // Se reabrir, limpar closedAt
      if (status !== 'CLOSED' && currentTicket.status === 'CLOSED') {
        updateData.closedAt = null;
      }

      // Service start/end times (technician override at resolve)
      if (serviceStartedAt) {
        updateData.serviceStartedAt = new Date(serviceStartedAt);
      }
      if (serviceEndedAt) {
        updateData.serviceEndedAt = new Date(serviceEndedAt);
      }
      
      // Registrar mudança de status no histórico
      if (status !== oldStatus) {
        historyEntries.push({
          ticketId: params.id,
          action: 'status_change',
          fromValue: oldStatus,
          toValue: status,
          userId: session.user.id,
          userName: session.user.name || 'Usuário',
          userRole: session.user.role,
        });
      }
    }

    if (assigneeId !== undefined) {
      const oldAssigneeId = currentTicket.assigneeId;
      updateData.assigneeId = assigneeId;
      // Registrar primeira resposta se estiver assumindo o chamado
      if (assigneeId && !currentTicket.firstResponseAt) {
        updateData.firstResponseAt = new Date();
      }
      
      // Registrar mudança de responsável no histórico
      if (assigneeId !== oldAssigneeId) {
        historyEntries.push({
          ticketId: params.id,
          action: 'assigned',
          fromValue: oldAssigneeId || 'Não atribuído',
          toValue: assigneeId || 'Não atribuído',
          userId: session.user.id,
          userName: session.user.name || 'Usuário',
          userRole: session.user.role,
        });
      }
    }

    if (priority) {
      updateData.priority = priority;
    }

    if (categoryId !== undefined) {
      updateData.categoryId = categoryId || null;
    }

    // Encaminhar para financeiro → fecha o chamado automaticamente
    if (forwardToFinance === true) {
      updateData.forwardedToFinance = true;
      updateData.status = 'CLOSED';
      updateData.closedAt = new Date();
      historyEntries.push({
        ticketId: params.id,
        action: 'forwarded_finance',
        fromValue: 'false',
        toValue: 'true',
        note: 'Chamado encaminhado para o financeiro e fechado automaticamente',
        userId: session.user.id,
        userName: session.user.name || 'Usuário',
        userRole: session.user.role,
      });
      if (oldStatus !== 'CLOSED') {
        historyEntries.push({
          ticketId: params.id,
          action: 'status_change',
          fromValue: oldStatus,
          toValue: 'CLOSED',
          note: 'Fechado automaticamente ao encaminhar para financeiro',
          userId: session.user.id,
          userName: session.user.name || 'Usuário',
          userRole: session.user.role,
        });
      }
    }

    // Atualizar valor financeiro (apenas FINANCE ou ADMIN)
    if (financialValue !== undefined && ['ADMIN', 'FINANCE'].includes(session.user.role)) {
      updateData.financialValue = financialValue;
      updateData.financialUpdatedAt = new Date();
      updateData.financialUpdatedBy = session.user.name || session.user.id;
    }

    if (financialNotes !== undefined && ['ADMIN', 'FINANCE'].includes(session.user.role)) {
      updateData.financialNotes = financialNotes;
    }

    // Atualizar flag faturado (apenas FINANCE ou ADMIN)
    if (faturado !== undefined && ['ADMIN', 'FINANCE'].includes(session.user.role)) {
      updateData.faturado = faturado;
      if (faturado) {
        updateData.dataFaturamento = dataFaturamento ? new Date(dataFaturamento) : new Date();
      } else {
        updateData.dataFaturamento = null;
      }
      historyEntries.push({
        ticketId: params.id,
        action: 'faturado_change',
        fromValue: String(currentTicket.faturado),
        toValue: String(faturado),
        userId: session.user.id,
        userName: session.user.name || 'Usuário',
        userRole: session.user.role,
      });
    }

    // Atualizar nota fiscal (apenas FINANCE ou ADMIN)
    if (notaFiscalPath !== undefined && ['ADMIN', 'FINANCE'].includes(session.user.role)) {
      updateData.notaFiscalPath = notaFiscalPath;
      historyEntries.push({
        ticketId: params.id,
        action: 'nota_fiscal_upload',
        fromValue: currentTicket.notaFiscalPath || null,
        toValue: notaFiscalPath,
        userId: session.user.id,
        userName: session.user.name || 'Usuário',
        userRole: session.user.role,
      });
    }

    // Ativar alerta para o responsável se quem alterou não é o próprio responsável
    const effectiveAssigneeId = assigneeId !== undefined ? assigneeId : currentTicket.assigneeId;
    if (effectiveAssigneeId && effectiveAssigneeId !== session.user.id) {
      updateData.alertAssignee = true;
    }

    // Executar atualização e criar histórico em transação
    const [ticket] = await prisma.$transaction([
      prisma.ticket.update({
        where: { id: params.id },
        data: updateData,
        include: {
          creator: { select: { id: true, name: true, email: true } },
          assignee: { select: { name: true } },
          company: { select: { name: true } },
          category: { select: { id: true, name: true, color: true } },
        },
      }),
      // Criar entradas de histórico
      ...historyEntries.map(entry => prisma.ticketHistory.create({ data: entry })),
    ]);

    // Enviar email ao financeiro se encaminhado
    if (forwardToFinance === true) {
      try {
        const ticketUrl = `${process.env.NEXTAUTH_URL}/tickets/${ticket.id}`;
        await sendNotificationEmail({
          recipientEmail: 'financeiro@wticorp.com.br',
          subject: `💰 Chamado #${ticket.number} encaminhado para o Financeiro`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">💰 Novo Chamado Financeiro</h1>
              </div>
              <div style="padding: 30px; background: white;">
                <h2 style="color: #1e293b;">#${ticket.number} - ${ticket.subject}</h2>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr><td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Empresa:</strong></td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${ticket.company.name}</td></tr>
                  <tr><td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Cliente:</strong></td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${ticket.creator.name}</td></tr>
                  <tr><td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Encaminhado por:</strong></td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${session.user.name}</td></tr>
                </table>
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${ticketUrl}" style="background: #3B82F6; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ver Chamado</a>
                </div>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Erro ao enviar notificação financeiro:', emailError);
      }
    }

    // Enviar notificação se status mudou
    if (status && status !== oldStatus && ticket.creator.email) {
      const ticketUrl = `${process.env.NEXTAUTH_URL}/tickets/${ticket.id}`;
      try {
        await notifyStatusChange({
          ticketNumber: ticket.number,
          subject: ticket.subject,
          oldStatus,
          newStatus: status,
          updatedBy: session.user.name || 'Suporte',
          ticketUrl,
          clientEmail: ticket.creator.email,
        });
      } catch (emailError) {
        console.error('Erro ao enviar notificação:', emailError);
      }
    }

    // Emit telemetry events
    if (status && status !== oldStatus) {
      const evtType = status === 'CLOSED' ? 'ticket_closed' : status === 'RESOLVED' ? 'ticket_closed' : 'status_change';
      emitEvent({
        type: evtType,
        entityType: 'ticket',
        entityId: ticket.id,
        severity: status === 'CLOSED' || status === 'RESOLVED' ? 'info' : 'info',
        actorId: session.user.id,
        actorName: session.user.name || undefined,
        metadata: { number: ticket.number, from: oldStatus, to: status },
      });
    }
    if (assigneeId) {
      emitEvent({
        type: 'assignee_change',
        entityType: 'ticket',
        entityId: ticket.id,
        actorId: session.user.id,
        actorName: session.user.name || undefined,
        metadata: { number: ticket.number, assigneeId },
      });
    }

    return NextResponse.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar chamado' },
      { status: 500 }
    );
  }
}

// DELETE - Excluir chamado (somente ADMIN)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir chamados' }, { status: 403 });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true, number: true } });
    if (!ticket) {
      return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
    }

    // Deletar registros dependentes na ordem correta
    await prisma.$transaction(async (tx) => {
      await tx.ticketAttachment.deleteMany({ where: { ticketId: ticket.id } });
      await tx.ticketMessage.deleteMany({ where: { ticketId: ticket.id } });
      await tx.ticketHistory.deleteMany({ where: { ticketId: ticket.id } });
      await tx.ticketTransferRequest.deleteMany({ where: { ticketId: ticket.id } });
      await tx.appointment.deleteMany({ where: { ticketId: ticket.id } });
      // Nullify processedEmail references
      await tx.processedEmail.updateMany({ where: { ticketId: ticket.id }, data: { ticketId: null } });
      await tx.ticket.delete({ where: { id: ticket.id } });
    });

    // Emitir evento de auditoria
    emitEvent({
      type: 'ticket_deleted',
      entityType: 'ticket',
      entityId: ticket.id,
      severity: 'warning',
      actorId: session.user.id,
      actorName: session.user.name || undefined,
      metadata: { number: ticket.number },
    });

    return NextResponse.json({ success: true, message: `Chamado #${ticket.number} excluído com sucesso` });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return NextResponse.json({ error: 'Erro ao excluir chamado' }, { status: 500 });
  }
}
