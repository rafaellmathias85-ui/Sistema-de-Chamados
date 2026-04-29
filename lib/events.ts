import { prisma } from '@/lib/db';

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface EmitEventParams {
  type: string;
  entityType: string;
  entityId: string;
  severity?: EventSeverity;
  actorId?: string;
  actorName?: string;
  metadata?: Record<string, any>;
}

export async function emitEvent(params: EmitEventParams) {
  try {
    await prisma.systemEvent.create({
      data: {
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        severity: params.severity || 'info',
        actorId: params.actorId || undefined,
        actorName: params.actorName || undefined,
        metadata: params.metadata || undefined,
      },
    });
  } catch (err) {
    console.error('emitEvent error:', err);
  }
}
