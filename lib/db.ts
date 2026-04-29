import { PrismaClient } from '@prisma/client'
import { getCurrentTenantId } from './tenant-context'

/**
 * Modelos que possuem campo tenantId e devem ser filtrados automaticamente.
 */
const TENANT_MODELS = new Set([
  'Category', 'SLAConfig', 'User', 'Company', 'RmmMachine', 'RmmScript',
  'RmmAlertPolicy', 'Ticket', 'KBCategory', 'KBArticle', 'Appointment',
  'EmailConfig', 'RmmPlaybook', 'SnmpDevice', 'WhatsAppIntegration', 'WhatsAppLog'
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createExtendedClient> | undefined
}

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || ''
  if (url && !url.includes('connection_limit')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}connection_limit=5`
  }
  return url
}

/** Adiciona tenantId ao where clause se contexto de tenant estiver ativo */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectTenantWhere(model: string, args: any) {
  const tid = getCurrentTenantId()
  if (tid && TENANT_MODELS.has(model)) {
    args.where = { ...args.where, tenantId: tid }
  }
  return args
}

/** Adiciona tenantId ao data de criação se contexto de tenant estiver ativo */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectTenantData(model: string, args: any) {
  const tid = getCurrentTenantId()
  if (tid && TENANT_MODELS.has(model)) {
    if (Array.isArray(args.data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args.data = args.data.map((d: any) => ({ ...d, tenantId: tid }))
    } else {
      args.data = { ...args.data, tenantId: tid }
    }
  }
  return args
}

function createExtendedClient() {
  const base = new PrismaClient({
    datasources: { db: { url: getDatabaseUrl() } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  return base.$extends({
    query: {
      $allModels: {
        findMany({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
        findFirst({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
        findFirstOrThrow({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
        count({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
        aggregate({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
        groupBy({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
        create({ model, args, query }) {
          return query(injectTenantData(model, args))
        },
        createMany({ model, args, query }) {
          return query(injectTenantData(model, args))
        },
        createManyAndReturn({ model, args, query }) {
          return query(injectTenantData(model, args))
        },
        updateMany({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
        deleteMany({ model, args, query }) {
          return query(injectTenantWhere(model, args))
        },
      }
    }
  })
}

export const prisma = globalForPrisma.prisma ?? createExtendedClient()

// Cachear o cliente em produção para evitar múltiplas conexões
globalForPrisma.prisma = prisma
