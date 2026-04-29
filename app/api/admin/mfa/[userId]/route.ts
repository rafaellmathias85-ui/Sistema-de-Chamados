import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// PATCH - Admin: enforce/unenforce MFA for a user, or reset MFA
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { action } = await request.json();
    const userId = params.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, mfaEnabled: true, mfaEnforced: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    switch (action) {
      case 'enforce':
        await prisma.user.update({
          where: { id: userId },
          data: { mfaEnforced: true },
        });
        await prisma.mfaAuditLog.create({
          data: { userId, action: 'mfa_enforced_by_admin', ipAddress, userAgent, details: `Enforced by ${session.user.name}` },
        });
        break;

      case 'unenforce':
        await prisma.user.update({
          where: { id: userId },
          data: { mfaEnforced: false },
        });
        await prisma.mfaAuditLog.create({
          data: { userId, action: 'mfa_unenforced_by_admin', ipAddress, userAgent, details: `Unenforced by ${session.user.name}` },
        });
        break;

      case 'reset':
        await prisma.user.update({
          where: { id: userId },
          data: {
            mfaEnabled: false,
            mfaSecret: null,
            mfaBackupCodes: null,
            mfaVerifiedAt: null,
            mfaFailedAttempts: 0,
            mfaLockedUntil: null,
          },
        });
        await prisma.mfaAuditLog.create({
          data: { userId, action: 'mfa_reset_by_admin', ipAddress, userAgent, details: `Reset by ${session.user.name}` },
        });
        break;

      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin MFA user action error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
