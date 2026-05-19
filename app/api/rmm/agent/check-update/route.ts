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

    // Ler versão atual do template no servidor
    const templatePath = path.join(process.cwd(), 'public', 'rmm', 'WinnerRMM-AgentV3.ps1');
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ update_available: false });
    }

    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const versionMatch = templateContent.match(/\$AGENT_VERSION\s*=\s*"([^"]+)"/);
    const serverVersion = versionMatch ? versionMatch[1] : '3.0.0';

    // Comparar versões
    if (!current_version || current_version === serverVersion) {
      return NextResponse.json({ update_available: false, current_version: serverVersion });
    }

    // Versão diferente — gerar URL de download e hash
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost || request.headers.get('host') || '';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${proto}://${host}`;
    const apiUrl = baseUrl + '/api/rmm';

    // Gerar conteúdo personalizado para a empresa
    const personalizedContent = templateContent
      .replace(/\{\{API_URL\}\}/g, apiUrl)
      .replace(/\{\{COMPANY_TOKEN\}\}/g, company.rmmToken!)
      .replace(/\{\{FALLBACK_API_URL\}\}/g, '');

    const sha256 = crypto.createHash('sha256').update(personalizedContent, 'utf-8').digest('hex').toUpperCase();

    return NextResponse.json({
      update_available: true,
      current_version: current_version,
      new_version: serverVersion,
      download_url: `${baseUrl}/api/rmm/agent?format=agent_ps1&companyId=${company.id}&token=${company.rmmToken}`,
      sha256_hash: sha256,
    });
  } catch (error) {
    console.error('Check-update error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
