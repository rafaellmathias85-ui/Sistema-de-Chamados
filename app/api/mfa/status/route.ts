import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Get current user's MFA status
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        mfaEnabled: true,
        mfaEnforced: true,
        mfaVerifiedAt: true,
        mfaBackupCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const backupCodesCount = user.mfaBackupCodes ? JSON.parse(user.mfaBackupCodes).length : 0;

    // Check global MFA requirement
    const globalSetting = await prisma.appSetting.findUnique({
      where: { key: 'mfa_required_global' },
    });

    return NextResponse.json({
      mfaEnabled: user.mfaEnabled,
      mfaEnforced: user.mfaEnforced,
      mfaVerifiedAt: user.mfaVerifiedAt,
      backupCodesRemaining: backupCodesCount,
      globalMfaRequired: globalSetting?.value === 'true',
    });
  } catch (error) {
    console.error('MFA status error:', error);
    return NextResponse.json({ error: 'Erro ao buscar status MFA' }, { status: 500 });
  }
}
