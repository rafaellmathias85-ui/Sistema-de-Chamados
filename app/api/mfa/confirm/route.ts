import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptSecret, verifyTOTP, generateBackupCodes, hashBackupCodes } from '@/lib/mfa';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Confirm MFA setup with first TOTP code
// Supports both authenticated session and pre-login userId (for enforced MFA setup)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const { code, userId: bodyUserId } = await request.json();
    
    const targetUserId = session?.user?.id || bodyUserId;
    if (!targetUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    if (!code) {
      return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, mfaEnabled: true, mfaSecret: true, mfaEnforced: true },
    });

    if (!user || !user.mfaSecret) {
      return NextResponse.json({ error: 'Configuração MFA não encontrada. Inicie o setup novamente.' }, { status: 400 });
    }

    // Only allow pre-login confirm if MFA is enforced
    if (!session?.user && !user.mfaEnforced) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA já está ativado' }, { status: 400 });
    }

    // Verify the code against the temp secret
    const secret = decryptSecret(user.mfaSecret);
    const isValid = verifyTOTP(code, secret);

    if (!isValid) {
      return NextResponse.json({ error: 'Código inválido. Tente novamente.' }, { status: 400 });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(8);
    const hashedCodes = await hashBackupCodes(backupCodes);

    // Activate MFA
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: JSON.stringify(hashedCodes),
        mfaVerifiedAt: new Date(),
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
      },
    });

    // Log
    await prisma.mfaAuditLog.create({
      data: {
        userId: user.id,
        action: 'mfa_enabled',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      },
    });

    return NextResponse.json({
      success: true,
      backupCodes, // Show once to the user
    });
  } catch (error) {
    console.error('MFA confirm error:', error);
    return NextResponse.json({ error: 'Erro ao confirmar MFA' }, { status: 500 });
  }
}
