import { describe, expect, it } from 'vitest';
import { checkpointForms, modelLinkCheckpoints } from '../components/evaluations/checkpointForms';
import { checkpointSources } from '../components/evaluations/sources';
import { storageProviders } from '../components/project/storageProviders';
import { CHECKPOINT_KINDS, MODEL_LINK_PROVIDERS, STORAGE_PROVIDERS } from './providers';

const sorted = (items: readonly string[]) => [...items].sort();

describe('the registries keyed by the lists of kinds', () => {
  it('say how every kind in each list reads, so a kind cannot be added without saying what it means', () => {
    expect(sorted(Object.keys(checkpointSources))).toEqual(sorted(CHECKPOINT_KINDS));
    expect(sorted(Object.keys(checkpointForms))).toEqual(sorted(CHECKPOINT_KINDS));
    expect(sorted(Object.keys(storageProviders))).toEqual(sorted(STORAGE_PROVIDERS));
    expect(sorted(Object.keys(modelLinkCheckpoints))).toEqual(sorted(MODEL_LINK_PROVIDERS));
  });

  it('turn a run\'s model link into the checkpoint form of the kind it stands for', () => {
    const link = { _id: 'l1', provider: 'hf', kind: 'model', repo: 'acme/clft', revision: 'a'.repeat(40), path: 'best.pt', addedAt: '2026-10-01T00:00:00Z' } as const;
    const stands = modelLinkCheckpoints[link.provider];
    expect(stands.checkpoint(link)).toEqual({ kind: 'hf', repo: 'acme/clft', commit: 'a'.repeat(40), path: 'best.pt' });
    expect(checkpointForms[stands.kind].build(stands.answers(link))).toEqual(stands.checkpoint(link));
    expect(stands.checkpoint({ ...link, path: undefined })).not.toHaveProperty('path');
  });
});
