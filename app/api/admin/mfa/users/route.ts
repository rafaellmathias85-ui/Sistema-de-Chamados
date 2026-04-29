import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - List all users with MFA status for admin management
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mfaEnabled: true,
        mfaEnforced: true,
        mfaVerifiedAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Erro ao listar usuários MFA:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH - Toggle MFA for a specific user
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { userId, action } = await req.json();
    if (!userId || !action) {
      return NextResponse.json({ error: 'userId e action são obrigatórios' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    let updateData: any = {};
    let auditAction = '';

    switch (action) {
      case 'enforce':
        updateData = { mfaEnforced: true };
        auditAction = 'mfa_enforced_by_admin';
        break;
      case 'unenforce':
        updateData = { mfaEnforced: false };
        auditAction = 'mfa_unenforced_by_admin';
        break;
      case 'reset':
        updateData = {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
          mfaVerifiedAt: null,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        };
        auditAction = 'mfa_reset_by_admin';
        break;
      case 'disable':
        updateData = {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: null,
          mfaVerifiedAt: null,
          mfaEnforced: false,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        };
        auditAction = 'mfa_disabled_by_admin';
        break;
      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    await prisma.user.update({ where: { id: userId }, data: updateData });

    // Audit log
    await prisma.mfaAuditLog.create({
      data: {
        userId,
        action: auditAction,
        details: `Admin ${session.user.name} (${session.user.email}) executou ${action} para ${user.name} (${user.email})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar MFA do usuário:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
