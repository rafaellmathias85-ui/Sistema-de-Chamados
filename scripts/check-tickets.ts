import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();
async function main() {
  const t = await prisma.ticket.count();
  const m = await prisma.ticketMessage.count();
  const a = await prisma.ticketAttachment.count();
  const h = await prisma.ticketHistory.count();
  const tr = await prisma.ticketTransferRequest.count();
  const pe = await prisma.processedEmail.count();
  const ap = await prisma.appointment.count();
  console.log(JSON.stringify({ tickets: t, messages: m, attachments: a, history: h, transfers: tr, processedEmails: pe, appointments: ap }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
