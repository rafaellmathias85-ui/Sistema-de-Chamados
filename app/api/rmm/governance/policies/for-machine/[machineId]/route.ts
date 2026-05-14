export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/rmm/governance/policies/for-machine/[machineId]?token=xxx
// Agente busca todas as políticas aplicáveis (USB, Produtividade, Web Filter)
export async function GET(
  request: NextRequest,
  { params }: { params: { machineId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 });
    }

    // Validar token
    const company = await prisma.company.findUnique({ where: { rmmToken: token } });
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    // Verificar máquina pertence à empresa
    const machine = await prisma.rmmMachine.findUnique({
      where: { id: params.machineId },
      select: { id: true, companyId: true },
    });
    if (!machine || machine.companyId !== company.id) {
      return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 });
    }

    // Buscar políticas USB (globais + da empresa), ordenadas por prioridade
    const usbPolicies = await prisma.usbPolicy.findMany({
      where: {
        isActive: true,
        OR: [
          { companyId: null },  // Globais
          { companyId: company.id },  // Específicas da empresa
        ],
      },
      orderBy: { priority: 'asc' },
    });

    // Buscar políticas de produtividade
    const productivityPolicies = await prisma.productivityPolicy.findMany({
      where: {
        isActive: true,
        OR: [
          { companyId: null },
          { companyId: company.id },
        ],
      },
    });

    // Buscar políticas de web filter
    const webFilterPolicies = await prisma.webFilterPolicy.findMany({
      where: {
        isActive: true,
        OR: [
          { companyId: null },
          { companyId: company.id },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    // Buscar categorias de web filter com domínios
    const webFilterCategories = await prisma.webFilterCategory.findMany({
      include: {
        domains: { select: { domain: true, isRegex: true } },
      },
    });

    return NextResponse.json({
      usb: usbPolicies,
      productivity: productivityPolicies.length > 0 ? productivityPolicies[0] : null,
      webFilter: {
        policies: webFilterPolicies,
        categories: webFilterCategories,
      },
    });
  } catch (error) {
    console.error('Error fetching policies for machine:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
