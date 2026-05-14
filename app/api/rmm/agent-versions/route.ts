export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET /api/rmm/agent-versions — Listar versões publicadas do agente
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const agentType = searchParams.get('agentType');
    const channel = searchParams.get('channel');
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const where: any = {};
    if (agentType) where.agentType = agentType;
    if (channel) where.channel = channel;
    if (activeOnly) where.isActive = true;

    const versions = await prisma.agentVersion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { updateHistory: true } },
      },
    });

    // BigInt serialization
    const safe = versions.map((v: any) => ({
      ...v,
      fileSizeBytes: v.fileSizeBytes.toString(),
    }));

    return NextResponse.json(safe);
  } catch (error) {
    console.error('Error listing agent versions:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/agent-versions — Publicar nova versão do agente
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body = await request.json();
    const {
      version, agentType, channel, fileHashSha256, fileSizeBytes,
      downloadUrl, changelog, minOsVersion, isCritical,
    } = body;

    if (!version || !agentType || !fileHashSha256 || !fileSizeBytes || !downloadUrl) {
      return NextResponse.json({ error: 'Campos obrigatórios: version, agentType, fileHashSha256, fileSizeBytes, downloadUrl' }, { status: 400 });
    }

    if (!['ps1', 'msi'].includes(agentType)) {
      return NextResponse.json({ error: 'agentType deve ser ps1 ou msi' }, { status: 400 });
    }

    const created = await prisma.agentVersion.create({
      data: {
        version,
        agentType,
        channel: channel || 'stable',
        fileHashSha256,
        fileSizeBytes: BigInt(fileSizeBytes),
        downloadUrl,
        changelog: changelog || null,
        minOsVersion: minOsVersion || null,
        isCritical: isCritical || false,
        createdById: session.user.id,
        tenantId: session.user.tenantId || null,
      },
    });

    return NextResponse.json({
      ...created,
      fileSizeBytes: created.fileSizeBytes.toString(),
    }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Versão já existe para esse tipo e canal' }, { status: 409 });
    }
    console.error('Error creating agent version:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
