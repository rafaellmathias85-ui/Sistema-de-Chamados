import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidCPFOrCNPJ, isValidEmail, isValidPhone } from '@/lib/validators';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Listar empresas
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Apenas ADMIN e SUPPORT podem listar todas as empresas
    if (session.user.role === 'CLIENT') {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const clientType = searchParams.get('clientType');
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { cnpj: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ];
    }
    if (clientType) {
      where.clientType = clientType;
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { users: true, tickets: true },
          },
        },
      }),
      prisma.company.count({ where }),
    ]);

    return NextResponse.json({
      companies,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Criar empresa
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem criar empresas' }, { status: 403 });
    }

    const body = await request.json();
    const { name, cnpj, phone, email, domain } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Verificar se nome já existe
    const existingName = await prisma.company.findFirst({
      where: { name: { equals: trimmedName, mode: 'insensitive' } },
    });
    if (existingName) {
      return NextResponse.json({ error: 'Já existe uma empresa com este nome' }, { status: 400 });
    }

    // Validar e verificar CPF/CNPJ
    let cleanDocument: string | null = null;
    if (cnpj && cnpj.trim()) {
      const docValidation = isValidCPFOrCNPJ(cnpj);
      if (!docValidation.valid) {
        return NextResponse.json({ error: docValidation.message }, { status: 400 });
      }
      cleanDocument = cnpj.replace(/\D/g, '');
      
      // Verificar se documento já existe
      const existingDoc = await prisma.company.findFirst({
        where: { cnpj: cleanDocument },
      });
      if (existingDoc) {
        return NextResponse.json({ 
          error: `${docValidation.type} já cadastrado para outra empresa` 
        }, { status: 400 });
      }
    }

    // Validar email
    if (email && email.trim()) {
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
      }
      // Verificar se email já existe
      const existingEmail = await prisma.company.findFirst({
        where: { email: { equals: email.trim(), mode: 'insensitive' } },
      });
      if (existingEmail) {
        return NextResponse.json({ error: 'Email já cadastrado para outra empresa' }, { status: 400 });
      }
    }

    // Validar telefone
    if (phone && phone.trim()) {
      if (!isValidPhone(phone)) {
        return NextResponse.json({ error: 'Telefone inválido. Use formato com DDD (10 ou 11 dígitos)' }, { status: 400 });
      }
    }

    // Validar e verificar domínio
    let cleanDomain: string | undefined = undefined;
    if (domain && domain.trim()) {
      const domainValue = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      
      // Validar formato do domínio
      const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/;
      if (!domainRegex.test(domainValue)) {
        return NextResponse.json({ error: 'Domínio inválido. Ex: empresa.com.br' }, { status: 400 });
      }

      // Verificar se domínio já existe
      const existingDomain = await prisma.company.findUnique({
        where: { domain: domainValue },
      });
      if (existingDomain) {
        return NextResponse.json({ error: 'Domínio já cadastrado para outra empresa' }, { status: 400 });
      }
      cleanDomain = domainValue;
    }

    const company = await prisma.company.create({
      data: { 
        name: trimmedName, 
        cnpj: cleanDocument, 
        phone: phone?.trim() || null, 
        email: email?.trim().toLowerCase() || null,
        domain: cleanDomain || null,
        needsAttention: false, // Cadastro manual não precisa de atenção
      },
      include: {
        _count: { select: { users: true, tickets: true } },
      },
    });

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar empresa:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
