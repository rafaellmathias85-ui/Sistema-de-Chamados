export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/rmm/webfilter/check?token=xxx&hostname=xxx&url=xxx
// Agente consulta se URL deve ser bloqueada (tempo real)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const url = searchParams.get('url');

    if (!token || !url) {
      return NextResponse.json({ error: 'token e url obrigatórios' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    // Extrair domínio da URL
    let domain: string;
    try {
      domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    } catch {
      domain = url;
    }

    // Buscar políticas aplicáveis (globais + empresa)
    const policies = await prisma.webFilterPolicy.findMany({
      where: {
        isActive: true,
        OR: [
          { companyId: null },
          { companyId: company.id },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    for (const policy of policies) {
      // 1. Verificar whitelist (domínios liberados)
      if (policy.allowedDomains.some(d => domain.includes(d))) {
        return NextResponse.json({ action: 'allowed', reason: 'domain_whitelist', policy_id: policy.id });
      }

      // 2. Verificar blacklist de domínios
      if (policy.blockedDomains.some(d => domain.includes(d))) {
        return NextResponse.json({
          action: policy.logOnly ? 'warned' : 'blocked',
          reason: 'domain_blacklist',
          policy_id: policy.id,
          message: policy.blockPageMessage,
        });
      }

      // 3. Verificar keywords na URL
      const urlLower = url.toLowerCase();
      const matchedKeyword = policy.blockedKeywords.find(k => urlLower.includes(k.toLowerCase()));
      if (matchedKeyword) {
        return NextResponse.json({
          action: policy.logOnly ? 'warned' : 'blocked',
          reason: 'keyword_match',
          matched_rule: matchedKeyword,
          policy_id: policy.id,
          message: policy.blockPageMessage,
        });
      }

      // 4. Verificar categorias bloqueadas
      if (policy.blockedCategories.length > 0) {
        const domainCategory = await prisma.webFilterCategoryDomain.findFirst({
          where: {
            domain: { in: [domain, domain.replace(/^www\./, '')] },
            categoryId: { in: policy.blockedCategories },
          },
          include: { category: { select: { name: true, slug: true } } },
        });

        if (domainCategory) {
          return NextResponse.json({
            action: policy.logOnly ? 'warned' : 'blocked',
            reason: 'category_blocked',
            category: domainCategory.category?.name,
            policy_id: policy.id,
            message: policy.blockPageMessage,
          });
        }
      }
    }

    // Nenhuma política bloqueou
    return NextResponse.json({ action: 'allowed', reason: 'no_match' });
  } catch (error) {
    console.error('Error checking web filter:', error);
    // Em caso de erro, permitir acesso (fail-open)
    return NextResponse.json({ action: 'allowed', reason: 'error' });
  }
}
