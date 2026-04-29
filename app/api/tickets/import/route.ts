import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import * as XLSX from 'xlsx';
import { getDefaultTenantId } from '@/lib/tenant';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

const statusMap: Record<string, string> = {
  aberto: 'OPEN',
  'em andamento': 'IN_PROGRESS',
  andamento: 'IN_PROGRESS',
  'com parceiro': 'IN_PARTNER',
  parceiro: 'IN_PARTNER',
  pausado: 'PAUSED',
  'aguardando cliente': 'AWAITING_CLIENT',
  'aguard. cliente': 'AWAITING_CLIENT',
  cliente: 'AWAITING_CLIENT',
  resolvido: 'RESOLVED',
  fechado: 'CLOSED',
  OPEN: 'OPEN', IN_PROGRESS: 'IN_PROGRESS', IN_PARTNER: 'IN_PARTNER',
  PAUSED: 'PAUSED', AWAITING_CLIENT: 'AWAITING_CLIENT', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED',
};

const priorityMap: Record<string, string> = {
  baixa: 'LOW', 'm\u00e9dia': 'MEDIUM', media: 'MEDIUM', alta: 'HIGH', 'cr\u00edtica': 'CRITICAL', critica: 'CRITICAL',
  LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL',
};

function normalizeStatus(v: string): string {
  if (!v) return 'OPEN';
  return statusMap[v.toString().trim().toLowerCase()] || statusMap[v.toString().trim()] || 'OPEN';
}
function normalizePriority(v: string): string {
  if (!v) return 'MEDIUM';
  return priorityMap[v.toString().trim().toLowerCase()] || priorityMap[v.toString().trim()] || 'MEDIUM';
}

// Normaliza chaves do objeto: minusculas, sem acento, sem espaco
function k(obj: any, ...keys: string[]): any {
  const norm: any = {};
  for (const key of Object.keys(obj || {})) {
    norm[key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '')] = obj[key];
  }
  for (const q of keys) {
    const nk = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    if (norm[nk] !== undefined && norm[nk] !== null && norm[nk] !== '') return norm[nk];
  }
  return undefined;
}

function parseCSV(text: string): any[] {
  // Remove BOM
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else current += c;
    }
    result.push(current);
    return result;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

