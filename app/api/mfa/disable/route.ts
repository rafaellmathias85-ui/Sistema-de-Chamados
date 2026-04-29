import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptSecret, verifyTOTP } from '@/lib/mfa';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Disable MFA for current user
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, mfaEnabled: true, mfaSecret: true, mfaEnforced: true },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: 'MFA não está ativado' }, { status: 400 });
    }

    if (user.mfaEnforced) {
      return NextResponse.json({ error: 'MFA é obrigatório para sua conta. Contate o administrador.' }, { status: 403 });
    }

    // Verify code before disabling
    const secret = decryptSecret(user.mfaSecret);
    if (!verifyTOTP(code, secret)) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
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
      data: {
        userId: user.id,
        action: 'mfa_disabled',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('MFA disable error:', error);
    return NextResponse.json({ error: 'Erro ao desativar MFA' }, { status: 500 });
  }
}
