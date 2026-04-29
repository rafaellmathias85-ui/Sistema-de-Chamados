export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST - Agent sends security events
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return NextResponse.json({ error: 'Token obrigatório' }, { status: 401 });

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const body = await request.json();
    const events = Array.isArray(body) ? body : [body];

    const created = [];
    for (const evt of events) {
      if (!evt.machine_id || !evt.event_id) continue;
      // Verify machine belongs to company
      const machine = await prisma.rmmMachine.findFirst({
        where: { id: evt.machine_id, companyId: company.id },
      });
      if (!machine) continue;

      const secEvent = await prisma.securityEvent.create({
        data: {
          machineId: evt.machine_id,
          eventId: parseInt(evt.event_id),
          username: evt.username || null,
          ipAddress: evt.ip_address || null,
          message: evt.message || null,
          raw: evt.raw || null,
          timestamp: evt.timestamp ? new Date(evt.timestamp) : new Date(),
        },
      });
      created.push(secEvent.id);

      // Brute force detection: 5+ failed logins (4625) from same IP in 5 min
      if (parseInt(evt.event_id) === 4625 && evt.ip_address) {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const failCount = await prisma.securityEvent.count({
          where: {
            machineId: evt.machine_id,
            eventId: 4625,
            ipAddress: evt.ip_address,
            timestamp: { gte: fiveMinAgo },
          },
        });
        if (failCount >= 5) {
          // Check if alert already exists for this IP in last 10 min
          const existingAlert = await prisma.securityAlert.findFirst({
            where: {
              machineId: evt.machine_id,
              type: 'BRUTE_FORCE',
              ipAddress: evt.ip_address,
              createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
            },
          });
          if (!existingAlert) {
            await prisma.securityAlert.create({
              data: {
                machineId: evt.machine_id,
                type: 'BRUTE_FORCE',
                severity: 'HIGH',
                description: `Detectadas ${failCount} tentativas de login falhas do IP ${evt.ip_address} nos últimos 5 minutos (usuário: ${evt.username || 'desconhecido'})`,
                ipAddress: evt.ip_address,
              },
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, count: created.length });
  } catch (error) {
    console.error('Security events error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// GET - List security events (frontend)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');
    const eventId = searchParams.get('eventId');
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: any = {};
    if (machineId) where.machineId = machineId;
    if (eventId) where.eventId = parseInt(eventId);

    const events = await prisma.securityEvent.findMany({
      where,
      include: { machine: { select: { hostname: true, ipAddress: true, company: { select: { name: true } } } } },
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 500),
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('Security events GET error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
