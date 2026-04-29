export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import * as XLSX from 'xlsx';

interface ImportRow {
  ticketNumber?: string | number;
  numero?: string | number;
  number?: string | number;
  id?: string | number;

  requester?: string;
  solicitante?: string;
  cliente?: string;
  requestedBy?: string;

  company?: string;
  empresa?: string;

  assignee?: string;
  responsavel?: string;
  agent?: string;

  ticketDate?: string;
  date?: string;
  data?: string;
  createdAt?: string;
  dataAbertura?: string;

  description?: string;
  descricao?: string;
  descricaoInteracoes?: string;
  conteudo?: string;

  status?: string;
  priority?: string;
  prioridade?: string;
  category?: string;
  categoria?: string;
}

function pickField<T>(row: any, keys: string[]): T | undefined {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return row[k];
    }
    // Tenta variacoes case-insensitive
    const allKeys = Object.keys(row);
    const match = allKeys.find((x) => x.toLowerCase().trim() === k.toLowerCase().trim());
    if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== '') {
      return row[match];
    }
  }
  return undefined;
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  // Excel serial number
  if (typeof val === 'number') {
    const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) return jsDate;
  }
  const s = String(val).trim();
  // dd/mm/yyyy ou dd/mm/yyyy HH:MM
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/.exec(s);
  if (br) {
    const d = parseInt(br[1], 10);
    const mo = parseInt(br[2], 10) - 1;
    const y = parseInt(br[3], 10);
    const h = br[4] ? parseInt(br[4], 10) : 0;
    const mi = br[5] ? parseInt(br[5], 10) : 0;
    const result = new Date(y, mo, d, h, mi, 0);
    if (!isNaN(result.getTime())) return result;
  }
  // yyyy-mm-dd (ISO)
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function parseCsv(text: string): any[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delim).map((p) => p.trim().replace(/^"|"$/g, ''));
    const obj: any = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = parts[j] || '';
    }
    rows.push(obj);
  }
  return rows;
}

// POST /api/legacy-tickets/import
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || !['ADMIN', 'SUPPORT'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sourceSystem = (formData.get('sourceSystem') as string) || 'N-ABLE';

    if (!file) {
      return NextResponse.json({ error: 'Arquivo nao fornecido' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let rows: any[] = [];
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        return NextResponse.json({ error: 'Planilha vazia' }, { status: 400 });
      }
      rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false, defval: '' });
    } else if (fileName.endsWith('.json')) {
      const text = buffer.toString('utf-8');
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : (parsed.tickets || parsed.data || []);
    } else if (fileName.endsWith('.csv')) {
      const text = buffer.toString('utf-8');
      rows = parseCsv(text);
    } else {
      return NextResponse.json(
        { error: 'Formato nao suportado. Use xlsx, xls, json ou csv.' },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha encontrada no arquivo' }, { status: 400 });
    }

    const importedBy = session.user.id;
    const importedByName = session.user.name || session.user.email || 'Desconhecido';
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Limite de 5000 para evitar timeouts
    const maxRows = Math.min(rows.length, 5000);

    // Criar lote de importacao
    const batch = await prisma.legacyImportBatch.create({
      data: {
        fileName: file.name,
        sourceSystem,
        totalRows: maxRows,
        importedBy,
        importedByName,
      },
    });

    for (let idx = 0; idx < maxRows; idx++) {
      const row = rows[idx] as any;
      try {
        const tnRaw = pickField(row, ['ticketNumber', 'numero', 'number', 'id', 'Numero', 'Número', 'Ticket', 'Chamado']);
        const requester = String(
          pickField(row, ['requester', 'solicitante', 'cliente', 'requestedBy', 'Solicitante', 'Cliente']) || ''
        ).trim();
        const company = String(
          pickField(row, ['company', 'empresa', 'Empresa', 'Company', 'Cliente']) || ''
        ).trim();
        const assignee = String(
          pickField(row, ['assignee', 'responsavel', 'agent', 'Responsável', 'Responsavel', 'Agente']) || ''
        ).trim() || null;
        const description = String(
          pickField(row, [
            'description',
            'descricao',
            'descricaoInteracoes',
            'conteudo',
            'Descrição',
            'Descricao',
            'Conteudo',
            'Mensagem',
            'Historico',
            'Histórico',
          ]) || ''
        );
        const dateVal = pickField(row, ['ticketDate', 'date', 'data', 'createdAt', 'dataAbertura', 'Data', 'Data Abertura', 'Created']);
        const ticketDate = parseDate(dateVal) || new Date();

        if (!tnRaw || !requester || !company) {
          errors.push(`Linha ${idx + 2}: Campos obrigatorios ausentes (numero, solicitante ou empresa)`);
          skipped++;
          continue;
        }

        const ticketNumber = String(tnRaw).trim();
        const status = String(pickField(row, ['status', 'Status']) || '').trim() || null;
        const priority = String(pickField(row, ['priority', 'prioridade', 'Prioridade']) || '').trim() || null;
        const category = String(pickField(row, ['category', 'categoria', 'Categoria']) || '').trim() || null;

        // Detectar se descricao contem HTML
        const hasHtml = /<[a-z][\s\S]*>/i.test(description);

        const existing = await prisma.legacyTicket.findUnique({
          where: {
            ticketNumber_sourceSystem: {
              ticketNumber,
              sourceSystem,
            },
          },
        });

        if (existing) {
          await prisma.legacyTicket.update({
            where: { id: existing.id },
            data: {
              requester,
              company,
              assignee,
              ticketDate,
              description: hasHtml ? description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : description,
              descriptionHtml: hasHtml ? description : null,
              status,
              priority,
              category,
              rawData: row,
              importedBy,
              // Nao atualiza importBatchId para preservar historico do lote original
            },
          });
          updated++;
        } else {
          await prisma.legacyTicket.create({
            data: {
              ticketNumber,
              requester,
              company,
              assignee,
              ticketDate,
              description: hasHtml ? description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : description,
              descriptionHtml: hasHtml ? description : null,
              status,
              priority,
              category,
              rawData: row,
              sourceSystem,
              importedBy,
              importBatchId: batch.id,
            },
          });
          created++;
        }
      } catch (err: any) {
        errors.push(`Linha ${idx + 2}: ${err?.message || 'Erro desconhecido'}`);
        skipped++;
      }
    }

    // Atualizar estatisticas do lote
    await prisma.legacyImportBatch.update({
      where: { id: batch.id },
      data: { created, updated, skipped },
    });

    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      total: maxRows,
      created,
      updated,
      skipped,
      errors: errors.slice(0, 50), // Limita mensagens de erro
      truncated: rows.length > maxRows,
    });
  } catch (error: any) {
    console.error('Legacy Ticket Import error:', error);
    return NextResponse.json(
      { error: 'Erro ao importar: ' + (error?.message || 'desconhecido') },
      { status: 500 }
    );
  }
}
