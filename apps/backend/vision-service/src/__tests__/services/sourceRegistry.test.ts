import { checkpointSchema, evidenceSchema } from '../../validation/evaluationSchemas';
import { suiteDataSchema } from '../../validation/suiteSchemas';
import { HUB, hubCheckpointKey } from '../../services/huggingFace';
import { projectStorageSchema, modelLinkSchema } from '../../validation/artifactSchemas';
import {
  checkpointKey,
  CHECKPOINT_KINDS,
  checkpointSources,
  DATASET_SOURCES,
  dataMismatch,
  datasetSources,
  dataSources,
  MODEL_LINK_PROVIDERS,
  modelLinkKey,
  modelLinkLabel,
  modelLinkSources,
  publicCheckpoint,
  publicSuiteData,
  requireCheckpointStorage,
  requireDatasetStorage,
  requireModelLinkStorage,
  requireStorage,
  sameModelLink,
  STORAGE_PROVIDERS,
  storageProviders,
  SUITE_DATA_KINDS
} from '../../services/sourceRegistry';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const kindsOf = (union: { options: { shape: { kind: { value: string } } }[] }) => union.options.map((option) => option.shape.kind.value).sort();

describe('the source registries', () => {
  it('know every kind the schemas accept, so a new kind cannot be added without saying what it means', () => {
    expect(Object.keys(checkpointSources).sort()).toEqual(kindsOf(checkpointSchema));
    expect(Object.keys(dataSources).sort()).toEqual(kindsOf(suiteDataSchema));
    expect([...CHECKPOINT_KINDS].sort()).toEqual(Object.keys(checkpointSources).sort());
    expect([...SUITE_DATA_KINDS].sort()).toEqual(Object.keys(dataSources).sort());
    expect([...DATASET_SOURCES].sort()).toEqual(Object.keys(datasetSources).sort());
    expect([...STORAGE_PROVIDERS].sort()).toEqual(Object.keys(storageProviders).sort());
    expect([...MODEL_LINK_PROVIDERS].sort()).toEqual(Object.keys(modelLinkSources).sort());
    const providersOf = (union: { options: { shape: { provider: { value: string } } }[] }) => union.options.map((option) => option.shape.provider.value).sort();
    expect(providersOf(projectStorageSchema as never)).toEqual([...STORAGE_PROVIDERS].sort());
    expect([modelLinkSchema.shape.provider.value]).toEqual([...MODEL_LINK_PROVIDERS].sort());
    const observed = (evidenceSchema.shape.data as unknown as { unwrap(): { options: { shape: { kind: { value: string } } }[] } }).unwrap();
    expect(kindsOf(observed as never)).toEqual(Object.keys(dataSources).sort());
  });

  it('name the storage and the words for each dataset source that needs one', () => {
    expect(Object.keys(datasetSources).sort()).toEqual(['hf', 'other', 'visin']);
    expect(datasetSources[HUB].needs).toEqual({ storage: HUB, what: 'train on datasets from the Hub' });
    expect(datasetSources.visin.needs).toBeUndefined();
    expect(datasetSources.other.needs).toBeUndefined();
  });
});

describe('checkpoints', () => {
  const hub = { kind: 'hf', repo: 'Acme/Clft', commit: COMMIT, path: 'best.pt' } as const;
  const local = { kind: 'local', sha256: 'a'.repeat(64), label: 'epoch 40' } as const;

  it('are keyed by what makes them the same model', () => {
    expect(checkpointKey(hub)).toBe(`hf:acme/clft@${COMMIT}:best.pt`);
    expect(checkpointKey({ ...hub, repo: 'acme/CLFT', path: undefined })).toBe(`hf:acme/clft@${COMMIT}:`);
    expect(checkpointKey(local)).toBe(`sha256:${'a'.repeat(64)}`);
    expect(hubCheckpointKey(hub)).toBe(checkpointKey(hub));
  });

  it('show a public reader the pin and nothing else', () => {
    expect(publicCheckpoint(hub)).toEqual({ kind: 'hf', repo: 'Acme/Clft', commit: COMMIT, path: 'best.pt' });
    expect(publicCheckpoint({ ...hub, path: undefined })).toEqual({ kind: 'hf', repo: 'Acme/Clft', commit: COMMIT });
    expect(publicCheckpoint(local)).toEqual({ kind: 'local', label: 'epoch 40', sha256: 'a'.repeat(64) });
    expect(publicCheckpoint(undefined)).toBeUndefined();
  });

  it('need the storage their kind needs, and no other kind needs any', () => {
    const visin = { storage: { provider: 'visin' as const } };
    const hf = { storage: { provider: 'hf' as const } };
    expect(() => requireCheckpointStorage(visin, hub)).toThrow(/keeps its files on Visin.*Switch its storage to Hugging Face.*record evaluations of Hub models/);
    expect(() => requireCheckpointStorage(undefined, hub)).toThrow(/keeps its files on Visin/);
    expect(() => requireCheckpointStorage(hf, hub)).not.toThrow();
    expect(() => requireCheckpointStorage(visin, local)).not.toThrow();
    expect(() => requireCheckpointStorage(visin, undefined)).not.toThrow();
  });
});

