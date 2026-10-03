import { getGlobalConfig } from '../config/ConfigProvider';
import type { ModelReference } from '../types';

const PUBLIC_HUB = 'https://huggingface.co';

/**
 * Where this deployment's Hub is: the public one unless `HF_ENDPOINT` says otherwise, the same
 * setting dataset-service reads, so a mirror or an enterprise Hub is one setting for the whole deployment.
 */
const hubOrigin = (): string => {
  let configured: string | undefined;
  try {
    configured = getGlobalConfig().HF_ENDPOINT;
  } catch {
    // Config not loaded yet (initialization or HMR): the public Hub is the safe reading.
  }
  return (configured?.trim() || PUBLIC_HUB).replace(/\/+$/, '');
};

/**
 * The repo as it stood at the pinned commit, so the link keeps working after the repo moves on.
 * A model that is a file or folder inside the repo opens there: `blob` for a name with an extension, `tree` otherwise.
 */
export const hubModelUrl = (model: Pick<ModelReference, 'repo' | 'revision' | 'path'>): string => {
  const base = `${hubOrigin()}/${model.repo}`;
  if (!model.path) return `${base}/tree/${model.revision}`;
  const inside = model.path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const isFile = /\.[A-Za-z0-9]+$/.test(inside);
  return `${base}/${isFile ? 'blob' : 'tree'}/${model.revision}/${inside}`;
};

/** Git's usual short form of a commit hash. */
export const shortRevision = (revision: string): string => revision.slice(0, 7);

/** A dataset repo at the pinned commit; the Hub keeps datasets under their own path. */
export const hubDatasetUrl = (source: { repo: string; revision: string }): string =>
  `${hubOrigin()}/datasets/${source.repo}/tree/${source.revision}`;

/** A demo Space, where anyone can try a model in the browser. */
export const hubSpaceUrl = (space: string): string => `${hubOrigin()}/spaces/${space}`;

/** `org/name` from what a person pastes: the id itself, or the Space's address. */
export const parseSpace = (text: string): string | null => {
  const id = text.trim().replace(/^https?:\/\/[^/]+\/spaces\//, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(id) ? id : null;
};
