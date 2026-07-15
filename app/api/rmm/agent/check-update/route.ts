export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// POST /api/rmm/agent/check-update
// Agente consulta se existe atualização disponível
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hostname, current_version } = body;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !hostname) {
      return NextResponse.json({ error: 'Token e hostname obrigatórios' }, { status: 400 });
    }

    // Validar token da empresa
    const company = await prisma.company.findUnique({
      where: { rmmToken: token },
    });

    if (!company) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost || request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${proto}://${host}`;

    // Verificar se existe manifest V4 publicado
    const v4ManifestPath = path.join(process.cwd(), 'public', 'rmm', 'v4', 'manifest.json');
    if (fs.existsSync(v4ManifestPath)) {
      const v4Manifest = JSON.parse(fs.readFileSync(v4ManifestPath, 'utf-8'));
      const v4Version = v4Manifest.version as string;
      // Agentes V4 (ou superior): verificar se há versão mais nova no manifest
      // Agentes V3: check-update retorna false — migração V3→V4 é feita via patch remoto
      if (current_version && current_version.startsWith('4.')) {
        if (current_version !== v4Version) {
          const agentFile = (v4Manifest.files as any[]).find((f: any) => f.name === 'agente_rmm_v4.ps1');
          if (agentFile) {
            return NextResponse.json({
              update_available: true,
              current_version,
              new_version: v4Version,
              download_url: agentFile.url,
              sha256_hash: agentFile.sha256,
            });
          }
        }
        return NextResponse.json({ update_available: false, current_version: v4Version });
      }
    }

    // Comportamento V3: gerar script personalizado com token injetado
    const templatePath = path.join(process.cwd(), 'public', 'rmm', 'WinnerRMM-AgentV3.ps1');
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ update_available: false });
    }

    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const versionMatch = templateContent.match(/\$AGENT_VERSION\s*=\s*"([^"]+)"/);
    const serverVersion = versionMatch ? versionMatch[1] : '3.0.0';

    // Nunca propor downgrade de major version (segurança extra caso manifest V4 não exista)
    const agentMajor = parseInt((current_version || '0').split('.')[0]) || 0;
    const serverMajor = parseInt(serverVersion.split('.')[0]) || 0;
    if (!current_version || current_version === serverVersion || agentMajor > serverMajor) {
      return NextResponse.json({ update_available: false, current_version: serverVersion });
    }

    const apiUrl = baseUrl + '/api/rmm';
    const personalizedContent = templateContent
      .replace(/\{\{API_URL\}\}/g, apiUrl)
      .replace(/\{\{COMPANY_TOKEN\}\}/g, company.rmmToken!)
      .replace(/\{\{FALLBACK_API_URL\}\}/g, '');

    const sha256 = crypto.createHash('sha256').update(personalizedContent, 'utf-8').digest('hex').toUpperCase();

    return NextResponse.json({
      update_available: true,
      current_version,
      new_version: serverVersion,
      download_url: `${baseUrl}/api/rmm/agent?format=agent_ps1&companyId=${company.id}&token=${company.rmmToken}`,
      sha256_hash: sha256,
    });
  } catch (error) {
    console.error('Check-update error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
