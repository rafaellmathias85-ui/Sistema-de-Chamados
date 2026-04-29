export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request?.json?.().catch(() => ({}));
    const { name, email, phone, company, subject, message } = body ?? {};

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Nome, e-mail e mensagem são obrigatórios.' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex?.test?.(email ?? '')) {
      return NextResponse.json(
        { error: 'Formato de e-mail inválido.' },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.create({
      data: {
        name: String(name ?? ''),
        email: String(email ?? ''),
        phone: String(phone ?? ''),
        company: String(company ?? ''),
        subject: String(subject ?? ''),
        message: String(message ?? ''),
      },
    });

    return NextResponse.json(
      { success: true, id: contact?.id },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor. Tente novamente.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Contact API is working' });
}
