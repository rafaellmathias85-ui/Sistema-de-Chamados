import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getDefaultTenantId } from '@/lib/tenant';
import bcrypt from 'bcryptjs';


export async function POST(request: NextRequest) {
  try {
    const { email, password, name, companyName } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, senha e nome são obrigatórios' },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Usuário já existe' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const tenantId = await getDefaultTenantId();

    // Criar empresa se informada
    let company = null;
    if (companyName) {
      company = await prisma.company.create({
        data: { name: companyName, tenantId },
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'CLIENT',
        companyId: company?.id,
        tenantId,
      },
    });

    return NextResponse.json(
      { message: 'Usuário criado com sucesso', userId: user.id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Erro ao criar usuário' },
      { status: 500 }
    );
  }
}
