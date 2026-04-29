import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { isValidEmail } from '@/lib/validators';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// GET - Obter usuário por ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Clientes só podem ver seu próprio perfil
    if (session.user.role === 'CLIENT' && session.user.id !== params.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        company: { select: { id: true, name: true } },
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH - Atualizar usuário
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Apenas admin pode editar outros, ou o próprio usuário pode editar seu perfil
    if (session.user.role !== 'ADMIN' && session.user.id !== params.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role, companyId, allowedMenus } = body;

    const updateData: any = {};

    // Validar nome
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
      }
      const trimmedName = name.trim();
      const existingName = await prisma.user.findFirst({
        where: { 
          name: { equals: trimmedName, mode: 'insensitive' },
          NOT: { id: params.id },
        },
      });
      if (existingName) {
        return NextResponse.json({ error: 'Já existe um usuário com este nome' }, { status: 400 });
      }
      updateData.name = trimmedName;
    }

    // Validar email
    if (email !== undefined) {
      if (!email || !email.trim()) {
        return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 });
      }
      const trimmedEmail = email.trim().toLowerCase();
      if (!isValidEmail(trimmedEmail)) {
        return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
      }
      const existingEmail = await prisma.user.findFirst({
        where: { 
          email: { equals: trimmedEmail, mode: 'insensitive' },
          NOT: { id: params.id },
        },
      });
      if (existingEmail) {
        return NextResponse.json({ error: 'Email já cadastrado' }, { status: 400 });
      }
      updateData.email = trimmedEmail;
    }

    // Validar senha
    if (password) {
      if (password.length < 6) {
        return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    // Apenas admin pode alterar role e empresa
    if (session.user.role === 'ADMIN') {
      if (role) updateData.role = role;
      if (companyId !== undefined) updateData.companyId = companyId || null;
      // allowedMenus para perfil SPECIAL
      if (allowedMenus !== undefined) {
        updateData.allowedMenus = role === 'SPECIAL' ? (allowedMenus || null) : null;
      }
      if (role && role !== 'SPECIAL') {
        updateData.allowedMenus = null;
      }
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        company: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE - Excluir usuário
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
      return NextResponse.json({ error: 'Apenas administradores podem excluir usuários' }, { status: 403 });
    }

    // Não pode excluir a si mesmo
    if (session.user.id === params.id) {
      return NextResponse.json({ error: 'Não é possível excluir seu próprio usuário' }, { status: 400 });
    }

    // Não pode excluir administradores
    const targetUser = await prisma.user.findUnique({ where: { id: params.id }, select: { role: true } });
    if (targetUser?.role === 'ADMIN') {
      return NextResponse.json({ error: 'Usuários administradores não podem ser excluídos' }, { status: 400 });
    }

    // Verificar se há tickets criados pelo usuário
    const ticketCount = await prisma.ticket.count({ where: { creatorId: params.id } });
    if (ticketCount > 0) {
      return NextResponse.json(
        { error: `Não é possível excluir. Usuário possui ${ticketCount} chamados criados.` },
        { status: 400 }
      );
    }

    await prisma.user.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
