import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenError } from '@visin/backend-core';

/**
 * Set only after verifying a user API key limited to one project
 * (`projectKeyAuth`). It confines the request to that project, where the key
 * keeps its owner's real permissions, groups included.
 */
export const projectTokenContext = new AsyncLocalStorage<Readonly<{
  projectId: string;
  userId: string;
}>>();

export const tokenProjectId = (): string | undefined => projectTokenContext.getStore()?.projectId;

export function requireUserCredential(): void {
  if (projectTokenContext.getStore()) {
    throw new ForbiddenError('A credential limited to one project cannot manage projects or credentials');
  }
}
