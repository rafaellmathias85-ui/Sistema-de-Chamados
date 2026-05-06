import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// PATCH - Approve/reject script or update
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { action } = await request.json();

    if (action === 'approve') {
      const script = await prisma.rmmScript.update({
        where: { id: params.id },
        data: {
          approved: true,
          approvedBy: session.user.name,
          approvedAt: new Date(),
        },
      });
      return NextResponse.json(script);
    } else if (action === 'reject') {
      const script = await prisma.rmmScript.update({
        where: { id: params.id },
        data: {
          approved: false,
          approvedBy: null,
          approvedAt: null,
        },
      });
      return NextResponse.json(script);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('Error updating script:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// DELETE - Delete script
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN','SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    await prisma.rmmScript.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting script:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}
