import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emitEvent } from '@/lib/events';
import { notifyNewTicket } from '@/lib/notifications';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '10');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search');
    const assigneeId = searchParams.get('assigneeId');
    const onlyMine = searchParams.get('onlyMine') === 'true';
    const unassigned = searchParams.get('unassigned') === 'true';
    const slaExpiring = searchParams.get('slaExpiring') === 'true';
    const reopened = searchParams.get('reopened') === 'true';
    const sort = searchParams.get('sort');
    const order = searchParams.get('order');

    const where: any = {};

    // Clientes só vêem tickets da própria empresa
    if (session.user.role === 'CLIENT' && session.user.companyId) {
      where.companyId = session.user.companyId;
    }

    if (status) {
      const statuses = status.split(',').map((s: string) => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    if (priority) {
      where.priority = priority;
    }

    // Filtro por responsável (ADMIN/SUPPORT/FINANCE)
    if (assigneeId && ['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      if (assigneeId === 'unassigned') {
        where.assigneeId = null;
      } else {
        where.assigneeId = assigneeId;
      }
    }

    // Filtro "apenas meus chamados" (ADMIN/SUPPORT/FINANCE)
    if (onlyMine && ['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role)) {
      where.assigneeId = session.user.id;
    }

    // Workspace filters
    if (unassigned) {
      where.assigneeId = null;
    }
    if (slaExpiring) {
      const now = new Date();
      where.status = { in: ['OPEN', 'IN_PROGRESS'] };
      where.resolutionDueAt = { gte: now, lte: new Date(now.getTime() + 4 * 60 * 60 * 1000) };
    }
    if (reopened) {
      where.reopenedFlag = true;
    }

    // Busca expandida: número, assunto, descrição, domínio da empresa, email do cliente
    if (search) {
      const searchConditions: any[] = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        // Busca por email do criador
        { creator: { email: { contains: search, mode: 'insensitive' } } },
        // Busca por nome da empresa
        { company: { name: { contains: search, mode: 'insensitive' } } },
        // Busca por domínio da empresa
        { company: { domain: { contains: search, mode: 'insensitive' } } },
      ];

      // Verifica se é um número para buscar pelo número do chamado
      const searchNumber = parseInt(search.replace('#', ''));
      if (!isNaN(searchNumber)) {
        searchConditions.push({ number: searchNumber });
      }

      where.OR = searchConditions;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          creator: { select: { name: true, email: true } },
          assignee: { select: { id: true, name: true } },
          company: { select: { name: true, domain: true } },
          category: { select: { id: true, name: true, color: true } },
        },
        orderBy: { [sort || 'createdAt']: order || 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return NextResponse.json({
      tickets,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar chamados' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { subject, description, priority, categoryId, creatorId: reqCreatorId, companyId: reqCompanyId } = await request.json();

    if (!subject || !description) {
      return NextResponse.json(
        { error: 'Assunto e descrição são obrigatórios' },
        { status: 400 }
      );
    }

    const isStaff = ['ADMIN', 'SUPPORT', 'FINANCE'].includes(session.user.role);

    // Determinar creatorId e companyId
    let finalCreatorId = session.user.id;
    let finalCompanyId: string | null = null;

    if (isStaff && reqCreatorId && reqCompanyId) {
      // ADMIN/SUPPORT pode criar chamado em nome de outro usuário
      const targetUser = await prisma.user.findUnique({
        where: { id: reqCreatorId },
        select: { id: true, companyId: true },
      });
      if (!targetUser || targetUser.companyId !== reqCompanyId) {
        return NextResponse.json(
          { error: 'Solicitante inválido ou não pertence à empresa selecionada' },
          { status: 400 }
        );
      }
      finalCreatorId = reqCreatorId;
      finalCompanyId = reqCompanyId;
    } else {
      // Buscar dados do usuário logado para pegar a empresa
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });

      if (!user?.companyId) {
        return NextResponse.json(
          { error: 'Usuário não está associado a uma empresa' },
          { status: 400 }
        );
      }
      finalCompanyId = user.companyId;
    }

    // Buscar configuração de SLA para a prioridade
    const ticketPriority = priority || 'MEDIUM';
    const slaConfig = await prisma.sLAConfig.findUnique({
      where: { priority: ticketPriority },
    });

    // Calcular prazos de SLA (0 hours = sem prazo / "Sem SLA")
    const now = new Date();
    const responseDueAt = (slaConfig && slaConfig.responseTimeHrs > 0)
      ? new Date(now.getTime() + slaConfig.responseTimeHrs * 60 * 60 * 1000)
      : null;
    const resolutionDueAt = (slaConfig && slaConfig.resolutionHrs > 0)
      ? new Date(now.getTime() + slaConfig.resolutionHrs * 60 * 60 * 1000)
      : null;

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        priority: ticketPriority,
        categoryId: categoryId || null,
        creatorId: finalCreatorId,
        companyId: finalCompanyId!,
        responseDueAt,
        resolutionDueAt,
      },
      include: {
        creator: { select: { name: true, email: true } },
        company: { select: { name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
    });

    // Enviar notificação de novo chamado
    try {
      const ticketUrl = `${process.env.NEXTAUTH_URL}/tickets/${ticket.id}`;
      await notifyNewTicket({
        ticketNumber: ticket.number,
        subject: ticket.subject,
        description: ticket.description,
        priority: ticket.priority,
        creatorName: ticket.creator.name,
        creatorEmail: ticket.creator.email || '',
        companyName: ticket.company.name,
        ticketUrl,
      });
    } catch (notifyError) {
      console.error('Erro ao enviar notificação de novo chamado:', notifyError);
    }

    // Emit telemetry event
    emitEvent({
      type: 'ticket_created',
      entityType: 'ticket',
      entityId: ticket.id,
      severity: ticket.priority === 'CRITICAL' ? 'critical' : ticket.priority === 'HIGH' ? 'warning' : 'info',
      actorId: session.user.id,
      actorName: session.user.name || undefined,
      metadata: { number: ticket.number, subject: ticket.subject, priority: ticket.priority, companyName: ticket.company.name },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error('Error creating ticket:', error);
    return NextResponse.json(
      { error: 'Erro ao criar chamado' },
      { status: 500 }
    );
  }
}
