jest.mock('unzipper', () => ({ Parse: jest.fn(() => 'PARSER') }));
jest.mock('../../clients/fileServiceClient', () => ({
  getFileStream: jest.fn(),
}));

import { previewZip, suggestMapping, ZipFolderSummary } from '../../services/previewService';
import * as files from '../../clients/fileServiceClient';

const mockedFiles = files as unknown as Record<string, jest.Mock>;

interface FakeEntry {
  path: string;
  type?: 'File' | 'Directory';
}

const zipStreamFor = (entries: FakeEntry[]): { pipe: jest.Mock } => {
  const iterable = {
    async *[Symbol.asyncIterator]() {
      for (const entry of entries) {
        yield {
          path: entry.path,
          type: entry.type ?? 'File',
          autodrain: () => ({ promise: () => Promise.resolve() }),
        };
      }
    },
  };
  return { pipe: jest.fn(() => iterable) };
};

/** `getFileStream(...).pipe(unzipper.Parse())` → an async-iterable of entries. */
const stubZip = (entries: FakeEntry[]): void => {
  mockedFiles.getFileStream.mockResolvedValue(zipStreamFor(entries));
};

const folder = (overrides: Partial<ZipFolderSummary> & { path: string }): ZipFolderSummary => ({
  files: 0,
  images: 0,
  idMaps: 0,
  maskFiles: 0,
  others: 0,
  samples: [],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('previewZip', () => {
  it('summarizes folders by content and lists manifest candidates', async () => {
    stubZip([
      { path: 'frames/', type: 'Directory' },
      { path: 'frames/0001.jpg' },
      { path: 'frames/0002.jpg' },
      { path: 'annotations/llava/0001.png' },
      { path: 'annotations/llava/0001.ids.png' },
      { path: 'annotations/llava/0001.masks.json' },
      { path: 'notes/readme.txt' },
      { path: 'manifest.csv' },
      { path: '__MACOSX/frames/0001.jpg' },
    ]);

    const preview = await previewZip('label-bundles/b1/upload-1.zip');

    expect(preview.entries).toBe(7);
    expect(preview.truncated).toBe(false);
    expect(preview.folders).toEqual([
      folder({ path: '', files: 1, others: 1, samples: ['manifest.csv'] }),
      folder({
        path: 'annotations/llava',
        files: 3,
        images: 1,
        idMaps: 1,
        maskFiles: 1,
        samples: ['0001.png', '0001.ids.png', '0001.masks.json'],
      }),
      folder({ path: 'frames', files: 2, images: 2, samples: ['0001.jpg', '0002.jpg'] }),
      folder({ path: 'notes', files: 1, others: 1, samples: ['readme.txt'] }),
    ]);
    expect(preview.manifestCandidates).toEqual(['manifest.csv']);
    expect(preview.suggestion).toEqual({
      frames: 'frames',
      annotations: [{ path: 'annotations/llava', set: 'llava' }],
      manifest: 'manifest.csv',
    });
  });

  it('suggests a mapping for a zip that uses its own folder names', async () => {
    stubZip([
      { path: 'run7/img/a.jpg' },
      { path: 'run7/img/b.jpg' },
      { path: 'run7/img/c.jpg' },
      { path: 'run7/seg_sam/a.png' },
      { path: 'run7/seg_sam/a.ids.png' },
      { path: 'run7/selection.jsonl' },
    ]);

    const preview = await previewZip('label-bundles/b1/upload-1.zip');

    expect(preview.suggestion).toEqual({
      frames: 'run7/img',
      annotations: [{ path: 'run7/seg_sam', set: 'seg_sam' }],
      manifest: 'run7/selection.jsonl',
    });
  });

  it('stops listing folders past the cap and flags the preview as truncated', async () => {
    stubZip(Array.from({ length: 210 }, (unused, i) => ({ path: `dir${i}/a.png` })));

    const preview = await previewZip('label-bundles/b1/upload-1.zip');

    expect(preview.entries).toBe(210);
    expect(preview.folders).toHaveLength(200);
    expect(preview.truncated).toBe(true);
  });

  it('throws when the zip has too many entries', async () => {
    const previousLimit = process.env.INGEST_MAX_ENTRIES;
    process.env.INGEST_MAX_ENTRIES = '2';
    jest.resetModules();
    // The cap is read at import time, so the reloaded module needs its own
    // (freshly mocked) file-service client stubbed too.
    const freshFiles = (await import('../../clients/fileServiceClient')) as unknown as Record<string, jest.Mock>;
    freshFiles.getFileStream.mockResolvedValue(
      zipStreamFor([{ path: 'a/1.png' }, { path: 'a/2.png' }, { path: 'a/3.png' }])
    );
    const { previewZip: freshPreviewZip } = await import('../../services/previewService');

    await expect(freshPreviewZip('label-bundles/b1/upload-1.zip')).rejects.toThrow('exceeds 2 entries');

    process.env.INGEST_MAX_ENTRIES = previousLimit;
    jest.resetModules();
  });
});

describe('suggestMapping', () => {
  it('falls back to the default frames folder for a zip with no images', () => {
    expect(suggestMapping([folder({ path: 'docs', files: 1, others: 1 })], [])).toEqual({
      frames: 'frames',
      annotations: [],
    });
  });

  it('treats an id-map-only folder as annotations even when it holds the most images', () => {
    const mapping = suggestMapping(
      [
        folder({ path: 'masks', files: 9, idMaps: 9 }),
        folder({ path: 'pics', files: 4, images: 4 }),
      ],
      []
    );

    expect(mapping).toEqual({ frames: 'pics', annotations: [{ path: 'masks', set: 'masks' }] });
  });

  it('prefers a root-level manifest.csv over other csv files', () => {
    const mapping = suggestMapping([folder({ path: 'frames', files: 1, images: 1 })], [
      'meta/other.csv',
      'manifest.csv',
    ]);

    expect(mapping.manifest).toBe('manifest.csv');
  });

  it('picks the image-heaviest plain folder as frames and sorts the rest as sets', () => {
    const mapping = suggestMapping(
      [
        folder({ path: 'b/extra', files: 2, images: 2 }),
        folder({ path: 'a/main', files: 30, images: 30 }),
        folder({ path: 'a/masks', files: 5, maskFiles: 5 }),
      ],
      []
    );

    expect(mapping).toEqual({
      frames: 'a/main',
      annotations: [
        { path: 'a/masks', set: 'masks' },
        { path: 'b/extra', set: 'extra' },
      ],
    });
  });

  it('picks the only image folder even when it looks like annotations', () => {
    const mapping = suggestMapping([folder({ path: 'ann/setA', files: 2, images: 1, idMaps: 1 })], []);

    expect(mapping).toEqual({ frames: 'ann/setA', annotations: [] });
  });
});
