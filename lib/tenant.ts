import { prisma } from '@/lib/db';

/**
 * Obtém o tenant padrão do sistema.
 * Usado em fluxos sem sessão (ex: signup).
 */
export async function getDefaultTenantId(): Promise<string | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { domain: 'winner', isActive: true },
    select: { id: true },
  });
  return tenant?.id || null;
}

/**
 * Adiciona tenantId a um objeto where do Prisma.
 * Mantido para compatibilidade. Prefira usar getSession() que ativa o filtro automático.
 */
export function withTenant(where: Record<string, unknown>, tenantId: string | null) {
  if (tenantId) {
    return { ...where, tenantId };
  }
  return where;
}
