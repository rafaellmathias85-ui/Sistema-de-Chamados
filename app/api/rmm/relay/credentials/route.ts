export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import crypto from 'crypto';

// Chave de criptografia (AES-256) — usa ENCRYPTION_KEY do .env ou gera da database URL
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL?.slice(0, 32) || '0'.repeat(32);
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = parts.join(':');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// GET /api/rmm/relay/credentials?companyId=
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    const where: any = {};
    if (companyId) where.companyId = companyId;

    const credentials = await prisma.relayCredential.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true } } },
    });

    // NÃO retornar senhas — apenas metadados
    const safe = credentials.map(c => ({
      id: c.id,
      companyId: c.companyId,
      company: c.company,
      name: c.name,
      username: c.username,
      domain: c.domain,
      credentialType: c.credentialType,
      isActive: c.isActive,
      lastUsedAt: c.lastUsedAt,
      createdAt: c.createdAt,
    }));

    return NextResponse.json(safe);
  } catch (error) {
    console.error('Error listing relay credentials:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST /api/rmm/relay/credentials — Criar credencial (senha criptografada AES-256)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { companyId, name, username, password, domain, credentialType } = await request.json();

    if (!companyId || !name || !username || !password) {
      return NextResponse.json({ error: 'companyId, name, username e password obrigatórios' }, { status: 400 });
    }

    const encryptedPassword = encrypt(password);

    const credential = await prisma.relayCredential.create({
      data: {
        companyId,
        name,
        username,
        encryptedPassword,
        domain: domain || null,
        credentialType: credentialType || 'windows',
        createdById: session.user.id,
        tenantId: session.user.tenantId || null,
      },
    });

    return NextResponse.json({
      id: credential.id,
      name: credential.name,
      username: credential.username,
      credentialType: credential.credentialType,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating relay credential:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// DELETE /api/rmm/relay/credentials?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    await prisma.relayCredential.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting relay credential:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
