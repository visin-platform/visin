jest.mock('../../utils/boundedZip', () => ({ ...jest.requireActual('../../utils/boundedZip'), readZipEntries: jest.fn() }));
jest.mock('sharp', () => {
  const instance = {
    metadata: jest.fn().mockResolvedValue({ width: 64, height: 32 }),
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumb')),
  };
  const factory = jest.fn(() => instance);
  (factory as unknown as { __instance: typeof instance }).__instance = instance;
  return factory;
});
jest.mock('../../models/ImportJob', () => ({
  ImportJob: { findById: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../../models/LabelBundle', () => ({
  LabelBundle: { updateOne: jest.fn() },
}));
jest.mock('../../models/LabelImage', () => ({
  LabelImage: {
    exists: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
  },
}));
jest.mock('../../clients/fileServiceClient', () => ({
  getFileStream: jest.fn(),
  putFile: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import sharp from 'sharp';
import { readZipEntries } from '../../utils/boundedZip';
import { runImport, markImportFailed, bundleFileId, NonRetryableIngestError } from '../../services/ingestService';
import { ImportJob } from '../../models/ImportJob';
import { LabelBundle } from '../../models/LabelBundle';
import { LabelImage } from '../../models/LabelImage';
import * as files from '../../clients/fileServiceClient';

const mockedImport = ImportJob as unknown as Record<string, jest.Mock>;
const mockedBundle = LabelBundle as unknown as Record<string, jest.Mock>;
const mockedImage = LabelImage as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;
const sharpInstance = (sharp as unknown as { __instance: Record<string, jest.Mock> }).__instance;

interface FakeEntry {
  path: string;
  type: 'File' | 'Directory';
  content?: Buffer;
}

const stubZip = (entries: FakeEntry[]) => {
  (readZipEntries as jest.Mock).mockImplementation(async function* () {
    for (const entry of entries) yield { ...entry, data: entry.content ?? Buffer.from('bytes') };
  });
  mockedFiles.getFileStream.mockResolvedValue({});
};

const makeImportJob = (overrides: Record<string, unknown> = {}) => {
  const doc: Record<string, unknown> = {
    _id: 'i1',
    bundleId: { toString: () => 'b1' },
    zipFileId: 'label-bundles/b1/upload-1.zip',
    status: 'pending',
    save: jest.fn(),
    ...overrides,
  };
  return doc;
};

beforeEach(() => {
  jest.clearAllMocks();
  sharpInstance.metadata.mockResolvedValue({ width: 64, height: 32 });
  mockedImage.exists.mockResolvedValue(null);
  mockedImage.create.mockResolvedValue({});
  mockedImage.updateOne.mockResolvedValue({ matchedCount: 1 });
  mockedImage.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
  mockedImage.distinct.mockResolvedValue(['setA']);
  mockedBundle.updateOne.mockResolvedValue({});
  mockedImport.updateOne.mockResolvedValue({});
  mockedFiles.putFile.mockResolvedValue(undefined);
});

describe('bundleFileId', () => {
  it('namespaces files under the bundle', () => {
    expect(bundleFileId('b1', 'frames/a.png')).toBe('label-bundles/b1/frames/a.png');
  });
});

describe('runImport', () => {
  it('ingests frames (with thumbnails), layers, id maps, masks.json, and the manifest', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    stubZip([
      { path: 'frames/', type: 'Directory' },
      { path: 'frames/a.png', type: 'File' },
      { path: 'annotations/setA/a.png', type: 'File' },
      { path: 'annotations/setA/a.ids.png', type: 'File' },
      { path: 'annotations/setA/a.masks.json', type: 'File', content: Buffer.from('[{"id":1,"class":"vehicle"}]') },
      { path: 'manifest.csv', type: 'File', content: Buffer.from('filename,stratum\na.png,v') },
      { path: '__MACOSX/junk', type: 'File' },
    ]);

    await runImport('i1');

    // Frame stored + thumbnail; layer and idmap stored without thumbnails.
    expect(mockedFiles.putFile).toHaveBeenCalledWith('label-bundles/b1/frames/a.png', expect.any(Buffer));
    expect(mockedFiles.putFile).toHaveBeenCalledWith('label-bundles/b1/thumbs/a.jpg', expect.any(Buffer));
    expect(mockedImage.create).toHaveBeenCalledTimes(3);
    expect(mockedImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'frame', stem: 'a', width: 64, height: 32, thumbnailFileId: 'label-bundles/b1/thumbs/a.jpg' })
    );
    expect(mockedImage.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'layer', annotationSet: 'setA' }));
    expect(mockedImage.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'idmap', annotationSet: 'setA' }));

    // masks.json applied to the idmap record.
    expect(mockedImage.updateOne).toHaveBeenCalledWith(
      { bundleId: 'b1', kind: 'idmap', annotationSet: 'setA', stem: 'a' },
      { $set: { 'metadata.masks': [{ id: 1, class: 'vehicle' }] } }
    );

    // Bundle finalized with counts, sets, manifest, ready status.
    expect(mockedBundle.updateOne).toHaveBeenLastCalledWith(
      { _id: 'b1' },
      {
        $set: expect.objectContaining({
          counts: { frames: 1, layers: 2 },
          annotationSets: ['setA'],
          manifest: [{ stem: 'a', stratum: 'v' }],
          status: 'ready',
        }),
      }
    );

    expect(importJob.status).toBe('done');
    expect(importJob.fileErrors).toEqual([]);
    expect(importJob.processed).toBe(5);
    expect(importJob.save).toHaveBeenCalled();
  });

  it('follows the import job mapping instead of the default folder names', async () => {
    const importJob = makeImportJob({
      mapping: {
        frames: 'run7/img',
        annotations: [{ path: 'run7/seg', set: 'sam' }],
        manifest: 'run7/list.csv',
        idsSuffix: '_id.png',
      },
    });
    mockedImport.findById.mockResolvedValue(importJob);
    mockedImage.distinct.mockResolvedValue(['sam']);
    stubZip([
      { path: 'run7/img/a.jpg', type: 'File' },
      { path: 'run7/seg/a_id.png', type: 'File' },
      { path: 'run7/list.csv', type: 'File', content: Buffer.from('filename,stratum\na.jpg,night') },
      { path: 'frames/ignored.png', type: 'File' },
    ]);

    await runImport('i1');

    expect(mockedImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'frame', path: 'run7/img/a.jpg', stem: 'a' })
    );
    expect(mockedImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'idmap', annotationSet: 'sam', stem: 'a' })
    );
    expect(mockedBundle.updateOne).toHaveBeenLastCalledWith(
      { _id: 'b1' },
      { $set: expect.objectContaining({ manifest: [{ stem: 'a', stratum: 'night' }], annotationSets: ['sam'] }) }
    );
    // A file the mapping doesn't cover is reported, not silently dropped.
    expect(importJob.fileErrors).toEqual([
      { path: 'frames/ignored.png', reason: 'Not covered by the import mapping' },
    ]);
  });

  it('reports an unmatched masks.json at its real path under a mapping', async () => {
    const importJob = makeImportJob({
      mapping: { frames: 'img', annotations: [{ path: 'seg', set: 'sam' }], masksSuffix: '_meta.json' },
    });
    mockedImport.findById.mockResolvedValue(importJob);
    mockedImage.updateOne.mockResolvedValue({ matchedCount: 0 });
    stubZip([
      { path: 'img/a.png', type: 'File' },
      { path: 'seg/a_meta.json', type: 'File', content: Buffer.from('[]') },
    ]);

    await runImport('i1');

    expect(importJob.fileErrors).toEqual([
      { path: 'seg/a_meta.json', reason: 'No matching .ids.png in this set' },
    ]);
  });

  it('skips already-ingested files so re-import resumes', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    mockedImage.exists.mockResolvedValue({ _id: 'existing' });
    stubZip([{ path: 'frames/a.png', type: 'File' }]);

    await runImport('i1');

    expect(mockedFiles.putFile).not.toHaveBeenCalled();
    expect(mockedImage.create).not.toHaveBeenCalled();
    expect(importJob.skipped).toBe(1);
    expect(importJob.status).toBe('done');
  });

  it('collects per-file errors without failing the import', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    sharpInstance.metadata.mockRejectedValueOnce(new Error('bad image'));
    stubZip([
      { path: 'frames/broken.png', type: 'File' },
      { path: 'frames/notes/file.txt', type: 'File' },
      { path: 'annotations/setA/bad.masks.json', type: 'File', content: Buffer.from('{"not":"array"}') },
      { path: 'frames/good.png', type: 'File' },
    ]);

    await runImport('i1');

    expect(importJob.status).toBe('done');
    expect(importJob.fileErrors).toEqual([
      { path: 'frames/broken.png', reason: 'Not a readable image' },
      { path: 'frames/notes/file.txt', reason: 'Outside frames/, annotations/<set>/, manifest.*' },
      { path: 'annotations/setA/bad.masks.json', reason: 'masks.json is not a JSON array' },
    ]);
    expect(importJob.processed).toBe(1);
  });

  it('reports a masks.json without a matching idmap', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    mockedImage.updateOne.mockResolvedValue({ matchedCount: 0 });
    stubZip([
      { path: 'frames/a.png', type: 'File' },
      { path: 'annotations/setA/a.masks.json', type: 'File', content: Buffer.from('[]') },
    ]);

    await runImport('i1');

    expect(importJob.fileErrors).toEqual([
      { path: 'annotations/setA/a.masks.json', reason: 'No matching .ids.png in this set' },
    ]);
  });

  it('persists partial progress when reading the archive fails', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    mockedFiles.getFileStream.mockResolvedValue({});
    (readZipEntries as jest.Mock).mockImplementation(async function* () {
      yield { path: 'frames/a.png', type: 'File', data: Buffer.from('bytes') };
      throw new Error('archive read failed');
    });
    await expect(runImport('i1')).rejects.toThrow('archive read failed');
    expect(importJob.processed).toBe(1);
    expect(importJob.fileErrors).toContainEqual({ path: '(zip)', reason: 'archive read failed' });
  });

  it('records and rethrows a fatal error, leaving the verdict to the queue', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    mockedFiles.getFileStream.mockRejectedValue(new Error('zip gone'));

    await expect(runImport('i1')).rejects.toThrow('zip gone');

    expect(importJob.fileErrors).toEqual([{ path: '(zip)', reason: 'zip gone' }]);
    // Still `running`: another attempt may follow, and telling the polling
    // client the import is over would be a lie until the retries are spent.
    expect(importJob.status).toBe('running');
    expect(importJob.finishedAt).toBeUndefined();
    expect(mockedBundle.updateOne).toHaveBeenLastCalledWith({ _id: 'b1' }, { $set: { status: 'importing' } });
  });

  it('rejects invalid limits before downloading the archive', async () => {
    mockedImport.findById.mockResolvedValue(makeImportJob());
    const previous = process.env.INGEST_MAX_ENTRIES;
    process.env.INGEST_MAX_ENTRIES = '0';
    try {
      await expect(runImport('i1')).rejects.toThrow('positive safe integers');
      expect(mockedFiles.getFileStream).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.INGEST_MAX_ENTRIES;
      else process.env.INGEST_MAX_ENTRIES = previous;
    }
  });

  it('fails an import that ingested nothing', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    stubZip([{ path: 'outside.txt', type: 'File' }]);

    await runImport('i1');

    expect(importJob.status).toBe('failed');
  });

  it('bounds cumulative retained mask and manifest input before parsing it', async () => {
    const importJob = makeImportJob();
    mockedImport.findById.mockResolvedValue(importJob);
    stubZip([
      { path: 'manifest.csv', type: 'File', content: Buffer.from('filename,stratum\na.png,v') },
      { path: 'annotations/setA/a.masks.json', type: 'File', content: Buffer.from('[]' + ' '.repeat(8 * 1024 * 1024)) },
    ]);
    await expect(runImport('i1')).rejects.toThrow(NonRetryableIngestError);
    expect(importJob.fileErrors).toContainEqual({ path: '(zip)', reason: expect.stringContaining('metadata exceeds') });
    expect(mockedImage.updateOne).not.toHaveBeenCalled();
  });

  it('throws when the ImportJob does not exist', async () => {
    mockedImport.findById.mockResolvedValue(null);

    await expect(runImport('missing')).rejects.toThrow('not found');
  });
});

describe('markImportFailed', () => {
  it('closes out the import and the bundle', async () => {
    const importJob = makeImportJob({ status: 'running', fileErrors: [] });
    mockedImport.findById.mockResolvedValue(importJob);

    await markImportFailed('i1', 'out of attempts');

    expect(importJob.status).toBe('failed');
    expect(importJob.fileErrors).toContainEqual({ path: '(zip)', reason: 'out of attempts' });
    expect(importJob.finishedAt).toBeInstanceOf(Date);
    expect(importJob.save).toHaveBeenCalled();
    expect(mockedBundle.updateOne).toHaveBeenCalledWith({ _id: { toString: expect.any(Function) } }, { $set: { status: 'failed' } });
  });

  it('is a no-op when the import record is already gone', async () => {
    mockedImport.findById.mockResolvedValue(null);

    await expect(markImportFailed('gone', 'whatever')).resolves.toBeUndefined();
    expect(mockedBundle.updateOne).not.toHaveBeenCalled();
  });
});

describe('NonRetryableIngestError', () => {
  it('is named so BullMQ-side checks can key on it', () => {
    expect(new NonRetryableIngestError('nope').name).toBe('NonRetryableIngestError');
  });
});
