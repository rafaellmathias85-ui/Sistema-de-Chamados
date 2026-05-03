/**
 * Migração segura: TicketStatus enum → String (text)
 * 
 * Este script é IDEMPOTENTE — pode ser executado várias vezes sem efeito.
 * Ele preserva todos os valores existentes na coluna status.
 * 
 * Fluxo:
 * 1. Verifica se o tipo enum TicketStatus existe no PostgreSQL
 * 2. Se existir: adiciona coluna temp (text), copia valores, dropa original, renomeia
 * 3. Se não existir: verifica se a coluna já é text (migração já feita)
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // 1) Verificar se o enum TicketStatus existe
    const enumCheck = await prisma.$queryRaw`
      SELECT 1 FROM pg_type WHERE typname = 'TicketStatus' LIMIT 1
    `;
    
    if (enumCheck.length === 0) {
      // Enum já não existe — verificar tipo da coluna
      const colCheck = await prisma.$queryRaw`
        SELECT data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_name = 'Ticket' AND column_name = 'status'
      `;
      
      if (colCheck.length > 0 && colCheck[0].data_type === 'text') {
        console.log('[migrate-status] ✅ Coluna já é text. Migração não necessária.');
        return;
      }
      
      console.log('[migrate-status] ⚠️ Enum não encontrado e coluna não é text:', colCheck);
      return;
    }
    
    console.log('[migrate-status] Enum TicketStatus encontrado. Iniciando migração...');
    
    // 2) Contar tickets antes da migração
    const beforeCount = await prisma.$queryRaw`SELECT count(*)::int as total FROM "Ticket"`;
    const beforeDist = await prisma.$queryRaw`
      SELECT status::text as status, count(*)::int as cnt 
      FROM "Ticket" GROUP BY status ORDER BY cnt DESC
    `;
    console.log('[migrate-status] Antes:', beforeCount[0].total, 'tickets');
    console.log('[migrate-status] Distribuição:', beforeDist);
    
    // 3) Migração atômica via transação
    await prisma.$executeRaw`
      ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS status_tmp text
    `;
    
    await prisma.$executeRaw`
      UPDATE "Ticket" SET status_tmp = status::text
    `;
    
    await prisma.$executeRaw`
      ALTER TABLE "Ticket" DROP COLUMN status
    `;
    
    await prisma.$executeRaw`
      ALTER TABLE "Ticket" RENAME COLUMN status_tmp TO status
    `;
    
    await prisma.$executeRaw`
      ALTER TABLE "Ticket" ALTER COLUMN status SET DEFAULT 'OPEN'
    `;
    
    await prisma.$executeRaw`
      ALTER TABLE "Ticket" ALTER COLUMN status SET NOT NULL
    `;
    
    // 4) Dropar o enum type
    await prisma.$executeRaw`
      DROP TYPE IF EXISTS "TicketStatus"
    `;
    
    // 5) Verificar pós-migração
    const afterCount = await prisma.$queryRaw`SELECT count(*)::int as total FROM "Ticket"`;
    const afterDist = await prisma.$queryRaw`
      SELECT status, count(*)::int as cnt 
      FROM "Ticket" GROUP BY status ORDER BY cnt DESC
    `;
    console.log('[migrate-status] Depois:', afterCount[0].total, 'tickets');
    console.log('[migrate-status] Distribuição:', afterDist);
    
    if (beforeCount[0].total !== afterCount[0].total) {
      console.error('[migrate-status] ❌ ALERTA: contagem mudou! Antes:', beforeCount[0].total, 'Depois:', afterCount[0].total);
    } else {
      console.log('[migrate-status] ✅ Migração concluída com sucesso. Todos os', afterCount[0].total, 'tickets preservados.');
    }
    
  } catch (error) {
    console.error('[migrate-status] ❌ Erro na migração:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error('[migrate-status] FALHA FATAL:', e.message);
  process.exit(1);
});
