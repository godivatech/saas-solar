import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Returns the currently active tenantId from the async local context, if set.
 */
export function getActiveTenantId(): string | undefined {
  return tenantContextStorage.getStore()?.tenantId;
}

/**
 * Executes a function within the scope of a specific tenantId.
 * Any storage queries or service operations performed synchronously or
 * asynchronously inside `fn` will resolve `getActiveTenantId()` as `tenantId`.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantContextStorage.run({ tenantId }, fn);
}

