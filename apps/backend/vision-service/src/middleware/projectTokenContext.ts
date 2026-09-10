import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenError } from '@visin/backend-core';

/** Set only by apiTokenMiddleware after verifying a project credential. */
export const projectTokenContext = new AsyncLocalStorage<Readonly<{
  projectId: string;
  userId: string;
}>>();

export const tokenProjectId = (): string | undefined => projectTokenContext.getStore()?.projectId;

export function requireUserCredential(): void {
  if (projectTokenContext.getStore()) {
    throw new ForbiddenError('Project tokens cannot manage projects or credentials');
  }
}
