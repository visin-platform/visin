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
  adoptModelLink,
  modelLinkLabel,
  modelLinkSources,
  modelLinkStored,
  modelLinkSummary,
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
const kindsOf = (union: { options: { shape: { kind: { value: string } } }[] }) =>
  union.options.map((option) => option.shape.kind.value).sort();

describe('the source registries', () => {
  it('know every kind the schemas accept, so a new kind cannot be added without saying what it means', () => {
    expect(Object.keys(checkpointSources).sort()).toEqual(kindsOf(checkpointSchema));
    expect(Object.keys(dataSources).sort()).toEqual(kindsOf(suiteDataSchema));
    expect([...CHECKPOINT_KINDS].sort()).toEqual(Object.keys(checkpointSources).sort());
    expect([...SUITE_DATA_KINDS].sort()).toEqual(Object.keys(dataSources).sort());
    expect([...DATASET_SOURCES].sort()).toEqual(Object.keys(datasetSources).sort());
    expect([...STORAGE_PROVIDERS].sort()).toEqual(Object.keys(storageProviders).sort());
    expect([...MODEL_LINK_PROVIDERS].sort()).toEqual(Object.keys(modelLinkSources).sort());
    const providersOf = (union: { options: { shape: { provider: { value: string } } }[] }) =>
      union.options.map((option) => option.shape.provider.value).sort();
    expect(providersOf(projectStorageSchema as never)).toEqual([...STORAGE_PROVIDERS].sort());
    expect(providersOf(modelLinkSchema as never)).toEqual([...MODEL_LINK_PROVIDERS].sort());
    const observed = (
      evidenceSchema.shape.data as unknown as { unwrap(): { options: { shape: { kind: { value: string } } }[] } }
    ).unwrap();
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
    expect(() => requireCheckpointStorage(visin, hub)).toThrow(
      /keeps its files on Visin.*Switch its storage to Hugging Face.*record evaluations of Hub models/
    );
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
    expect(() => requireModelLinkStorage({ storage: { provider: 'visin' } }, link)).toThrow(
      /Switch its storage to Hugging Face.*link Hub models/
    );
    expect(() => requireModelLinkStorage({ storage: { provider: 'hf' } }, link)).not.toThrow();
  });

  describe('a model kept on this deployment', () => {
    const pth = 'b'.repeat(64);
    const link = { provider: 'visin', kind: 'model', fileId: 'models/run/a.pth', format: 'pth', epoch: 99 } as const;

    it('requires the weights digest for ONNX and refuses export-only fields on weights', () => {
      expect(modelLinkSchema.safeParse({ ...link, format: 'onnx' }).success).toBe(false);
      expect(modelLinkSchema.safeParse({ ...link, format: 'onnx', sourceSha256: pth }).success).toBe(true);
      expect(modelLinkSchema.safeParse({ ...link, sourceSha256: pth }).success).toBe(false);
      expect(
        modelLinkSchema.safeParse({ ...link, parity: { frames: 48, maxAbsDiff: 0, argmaxMismatchFraction: 0 } }).success
      ).toBe(false);
      expect(modelLinkSchema.safeParse({ ...link, modelInfo: { comment: '雪'.repeat(23000) } }).success).toBe(false);
    });

    it('is one file per format and epoch, whatever file it is', () => {
      expect(sameModelLink(link, { ...link, fileId: 'models/run/other.pth' })).toBe(true);
      expect(sameModelLink(link, { ...link, format: 'onnx' })).toBe(false);
      expect(sameModelLink(link, { ...link, epoch: 100 })).toBe(false);
      expect(sameModelLink({ ...link, epoch: undefined }, { ...link, epoch: null as unknown as undefined })).toBe(true);
    });

    it('needs no particular project storage, and says which bytes it keeps', () => {
      expect(() => requireModelLinkStorage({ storage: { provider: 'visin' } }, link)).not.toThrow();
      expect(() => requireModelLinkStorage({ storage: { provider: 'hf' } }, link)).not.toThrow();
      expect(modelLinkStored(link)).toEqual({ fileId: 'models/run/a.pth' });
      expect(modelLinkStored({ provider: 'hf', kind: 'model', repo: 'a/b', revision: COMMIT })).toBeUndefined();
    });

    it('is stored as verifying, named for its run', () => {
      expect(adoptModelLink(link, { size: 10, runName: 'ISEAUTO CLFT: Large/RGB' })).toMatchObject({
        size: 10,
        filename: 'ISEAUTO_CLFT_Large_RGB-epoch99.pth',
        status: 'verifying'
      });
      expect(adoptModelLink({ ...link, epoch: undefined, format: 'onnx' }, { size: 1, runName: '///' })).toMatchObject({
        filename: 'model.onnx'
      });
      const hub = { provider: 'hf', kind: 'model', repo: 'a/b', revision: COMMIT } as const;
      expect(adoptModelLink(hub, { size: 10, runName: 'run' })).toBe(hub);
    });

    it('is the .pth’s digest from both formats, and no digest an evaluation could have until it is read', () => {
      expect(modelLinkKey({ ...link, sha256: pth })).toBe(`sha256:${pth}`);
      expect(modelLinkKey({ ...link, format: 'onnx', sha256: 'c'.repeat(64), sourceSha256: pth })).toBe(
        `sha256:${pth}`
      );
      expect(modelLinkKey({ ...link, format: 'onnx', sha256: 'c'.repeat(64) })).toBe('sha256:pending-models/run/a.pth');
      expect(modelLinkKey(link)).toBe('sha256:pending-models/run/a.pth');
    });

    it('is named by its file, and summarised with the start of its digest', () => {
      expect(modelLinkLabel({ ...link, filename: 'run-epoch99.pth' })).toBe('run-epoch99.pth');
      expect(modelLinkLabel(link)).toBe('pth checkpoint');
      expect(modelLinkSummary({ ...link, filename: 'run.pth', sha256: pth })).toBe('run.pth@bbbbbbb');
      expect(modelLinkSummary({ provider: 'hf', kind: 'model', repo: 'Acme/Clft', revision: COMMIT })).toBe(
        'Acme/Clft@3f2a1c9'
      );
    });
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
