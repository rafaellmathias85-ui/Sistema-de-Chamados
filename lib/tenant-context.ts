import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Retorna o tenantId do contexto de execução atual ou null */
export function getCurrentTenantId(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}

/** Define o tenantId para o contexto de execução atual (request-scoped) */
export function setCurrentTenant(tenantId: string) {
  tenantStorage.enterWith({ tenantId });
}

/** Executa uma função com o tenantId definido no contexto */
export function runWithTenant<T>(tenantId: string | null, fn: () => T): T {
  if (!tenantId) return fn();
  return tenantStorage.run({ tenantId }, fn);
}
