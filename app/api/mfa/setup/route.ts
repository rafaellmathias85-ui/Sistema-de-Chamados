import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateTOTPSecret, generateTOTPUri, encryptSecret } from '@/lib/mfa';
import QRCode from 'qrcode';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST - Generate MFA setup (temp secret + QR code)
// Supports both authenticated session and pre-login userId (for enforced MFA setup)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const { userId: bodyUserId } = body;
    
    // Allow pre-login setup when userId is provided (for enforced MFA)
    const targetUserId = session?.user?.id || bodyUserId;
    if (!targetUserId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, mfaEnabled: true, mfaEnforced: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Only allow pre-login setup if MFA is enforced
    if (!session?.user && !user.mfaEnforced) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA já está ativado' }, { status: 400 });
    }

    // Generate secret
    const secret = generateTOTPSecret();
    const uri = generateTOTPUri(secret, user.email);
    const qrCodeDataUrl = await QRCode.toDataURL(uri);

    // Store temp encrypted secret (not yet confirmed)
    const encrypted = encryptSecret(secret);
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: encrypted },
    });

    // Log setup attempt
    await prisma.mfaAuditLog.create({
      data: {
        userId: user.id,
        action: 'mfa_setup',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      },
    });

    return NextResponse.json({
      qrCode: qrCodeDataUrl,
      secret, // Show manual entry key
      uri,
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return NextResponse.json({ error: 'Erro ao configurar MFA' }, { status: 500 });
  }
}