function slugCompanyFromDomain(domain: string | null | undefined): string {
  if (!domain) return 'Empresa';
  return domain.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function upsertCompany(name: string, domain?: string | null): Promise<string> {
  const tenantId = await getDefaultTenantId();
  let company = null;
  if (domain) {
    company = await prisma.company.findUnique({ where: { domain } });
  }
  if (!company) {
    company = await prisma.company.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  }
  if (!company) {
    company = await prisma.company.create({
      data: { name: name || (domain ? slugCompanyFromDomain(domain) : 'Empresa Sem Nome'), domain: domain || null, tenantId, needsAttention: !domain || !name },
    });
  } else if (domain && !company.domain) {
    try {
      company = await prisma.company.update({ where: { id: company.id }, data: { domain } });
    } catch {
      // se nao puder atualizar por conflito, ignora
    }
  }
  return company.id;
}

async function upsertUser(email: string, name: string, companyId: string, role: 'CLIENT' | 'SUPPORT' | 'ADMIN' = 'CLIENT'): Promise<string> {
  const normalized = (email || '').toLowerCase().trim();
  if (!normalized) throw new Error('E-mail vazio');
  let user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    // cria sem senha utilizavel - apenas referencia
    const hashed = await bcrypt.hash(Math.random().toString(36).slice(2) + Date.now(), 10);
    user = await prisma.user.create({
      data: { email: normalized, name: name || normalized, password: hashed, role, companyId },
    });
  } else if (!user.companyId && companyId) {
    user = await prisma.user.update({ where: { id: user.id }, data: { companyId } });
  }
  return user.id;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role as string)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const name = (file.name || '').toLowerCase();
    let rows: any[] = [];

    try {
      if (name.endsWith('.json')) {
        rows = JSON.parse(buf.toString('utf-8'));
        if (!Array.isArray(rows)) return NextResponse.json({ error: 'JSON deve ser um array' }, { status: 400 });
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const wb = XLSX.read(buf, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } else {
        // CSV default
        rows = parseCSV(buf.toString('utf-8'));
      }
    } catch (parseErr: any) {
      return NextResponse.json({ error: 'Falha ao parsear arquivo: ' + parseErr.message }, { status: 400 });
    }

    if (!rows.length) return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 });

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (const [idx, raw] of rows.entries()) {
      try {
        const number = k(raw, 'numero', 'n\u00famero', 'number', 'id');
        const subject = k(raw, 'assunto', 'subject', 'titulo', 't\u00edtulo');
        const description = k(raw, 'descricao', 'descri\u00e7\u00e3o', 'description') || '';
        const statusRaw = k(raw, 'status');
        const priorityRaw = k(raw, 'prioridade', 'priority');
        const empresaName = k(raw, 'empresa', 'company', 'companyName') || '';
        const empresaDominio = k(raw, 'empresadominio', 'empresaDomain', 'companyDomain', 'dominio') || '';
        const solicitanteName = k(raw, 'solicitante', 'creatorName', 'requesterName') || '';
        const solicitanteEmail = (k(raw, 'solicitanteemail', 'creatorEmail', 'requesterEmail', 'email') || '').toString().toLowerCase().trim();
        const responsavelName = k(raw, 'responsavel', 'respons\u00e1vel', 'assigneeName') || '';
        const responsavelEmail = (k(raw, 'responsavelemail', 'assigneeEmail') || '').toString().toLowerCase().trim();

        if (!subject) {
          results.skipped++;
          results.errors.push(`Linha ${idx + 2}: assunto vazio, ignorada`);
          continue;
        }
        if (!solicitanteEmail) {
          results.skipped++;
          results.errors.push(`Linha ${idx + 2}: email do solicitante ausente, ignorada`);
          continue;
        }

        // Upsert empresa
        const domainFromEmail = solicitanteEmail.split('@')[1] || '';
        const domain = (empresaDominio || domainFromEmail).toLowerCase().trim() || null;
        const companyName = empresaName || slugCompanyFromDomain(domain);
        const companyId = await upsertCompany(companyName, domain);

        // Upsert solicitante
        const creatorId = await upsertUser(solicitanteEmail, solicitanteName, companyId, 'CLIENT');

        // Upsert responsavel (opcional)
        let assigneeId: string | null = null;
        if (responsavelEmail) {
          try {
            assigneeId = await upsertUser(responsavelEmail, responsavelName, companyId, 'SUPPORT');
          } catch {}
        }

        const status = normalizeStatus(statusRaw);
        const priority = normalizePriority(priorityRaw);

        const ticketData: any = {
          subject: String(subject).slice(0, 500),
          description: String(description).slice(0, 10000) || String(subject),
          status: status as any,
          priority: priority as any,
          creatorId,
          assigneeId,
          companyId,
          source: 'import',
        };

        if (number) {
          // Se veio um numero, tenta atualizar
          const num = parseInt(String(number).replace(/\D/g, ''));
          if (!isNaN(num) && num > 0) {
            const existing = await prisma.ticket.findUnique({ where: { number: num } });
            if (existing) {
              await prisma.ticket.update({ where: { id: existing.id }, data: ticketData });
              results.updated++;
              continue;
            }
          }
        }
        await prisma.ticket.create({ data: ticketData });
        results.created++;
      } catch (err: any) {
        results.errors.push(`Linha ${idx + 2}: ${err.message || 'erro desconhecido'}`);
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('[tickets/import] erro:', error);
    return NextResponse.json({ error: error.message || 'Erro na importa\u00e7\u00e3o' }, { status: 500 });
  }
}
