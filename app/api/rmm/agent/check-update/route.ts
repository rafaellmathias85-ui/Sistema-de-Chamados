export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/rmm/agent/check-update?token=xxx&current_version=1.0.0&agent_type=ps1&channel=stable
// Chamado pelo agente para verificar se há update disponível
// Autenticação via token da empresa (mesmo do checkin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const currentVersion = searchParams.get('current_version');
    const agentType = searchParams.get('agent_type') || 'ps1';
    const channel = searchParams.get('channel') || 'stable';

    if (!token) {
      return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 });
    }

    // Validar token da empresa
    const company = await prisma.company.findUnique({
      where: { rmmToken: token },
    });
    if (!company) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Buscar versão mais recente ativa para o tipo e canal
    const latestVersion = await prisma.agentVersion.findFirst({
      where: {
        agentType,
        channel,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestVersion) {
      return NextResponse.json({
        update_available: false,
        current_version: currentVersion,
        message: 'Nenhuma versão disponível para este tipo e canal',
      });
    }

    // Comparar versões
    const needsUpdate = currentVersion !== latestVersion.version;

    return NextResponse.json({
      update_available: needsUpdate,
      current_version: currentVersion,
      latest_version: latestVersion.version,
      is_critical: latestVersion.isCritical,
      download_url: latestVersion.downloadUrl,
      file_hash_sha256: latestVersion.fileHashSha256,
      file_size_bytes: latestVersion.fileSizeBytes.toString(),
      changelog: latestVersion.changelog,
      min_os_version: latestVersion.minOsVersion,
    });
  } catch (error) {
    console.error('Error checking agent update:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
