import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Get global MFA settings + user MFA statuses
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const globalSetting = await prisma.appSetting.findUnique({
      where: { key: 'mfa_required_global' },
    });

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mfaEnabled: true,
        mfaEnforced: true,
        mfaVerifiedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      globalMfaRequired: globalSetting?.value === 'true',
      users,
    });
  } catch (error) {
    console.error('Admin MFA error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// POST - Toggle global MFA setting
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { enabled } = await request.json();

    await prisma.appSetting.upsert({
      where: { key: 'mfa_required_global' },
      update: { value: enabled ? 'true' : 'false' },
      create: { key: 'mfa_required_global', value: enabled ? 'true' : 'false' },
    });

    await prisma.mfaAuditLog.create({
      data: {
        userId: session.user.id,
        action: enabled ? 'mfa_global_enabled' : 'mfa_global_disabled',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
        details: `Global MFA ${enabled ? 'enabled' : 'disabled'} by admin`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin MFA toggle error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