describe('suite data', () => {
  const hub = { kind: 'hf', repo: 'acme/frames', commit: COMMIT } as const;
  const external = { kind: 'external', label: 'frames', manifestSha256: 'a'.repeat(64) } as const;
  const visin = { kind: 'visin', datasetId: 'd1', archiveSha256: 'b'.repeat(64) } as const;

  it('differ in the field that differs, and a different kind differs in kind', () => {
    expect(dataMismatch(external, { kind: 'external', manifestSha256: 'c'.repeat(64) })).toBe('manifestSha256');
    expect(dataMismatch(external, { kind: 'external', manifestSha256: 'a'.repeat(64) })).toBeUndefined();
    expect(dataMismatch(visin, { kind: 'visin', archiveSha256: 'c'.repeat(64) })).toBe('archiveSha256');
    expect(dataMismatch(hub, { kind: 'hf', repo: 'ACME/frames', commit: COMMIT })).toBeUndefined();
    expect(dataMismatch(hub, { kind: 'hf', repo: 'acme/other', commit: COMMIT })).toBe('repo');
    expect(dataMismatch(hub, { kind: 'hf', repo: 'acme/frames', commit: 'f'.repeat(40) })).toBe('commit');
    expect(dataMismatch(hub, { kind: 'external', manifestSha256: 'a'.repeat(64) })).toBe('kind');
  });

  it('show a public reader the pin, and a Visin dataset only as a kind', () => {
    expect(publicSuiteData(hub)).toEqual({ kind: 'hf', repo: 'acme/frames', commit: COMMIT });
    expect(publicSuiteData(external)).toEqual({ kind: 'external', label: 'frames' });
    expect(publicSuiteData(visin)).toEqual({ kind: 'visin' });
  });
});

describe('storage', () => {
  it('refuses a project whose storage is another provider, naming both', () => {
    expect(() => requireStorage({ storage: { provider: 'hf' } }, 'visin', 'keep it here')).toThrow(
      'This project keeps its files on Hugging Face. Switch its storage to Visin in the project settings to keep it here.'
    );
    expect(() => requireStorage({ storage: { provider: 'hf' } }, 'hf', 'x')).not.toThrow();
  });

  it('keeps a Hub link in step with the checkpoint it stands for, and names it by its repo', () => {
    const link = { provider: 'hf', kind: 'model', repo: 'Acme/Clft', revision: COMMIT, path: 'best.pt' } as const;
    expect(modelLinkKey(link)).toBe(`hf:acme/clft@${COMMIT}:best.pt`);
    expect(modelLinkKey({ ...link, path: undefined })).toBe(`hf:acme/clft@${COMMIT}:`);
    expect(modelLinkLabel(link)).toBe('Acme/Clft');
    expect(sameModelLink(link, { ...link })).toBe(true);
    expect(sameModelLink(link, { ...link, path: undefined })).toBe(false);
    expect(sameModelLink({ ...link, path: undefined }, { ...link, path: null as unknown as undefined })).toBe(true);
    expect(() => requireModelLinkStorage({ storage: { provider: 'visin' } }, link)).toThrow(/Switch its storage to Hugging Face.*link Hub models/);
    expect(() => requireModelLinkStorage({ storage: { provider: 'hf' } }, link)).not.toThrow();
  });

  it('lets a training use a dataset whose source needs nothing, and refuses a Hub one on a Visin project', () => {
    const visin = { storage: { provider: 'visin' as const } };
    expect(() => requireDatasetStorage(visin, { source: 'visin' })).not.toThrow();
    expect(() => requireDatasetStorage(visin, { source: 'other' })).not.toThrow();
    expect(() => requireDatasetStorage(visin, undefined)).not.toThrow();
    expect(() => requireDatasetStorage(visin, { source: 'hf' })).toThrow(/train on datasets from the Hub/);
    expect(() => requireDatasetStorage({ storage: { provider: 'hf' } }, { source: 'hf' })).not.toThrow();
  });
});
