import { beforeEach, describe, expect, it, vi } from 'vitest';

const origins = vi.hoisted(() => ({ vision: 'https://vision-api.example.test', dataset: 'https://dataset-api.example.test' as string | undefined }));
vi.mock('../config/visionApi', () => ({ visionApiOrigin: () => origins.vision }));
vi.mock('../config/datasetApi', () => ({ datasetApiOrigin: () => origins.dataset }));

import { datasetSnippets, runSnippets } from './useSnippets';

describe('runSnippets', () => {
  it('reads the run back by its uuid, with this deployment’s address and no real key', () => {
    const [setup, load] = runSnippets({ uuid: 'run-uuid-1', name: 'CLFTv2 on ZOD' });
    expect(setup.code).toContain('export VISIN_URL=https://vision-api.example.test');
    expect(setup.code).toContain("export VISIN_TOKEN='<an API key from Account → API keys>'");
    expect(setup.code).toContain("pip install 'visin[pandas]'");
    expect(load.title).toBe('Load CLFTv2 on ZOD');
    expect(load.code).toContain('api.training("run-uuid-1")');
    expect(load.code).toContain('api.summary(run)');
    expect(load.code).toContain('api.epochs_frame(run)');
    expect(load.note).toMatch(/last epoch is not its result/);
  });

  it('quotes deployment URLs and custom run identifiers in copied code', () => {
    origins.vision = "https://example.test/path's space?x=1&y=2";
    try {
      const [setup, load] = runSnippets({ uuid: 'run-"1\\2', name: 'Run' });
      expect(setup.code).toContain("export VISIN_URL='https://example.test/path'\\''s space?x=1&y=2'");
      expect(load.code).toContain('api.training("run-\\"1\\\\2")');
    } finally {
      origins.vision = 'https://vision-api.example.test';
    }
  });
});

describe('datasetSnippets', () => {
  beforeEach(() => {
    origins.dataset = 'https://dataset-api.example.test';
  });

  it('downloads the dataset by id, from the CLI, Python and a visin-fusion config', () => {
    const snippets = datasetSnippets({ _id: 'd1', name: 'ZOD' });
    const code = snippets.map((snippet) => snippet.code).join('\n');
    expect(code).toContain('export VISIN_DATASET_URL=https://dataset-api.example.test');
    expect(code).toContain('visin download d1');
    expect(code).toContain('datasets.download("d1")');
    expect(code).toContain('"dataset_root": "visin:d1"');
    expect(snippets[0].code).toContain('pip install visin');
    expect(snippets[0].code).not.toContain('visin[hf]');
    expect(snippets[0].note).toMatch(/private dataset/);
    expect(snippets[0].code).toContain("export VISIN_TOKEN='<an API key from Account → API keys>'");
  });

  it('asks for the Hub extra when the dataset lives on the Hub', () => {
    const [setup] = datasetSnippets({ _id: 'd1', name: 'ZOD', source: { provider: 'hf', repo: 'acme/zod', revision: 'a'.repeat(40) } });
    expect(setup.code).toContain("pip install 'visin[hf]'");
    expect(setup.note).toMatch(/Hugging Face Hub.*pinned commit/);
  });

  it('leaves the address out rather than inventing one when none is configured', () => {
    origins.dataset = undefined;
    const [setup] = datasetSnippets({ _id: 'd1', name: 'ZOD' });
    expect(setup.code).not.toContain('VISIN_DATASET_URL');
  });
});
