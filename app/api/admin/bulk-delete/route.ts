import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Bulk delete companies or users (ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 });
    }

    const { type, ids } = await request.json();

    if (!type || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Tipo e IDs são obrigatórios' }, { status: 400 });
    }

    if (!['companies', 'users', 'tickets'].includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }

    let deleted = 0;
    const errors: string[] = [];

    if (type === 'companies') {
      for (const id of ids) {
        try {
          // Check if company has tickets
          const ticketCount = await prisma.ticket.count({ where: { companyId: id } });
          if (ticketCount > 0) {
            const company = await prisma.company.findUnique({ where: { id }, select: { name: true } });
            errors.push(`${company?.name || id}: possui ${ticketCount} chamado(s)`);
            continue;
          }
          // Delete users of the company first
          await prisma.user.deleteMany({ where: { companyId: id } });
          await prisma.company.delete({ where: { id } });
          deleted++;
        } catch (e: any) {
          errors.push(`Erro ao excluir empresa ${id}: ${e.message}`);
        }
      }
    } else {
      for (const id of ids) {
        try {
          // Don't allow deleting own account
          if (id === session.user.id) {
            errors.push('Não é possível excluir sua própria conta');
            continue;
          }
          // Check if user has tickets
          const ticketCount = await prisma.ticket.count({
            where: { OR: [{ creatorId: id }, { assigneeId: id }] },
          });
          if (ticketCount > 0) {
            const user = await prisma.user.findUnique({ where: { id }, select: { name: true } });
            errors.push(`${user?.name || id}: possui ${ticketCount} chamado(s) vinculado(s)`);
            continue;
          }
          await prisma.user.delete({ where: { id } });
          deleted++;
        } catch (e: any) {
          errors.push(`Erro ao excluir usuário ${id}: ${e.message}`);
        }
      }
    }

    if (type === 'tickets') {
      for (const id of ids) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.ticketAttachment.deleteMany({ where: { ticketId: id } });
            await tx.ticketMessage.deleteMany({ where: { ticketId: id } });
            await tx.ticketHistory.deleteMany({ where: { ticketId: id } });
            await tx.ticketTransferRequest.deleteMany({ where: { ticketId: id } });
            await tx.appointment.deleteMany({ where: { ticketId: id } });
            await tx.processedEmail.updateMany({ where: { ticketId: id }, data: { ticketId: null } });
            await tx.ticket.delete({ where: { id } });
          });
          deleted++;
        } catch (e: any) {
          errors.push(`Erro ao excluir chamado ${id}: ${e.message}`);
        }
      }
    }

    // Log the bulk action using MfaAuditLog (general audit)
    await prisma.mfaAuditLog.create({
      data: {
        userId: session.user.id,
        action: `bulk_delete_${type}`,
        details: `${deleted} excluído(s) de ${ids.length}${errors.length > 0 ? '. Erros: ' + errors.join('; ') : ''}`,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      },
    }).catch(() => {}); // Don't fail if audit log fails

    return NextResponse.json({
      success: true,
      deleted,
      total: ids.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json({ error: 'Erro ao excluir em massa' }, { status: 500 });
  }
}
