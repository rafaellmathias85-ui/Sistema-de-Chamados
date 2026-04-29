import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, code, newPassword, resetMfa } = await request.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });
    }

    // Only ADMIN users can reset password
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem recuperar a senha' }, { status: 403 });
    }

    // Find valid token
    const token = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        code: code.trim(),
        used: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (!token) {
      return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 400 });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and mark token as used
    const updateData: any = { password: hashedPassword };

    // Reset MFA if requested
    if (resetMfa && user.mfaEnabled) {
      updateData.mfaEnabled = false;
      updateData.mfaSecret = null;
      updateData.mfaBackupCodes = null;
      updateData.mfaVerifiedAt = null;
      updateData.mfaFailedAttempts = 0;
      updateData.mfaLockedUntil = null;

      // Log MFA reset
      await prisma.mfaAuditLog.create({
        data: {
          userId: user.id,
          action: 'mfa_reset',
          details: 'MFA resetado via recuperação de senha',
        },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { used: true },
    });

    // Invalidate all other tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    return NextResponse.json({
      success: true,
      message: 'Senha alterada com sucesso!',
      mfaReset: resetMfa && user.mfaEnabled,
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
