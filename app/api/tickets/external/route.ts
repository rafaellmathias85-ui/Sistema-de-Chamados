import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import {
  sendNotificationEmail,
  getNewTicketEmailTemplate,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';

// POST - Criar chamado externo (via WhatsApp/Email)
export async function POST(request: Request) {
  try {
    const { name, email, company, priority, subject, description } = await request.json();

    if (!name || !email || !subject || !description) {
      return NextResponse.json(
        { error: 'Nome, email, assunto e descrição são obrigatórios' },
        { status: 400 }
      );
    }

    // Verificar se usuário já existe
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: true }
    });

    let companyRecord = null;

    if (!user) {
      // Criar empresa se informada
      if (company) {
        companyRecord = await prisma.company.findFirst({
          where: { name: { equals: company, mode: 'insensitive' } }
        });

        if (!companyRecord) {
          companyRecord = await prisma.company.create({
            data: { name: company }
          });
        }
      }

      // Criar usuário com senha temporária
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name,
          password: hashedPassword,
          role: 'CLIENT',
          companyId: companyRecord?.id,
        },
        include: { company: true }
      });
    } else {
      companyRecord = user.company;
    }

    // Buscar configuração de SLA
    const slaConfig = await prisma.sLAConfig.findUnique({
      where: { priority: priority || 'MEDIUM' }
    });

    const now = new Date();
    const responseDueAt = (slaConfig && slaConfig.responseTimeHrs > 0)
      ? new Date(now.getTime() + slaConfig.responseTimeHrs * 60 * 60 * 1000)
      : null;
    const resolutionDueAt = (slaConfig && slaConfig.resolutionHrs > 0)
      ? new Date(now.getTime() + slaConfig.resolutionHrs * 60 * 60 * 1000)
      : null;

    // Criar chamado
    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        priority: priority || 'MEDIUM',
        status: 'OPEN',
        creatorId: user.id,
        companyId: companyRecord?.id || user.companyId || (await getDefaultCompanyId()),
        responseDueAt,
        resolutionDueAt,
      },
      include: {
        creator: true,
        company: true,
      }
    });

    // Enviar notificação por email para admin
    const adminEmail = process.env.ADMIN_EMAIL || 'chamados@wticorp.com.br';
    const ticketUrl = `${process.env.NEXTAUTH_URL}/tickets/${ticket.id}`;

    try {
      await sendNotificationEmail({
        notificationId: process.env.NOTIF_ID_NOVO_CHAMADO_CRIADO || '',
        recipientEmail: adminEmail,
        subject: `Novo Chamado #${ticket.number} - ${subject}`,
        body: getNewTicketEmailTemplate({
          ticketNumber: ticket.number,
          subject,
          description,
          priority: priority || 'MEDIUM',
          creatorName: name,
          creatorEmail: email,
          companyName: companyRecord?.name || 'Não informada',
          ticketUrl,
        }),
      });
    } catch (emailError) {
      console.error('Erro ao enviar notificação:', emailError);
    }

    return NextResponse.json({
      success: true,
      number: ticket.number,
      id: ticket.id,
    });
  } catch (error) {
    console.error('Erro ao criar chamado externo:', error);
    return NextResponse.json(
      { error: 'Erro ao criar chamado' },
      { status: 500 }
    );
  }
}

async function getDefaultCompanyId(): Promise<string> {
  // Buscar ou criar empresa padrão para clientes externos
  let company = await prisma.company.findFirst({
    where: { name: 'Clientes Externos' }
  });

  if (!company) {
    company = await prisma.company.create({
      data: { name: 'Clientes Externos' }
    });
  }

  return company.id;
}
