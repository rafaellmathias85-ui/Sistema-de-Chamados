export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({}, { status: 401 });

    const where: any = {};
    if (session.user.role === 'CLIENT') {
      where.creatorId = session.user.id;
    }

    const statuses = ['OPEN', 'IN_PROGRESS', 'PAUSED', 'AWAITING_CLIENT', 'IN_PARTNER', 'RESOLVED', 'CLOSED'];
    const counts: Record<string, number> = {};
    await Promise.all(
      statuses.map(async (s) => {
        counts[s] = await prisma.ticket.count({ where: { ...where, status: s } });
      })
    );
    return NextResponse.json(counts);
  } catch (error) {
    console.error('Error fetching counts:', error);
    return NextResponse.json({}, { status: 500 });
  }
}
