import { prisma } from '../lib/db';
import { parseEmailBody } from '../lib/email-parser';

async function main() {
  const messages = await prisma.ticketMessage.findMany({
    where: {
      OR: [
        { bodyParseMethod: null },
        { bodyParseMethod: 'raw' },
      ],
    },
    select: { id: true, content: true, contentHtml: true },
  });

  console.log(`Found ${messages.length} messages to reprocess`);
  let updated = 0;

  for (const msg of messages) {
    const body = msg.contentHtml || msg.content || '';
    if (!body.trim()) continue;

    const isHtml = !!msg.contentHtml;
    const parsed = parseEmailBody(body, isHtml);

    await prisma.ticketMessage.update({
      where: { id: msg.id },
      data: {
        bodyClean: parsed.bodyClean,
        bodyQuoted: parsed.bodyQuoted,
        bodyParseMethod: parsed.bodyParseMethod,
      },
    });
    updated++;
  }

  console.log(`Reprocessed ${updated} messages successfully`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
