import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('winner_helpdesk')) {
    console.error('[purge-tickets] BLOQUEADO: execução em produção não permitida. Defina NODE_ENV=development explicitamente.');
    process.exit(1);
  }

  console.log('[purge-tickets] Iniciando purga completa de tickets...');

  const pre = {
    tickets: await prisma.ticket.count(),
    messages: await prisma.ticketMessage.count(),
    attachments: await prisma.ticketAttachment.count(),
    history: await prisma.ticketHistory.count(),
    transfers: await prisma.ticketTransferRequest.count(),
    processedEmails: await prisma.processedEmail.count(),
    appointments: await prisma.appointment.count(),
  };
  console.log('[purge-tickets] Antes:', JSON.stringify(pre, null, 2));

  // Nullify referencias de processedEmail antes de deletar tickets
  await prisma.processedEmail.updateMany({
    where: { ticketId: { not: null } },
    data: { ticketId: null },
  });

  // Atualizar referencias em RmmAlert tambem, se houver
  try {
    await prisma.rmmAlert.updateMany({
      where: { ticketId: { not: null } },
      data: { ticketId: null },
    });
  } catch {}

  // Deletar tudo que nao tem cascade
  try { await prisma.ticketMessage.deleteMany({}); } catch {}
  try { await prisma.ticketAttachment.deleteMany({}); } catch {}
  try { await prisma.ticketHistory.deleteMany({}); } catch {}
  try { await prisma.ticketTransferRequest.deleteMany({}); } catch {}
  try { await prisma.appointment.deleteMany({}); } catch {}

  const deleted = await prisma.ticket.deleteMany({});
  console.log(`[purge-tickets] ${deleted.count} tickets deletados`);

  // Deletar processedEmails antigos tambem? Nao, vamos manter para evitar reprocessar

  const post = {
    tickets: await prisma.ticket.count(),
    messages: await prisma.ticketMessage.count(),
    attachments: await prisma.ticketAttachment.count(),
    history: await prisma.ticketHistory.count(),
    transfers: await prisma.ticketTransferRequest.count(),
    processedEmails: await prisma.processedEmail.count(),
    appointments: await prisma.appointment.count(),
  };
  console.log('[purge-tickets] Depois:', JSON.stringify(post, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
