import type { Request } from 'express';
import Project from '../models/Project';

export type CredentialKind = 'anonymous' | 'session' | 'api-key' | 'pipeline-key';

export interface Discovery {
  /** the dataset service's public address, when this deployment says what it is */
  datasetApiUrl?: string;
  /** the web app's address, so a client can link to a run */
  appUrl?: string;
  credential: {
    kind: CredentialKind;
    /** what an API key may do; absent for a browser session, which can do what its owner can */
    scopes?: string[];
    /** the one project a pipeline key is limited to */
    project?: { id: string; name: string };
    label?: string;
  };
}

/** Addresses come from this deployment's own settings, never from a built-in default: a self-hosted Visin must not point its users at someone else's. */
const configured = (name: string): string | undefined => process.env[name]?.trim().replace(/\/+$/, '') || undefined;

/**
 * What a client needs to set itself up from one address: the other services' public
 * URLs, and, for the credential it presented, what kind it is and what it can do.
 * `visin login` uses it so a researcher enters one address and one key.
 */
export async function describeDeployment(req: Request): Promise<Discovery> {
  const datasetApiUrl = configured('PUBLIC_DATASET_API_URL');
  const appUrl = configured('PUBLIC_APP_URL');
  const base = { ...(datasetApiUrl ? { datasetApiUrl } : {}), ...(appUrl ? { appUrl } : {}) };
  if (!req.user) return { ...base, credential: { kind: 'anonymous' } };
  if (!req.apiKey) return { ...base, credential: { kind: 'session' } };

  const projectId = req.apiKey.projectId;
  const project = projectId ? await Project.findById(projectId).select('name').lean() : null;
  return {
    ...base,
    credential: {
      kind: projectId ? 'pipeline-key' : 'api-key',
      scopes: [...req.apiKey.scopes],
      label: req.apiKey.label,
      ...(projectId ? { project: { id: projectId, name: project?.name ?? '' } } : {})
    }
  };
}
