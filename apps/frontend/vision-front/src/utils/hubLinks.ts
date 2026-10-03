import type { ModelReference } from '../types';

const HUB_URL = 'https://huggingface.co';

/** The repo as it stood at the pinned commit, so the link keeps working after the repo moves on. */
export const hubModelUrl = (model: Pick<ModelReference, 'repo' | 'revision'>): string =>
  `${HUB_URL}/${model.repo}/tree/${model.revision}`;

/** Git's usual short form of a commit hash. */
export const shortRevision = (revision: string): string => revision.slice(0, 7);

/** A dataset repo at the pinned commit; the Hub keeps datasets under their own path. */
export const hubDatasetUrl = (source: { repo: string; revision: string }): string =>
  `${HUB_URL}/datasets/${source.repo}/tree/${source.revision}`;

/** A demo Space, where anyone can try a model in the browser. */
export const hubSpaceUrl = (space: string): string => `${HUB_URL}/spaces/${space}`;

/** `org/name` from what a person pastes: the id itself, or the Space's address. */
export const parseSpace = (text: string): string | null => {
  const id = text.trim().replace(/^https?:\/\/[^/]+\/spaces\//, '').replace(/\/+$/, '');
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(id) ? id : null;
};
