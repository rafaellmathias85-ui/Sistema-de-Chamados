import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptSecret, verifyTOTP, verifyBackupCode, isUserMfaLocked, getMfaLockDuration } from '@/lib/mfa';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

// POST - Verify MFA during login
export async function POST(request: NextRequest) {
  try {
    const { userId, code, isBackupCode } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: 'Dados obrigatórios' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        mfaEnabled: true,
        mfaSecret: true,
        mfaBackupCodes: true,
        mfaFailedAttempts: true,
        mfaLockedUntil: true,
        company: { select: { name: true } },
      },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: 'MFA não configurado' }, { status: 400 });
    }

    // Check rate limiting
    if (isUserMfaLocked(user.mfaLockedUntil)) {
      const remainingSec = Math.ceil((new Date(user.mfaLockedUntil!).getTime() - Date.now()) / 1000);
      return NextResponse.json({
        error: `Conta bloqueada por tentativas excessivas. Tente novamente em ${Math.ceil(remainingSec / 60)} minuto(s).`,
        locked: true,
      }, { status: 429 });
    }

    let verified = false;
    let backupCodeUsed = false;

    if (isBackupCode) {
      // Try backup code
      const hashedCodes: string[] = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes) : [];
      const idx = await verifyBackupCode(code, hashedCodes);
      if (idx >= 0) {
        verified = true;
        backupCodeUsed = true;
        // Remove used backup code
        hashedCodes.splice(idx, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaBackupCodes: JSON.stringify(hashedCodes) },
        });
      }
    } else {
      // Verify TOTP
      const secret = decryptSecret(user.mfaSecret);
      verified = verifyTOTP(code, secret);
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
    const userAgent = request.headers.get('user-agent');

    if (!verified) {
      const newAttempts = user.mfaFailedAttempts + 1;
      const lockDuration = getMfaLockDuration(newAttempts);
      const updateData: any = { mfaFailedAttempts: newAttempts };

      if (lockDuration > 0) {
        updateData.mfaLockedUntil = new Date(Date.now() + lockDuration * 1000);
        await prisma.mfaAuditLog.create({
          data: { userId: user.id, action: 'mfa_locked', ipAddress, userAgent, details: `Locked for ${lockDuration}s after ${newAttempts} failed attempts` },
        });
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });
      await prisma.mfaAuditLog.create({
        data: { userId: user.id, action: 'mfa_verify_fail', ipAddress, userAgent },
      });

      return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
    }

    // Success - reset attempts
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaFailedAttempts: 0, mfaLockedUntil: null, mfaVerifiedAt: new Date() },
    });

    await prisma.mfaAuditLog.create({
      data: {
        userId: user.id,
        action: backupCodeUsed ? 'mfa_backup_used' : 'mfa_verify_success',
        ipAddress,
        userAgent,
      },
    });

    // Generate a temporary MFA verification token
    const mfaToken = jwt.sign(
      { userId: user.id, mfaVerified: true },
      process.env.NEXTAUTH_SECRET || 'fallback',
      { expiresIn: '5m' }
    );

    return NextResponse.json({
      success: true,
      mfaToken,
      backupCodeUsed,
      remainingBackupCodes: backupCodeUsed
        ? (user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes).length - 1 : 0)
        : undefined,
    });
  } catch (error) {
    console.error('MFA verify error:', error);
    return NextResponse.json({ error: 'Erro ao verificar MFA' }, { status: 500 });
  }
}
