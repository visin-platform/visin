import { ConflictError } from '@visin/backend-core';
import type { IProject } from '../models/Project';

/**
 * A project's storage setting is what makes a pointer to the Hub real: a `visin` project (the
 * default) keeps its data on this deployment's own servers and refuses a run that points anywhere else.
 * `what` completes "Switch its storage to Hugging Face in the project settings to …".
 */
export function requireHubStorage(project: Pick<IProject, 'storage'> | null | undefined, what: string): void {
  if (project?.storage?.provider !== 'hf') {
    throw new ConflictError(`This project keeps its files on Visin. Switch its storage to Hugging Face in the project settings to ${what}.`);
  }
}
