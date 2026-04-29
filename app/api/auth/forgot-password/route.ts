import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Check user exists
    if (!user) {
      return NextResponse.json({ error: 'Email não encontrado no sistema.' }, { status: 404 });
    }

    // Only ADMIN users can recover password
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Recuperação de senha disponível apenas para administradores. Entre em contato com o administrador do sistema.' }, { status: 403 });
    }

    // Rate limit: max 1 request per 2 minutes
    const recentToken = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
        used: false,
      },
    });

    if (recentToken) {
      return NextResponse.json({ success: true, message: 'Se o email existir, um código será enviado.' });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate previous tokens
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Create new token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
      },
    });

    // Send email
    const appUrl = process.env.NEXTAUTH_URL || '';
    let appName = 'Help Desk';
    try { appName = new URL(appUrl).hostname.split('.')[0]; } catch {}

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6, #1e40af); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="color: white; margin: 0; font-size: 24px;">Recuperação de Senha</h2>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">Olá <strong>${user.name}</strong>,</p>
          <p style="color: #4b5563; margin-bottom: 20px;">Você solicitou a recuperação de senha. Use o código abaixo para redefinir sua senha:</p>
          <div style="background: white; border: 2px dashed #3b82f6; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e40af; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Este código expira em <strong>15 minutos</strong>.</p>
          <p style="color: #6b7280; font-size: 14px;">Se você não solicitou a recuperação, ignore este email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Este é um email automático, não responda.</p>
        </div>
      </div>
    `;

    try {
      await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_RECUPERAO_DE_SENHA,
          subject: `Código de Recuperação de Senha - ${code}`,
          body: htmlBody,
          is_html: true,
          recipient_email: user.email,
          sender_alias: appName,
        }),
      });
    } catch (emailError) {
      console.error('Erro ao enviar email de recuperação:', emailError);
    }

    return NextResponse.json({ success: true, message: 'Se o email existir, um código será enviado.' });
  } catch (error) {
    console.error('Erro na recuperação de senha:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
