import { prisma } from '@/lib/db';

/**
 * Registra uma ação no log de auditoria de Governance.
 * Usado por todas as rotas que alteram configurações de políticas, web filter, relay, etc.
 */
export async function logGovernanceAction(
  action: string,
  entityType: string,
  entityId: string | null,
  performedById: string | null,
  oldValues?: any,
  newValues?: any,
  ipAddress?: string,
) {
  try {
    await prisma.governanceAuditLog.create({
      data: {
        action,
        entityType,
        entityId,
        performedById,
        oldValues: oldValues || undefined,
        newValues: newValues || undefined,
        ipAddress: ipAddress || null,
      },
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}
