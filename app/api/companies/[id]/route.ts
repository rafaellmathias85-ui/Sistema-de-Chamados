import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidCPFOrCNPJ, isValidEmail, isValidPhone } from '@/lib/validators';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Obter empresa por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const company = await prisma.company.findUnique({
      where: { id: params.id },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true },
        },
        _count: {
          select: { tickets: true },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Clientes só podem ver sua própria empresa
    if (session.user.role === 'CLIENT' && session.user.companyId !== company.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error('Erro ao obter empresa:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH - Atualizar empresa
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem editar empresas' }, { status: 403 });
    }

    const body = await request.json();
    const { name, cnpj, phone, email, domain, needsAttention } = body;

    const updateData: any = {};

    // Validar nome
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
      }
      const trimmedName = name.trim();
      const existingName = await prisma.company.findFirst({
        where: { 
          name: { equals: trimmedName, mode: 'insensitive' },
          NOT: { id: params.id },
        },
      });
      if (existingName) {
        return NextResponse.json({ error: 'Já existe uma empresa com este nome' }, { status: 400 });
      }
      updateData.name = trimmedName;
    }

    // Validar CPF/CNPJ
    if (cnpj !== undefined) {
      if (cnpj && cnpj.trim()) {
        const docValidation = isValidCPFOrCNPJ(cnpj);
        if (!docValidation.valid) {
          return NextResponse.json({ error: docValidation.message }, { status: 400 });
        }
        const cleanDocument = cnpj.replace(/\D/g, '');
        const existingDoc = await prisma.company.findFirst({
          where: { 
            cnpj: cleanDocument,
            NOT: { id: params.id },
          },
        });
        if (existingDoc) {
          return NextResponse.json({ 
            error: `${docValidation.type} já cadastrado para outra empresa` 
          }, { status: 400 });
        }
        updateData.cnpj = cleanDocument;
      } else {
        updateData.cnpj = null;
      }
    }

    // Validar email
    if (email !== undefined) {
      if (email && email.trim()) {
        if (!isValidEmail(email)) {
          return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
        }
        const existingEmail = await prisma.company.findFirst({
          where: { 
            email: { equals: email.trim(), mode: 'insensitive' },
            NOT: { id: params.id },
          },
        });
        if (existingEmail) {
          return NextResponse.json({ error: 'Email já cadastrado para outra empresa' }, { status: 400 });
        }
        updateData.email = email.trim().toLowerCase();
      } else {
        updateData.email = null;
      }
    }

    // Validar telefone
    if (phone !== undefined) {
      if (phone && phone.trim()) {
        if (!isValidPhone(phone)) {
          return NextResponse.json({ error: 'Telefone inválido. Use formato com DDD (10 ou 11 dígitos)' }, { status: 400 });
        }
        updateData.phone = phone.trim();
      } else {
        updateData.phone = null;
      }
    }

    // Validar domínio
    if (domain !== undefined) {
      if (domain && domain.trim()) {
        const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        
        // Validar formato do domínio
        const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/;
        if (!domainRegex.test(cleanDomain)) {
          return NextResponse.json({ error: 'Domínio inválido. Ex: empresa.com.br' }, { status: 400 });
        }

        // Verificar se domínio já existe em outra empresa
        const existingDomain = await prisma.company.findFirst({
          where: { 
            domain: cleanDomain,
            NOT: { id: params.id },
          },
        });
        if (existingDomain) {
          return NextResponse.json({ error: 'Domínio já cadastrado para outra empresa' }, { status: 400 });
        }
        updateData.domain = cleanDomain;
      } else {
        updateData.domain = null;
      }
    }

    // Atualizar flag needsAttention
    if (needsAttention !== undefined) {
      updateData.needsAttention = needsAttention;
    }

    const company = await prisma.company.update({
      where: { id: params.id },
      data: updateData,
      include: {
        _count: { select: { users: true, tickets: true } },
      },
    });

    return NextResponse.json(company);
  } catch (error) {
    console.error('Erro ao atualizar empresa:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Excluir empresa
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir empresas' }, { status: 403 });
    }

    // Verificar se há tickets associados
    const ticketCount = await prisma.ticket.count({ where: { companyId: params.id } });
    if (ticketCount > 0) {
      return NextResponse.json(
        { error: `Não é possível excluir. Existem ${ticketCount} chamados associados.` },
        { status: 400 }
      );
    }

    // Remover usuários da empresa primeiro
    await prisma.user.updateMany({
      where: { companyId: params.id },
      data: { companyId: null },
    });

    await prisma.company.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir empresa:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
