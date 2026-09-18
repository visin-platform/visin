import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Dataset, ImportMapping } from '../../models/Dataset';
import { DatasetItem } from '../../models/DatasetItem';
import { importFolder, markImportFailed, runImport, summarizeItems } from '../../services/importService';
import { NonRetryableImportError } from '../../utils/boundedZip';
import { zip } from '../fixtures/zip';
import { fileStore } from '../fixtures/fileStore';

jest.mock('../../clients/fileServiceClient', () => jest.requireActual('../fixtures/fileStore').fileStore.client);

let mongo: MongoMemoryServer;
let png: Buffer;
let idmap: Buffer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
  await mongoose.connect(mongo.getUri());
  await DatasetItem.syncIndexes();
  png = await sharp({ create: { width: 4, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
  // Pixel values are mask ids — the bytes must survive import untouched.
  idmap = await sharp(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), { raw: { width: 4, height: 2, channels: 1 } }).png().toBuffer();
}, 120_000);

afterEach(async () => {
  jest.restoreAllMocks();
  fileStore.stored.clear();
  await Promise.all([Dataset.deleteMany({}), DatasetItem.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const masks = [{ id: 1, class: 'car', quality: 'good' }];

const createImport = async (entries: { path: string; data: Buffer }[], mapping: ImportMapping = {
  groups: [
    { folder: 'frames', group: 'frames' },
    { folder: 'annotations/verify', group: 'verify' }
  ],
  manifest: 'manifest.csv'
}) => {
  const _id = new mongoose.Types.ObjectId();
  const archiveFileId = `datasets/${_id}/archives/a.zip`;
  fileStore.stored.set(archiveFileId, zip(entries));
  const importId = new mongoose.Types.ObjectId().toString();
  const dataset = await Dataset.create({
    _id,
    ownerId: 'owner',
    name: 'VLM',
    storagePrefix: `datasets/${_id}/`,
    archive: { fileId: archiveFileId, filename: 'a.zip', size: 1, uploadedAt: new Date() },
    import: { id: importId, status: 'queued', mapping, archiveFileId, processed: 0, skipped: 0, errors: [] }
  });
  return { dataset, importId, datasetId: _id.toString() };
};

const vlmEntries = () => [
  { path: 'frames/0001.png', data: png },
  { path: 'annotations/verify/0001.png', data: png },
  { path: 'annotations/verify/0001.ids.png', data: idmap },
  { path: 'annotations/verify/0001.masks.json', data: Buffer.from(JSON.stringify(masks)) },
  { path: 'lidar/0001.bin', data: Buffer.alloc(100) },
  { path: 'manifest.csv', data: Buffer.from('filename,stratum\n0001.png,day\n') }
];

it('stores mapped images and JSON, byte-identical, with groups, variants, manifest and a cover', async () => {
  const { dataset, importId, datasetId } = await createImport(vlmEntries());
  await runImport(datasetId, importId);

  const items = await DatasetItem.find({ datasetId }).sort({ path: 1 }).lean();
  expect(items.map((item) => [item.path, item.group, item.kind, item.stem, item.variant])).toEqual([
    ['annotations/verify/0001.ids.png', 'verify', 'image', '0001', 'ids'],
    ['annotations/verify/0001.masks.json', 'verify', 'json', '0001', 'masks'],
    ['annotations/verify/0001.png', 'verify', 'image', '0001', undefined],
    ['frames/0001.png', 'frames', 'image', '0001', undefined]
  ]);
  const idmapItem = items.find((item) => item.variant === 'ids')!;
  expect(fileStore.stored.get(idmapItem.fileId!)?.equals(idmap)).toBe(true);
  expect(idmapItem.fileId).toBe(`${importFolder(dataset, importId)}annotations/verify/0001.ids.png`);
  expect(fileStore.stored.has(idmapItem.thumbnailFileId!)).toBe(true);
  expect(items.find((item) => item.kind === 'json')?.data).toEqual(masks);
  expect(items.find((item) => item.path === 'frames/0001.png')).toMatchObject({ width: 4, height: 2, mimetype: 'image/png' });

  const updated = await Dataset.findById(datasetId).select('+manifest').lean();
  expect(updated?.import).toMatchObject({ status: 'done', processed: 4, skipped: 0, total: 4, errors: [] });
  // The whole zip was copied to disk before extraction, and the page was told so.
  expect(updated?.import?.copiedBytes).toBe(fileStore.stored.get(dataset.archive!.fileId)!.length);
  expect(updated?.groups).toEqual([{ name: 'frames', images: 1, jsons: 0 }, { name: 'verify', images: 2, jsons: 1 }]);
  expect(updated?.imageCount).toBe(3);
  expect(updated?.coverFileId).toContain('.thumbs/frames/0001.png.jpg');
  expect(updated?.manifest).toEqual([{ stem: '0001', attributes: { stratum: 'day' } }]);
});

it('resumes a retried attempt without storing anything twice', async () => {
  const { importId, datasetId } = await createImport(vlmEntries());
  await runImport(datasetId, importId);
  await Dataset.updateOne({ _id: datasetId }, { $set: { 'import.status': 'running' } });
  fileStore.client.putFile.mockClear();

  await runImport(datasetId, importId);
  expect(fileStore.client.putFile).not.toHaveBeenCalled();
  expect(await DatasetItem.countDocuments({ datasetId })).toBe(4);
  expect((await Dataset.findById(datasetId).lean())?.import).toMatchObject({ status: 'done', processed: 0, skipped: 4 });
});

it('replaces what earlier imports left, folders and migrated files alike', async () => {
  const { dataset, importId, datasetId } = await createImport(vlmEntries(), { groups: [{ folder: 'frames', group: 'camera' }] });
  const oldImport = 'old-import';
  fileStore.stored.set(`${importFolder(dataset, oldImport)}x.png`, png);
  fileStore.stored.set('label-bundles/b/frames/m.png', png);
  await DatasetItem.create([
    { datasetId, importId: oldImport, group: 'g', path: 'x.png', stem: 'x', kind: 'image', size: 1, fileId: `${importFolder(dataset, oldImport)}x.png` },
    { datasetId, group: 'g', path: 'm.png', stem: 'm', kind: 'image', size: 1, fileId: 'label-bundles/b/frames/m.png' }
  ]);

  await runImport(datasetId, importId);
  expect((await DatasetItem.find({ datasetId }).lean()).map((item) => item.path)).toEqual(['frames/0001.png']);
  expect(fileStore.stored.has('label-bundles/b/frames/m.png')).toBe(false);
  expect([...fileStore.stored.keys()].some((key) => key.includes(oldImport))).toBe(false);
});

it('keeps a picked cover the new import stores again, and forgets one it does not', async () => {
  const kept = await createImport(vlmEntries());
  await Dataset.updateOne({ _id: kept.datasetId }, { $set: { coverPath: 'annotations/verify/0001.png' } });
  await runImport(kept.datasetId, kept.importId);
  const withPick = await Dataset.findById(kept.datasetId).lean();
  expect(withPick?.coverPath).toBe('annotations/verify/0001.png');
  expect(withPick?.coverFileId).toContain('.thumbs/annotations/verify/0001.png.jpg');

  const dropped = await createImport(vlmEntries(), { groups: [{ folder: 'frames', group: 'frames' }] });
  await Dataset.updateOne({ _id: dropped.datasetId }, { $set: { coverPath: 'annotations/verify/0001.png' } });
  await runImport(dropped.datasetId, dropped.importId);
  const withoutPick = await Dataset.findById(dropped.datasetId).lean();
  expect(withoutPick?.coverPath).toBeUndefined();
  expect(withoutPick?.coverFileId).toContain('.thumbs/frames/0001.png.jpg');
});

it('reports unreadable files per file, and fails an import that stored nothing', async () => {
  const { importId, datasetId } = await createImport([
    { path: 'frames/broken.png', data: Buffer.from('not an image') },
    { path: 'annotations/verify/bad.json', data: Buffer.from('{') },
    { path: '../escape.png', data: png }
  ]);
  await runImport(datasetId, importId);
  const imported = (await Dataset.findById(datasetId).lean())?.import;
  expect(imported?.status).toBe('failed');
  expect(imported?.errors.map((error) => error.reason).sort()).toEqual(['Not a readable image', 'Not valid JSON', 'Path escapes the archive (zip-slip)']);
});

it('reports an oversized JSON sidecar and a broken manifest', async () => {
  process.env.DATASET_IMPORT_MAX_JSON_BYTES = '4';
  try {
    const { importId, datasetId } = await createImport([
      { path: 'frames/0001.png', data: png },
      { path: 'frames/0001.masks.json', data: Buffer.from('[1,2,3]') },
      { path: 'manifest.csv', data: Buffer.from('nothing,useful\n') }
    ]);
    await runImport(datasetId, importId);
    const imported = (await Dataset.findById(datasetId).lean())?.import;
    expect(imported?.status).toBe('done');
    expect(imported?.errors.map((error) => error.path).sort()).toEqual(['frames/0001.masks.json', 'manifest.csv']);
  } finally {
    delete process.env.DATASET_IMPORT_MAX_JSON_BYTES;
  }
});

it('stops a cancelled import at its next heartbeat and removes what it stored', async () => {
  const { importId, datasetId } = await createImport(vlmEntries());
  let now = Date.now();
  jest.spyOn(Date, 'now').mockImplementation(() => (now += 6000));
  const putFile = fileStore.client.putFile.getMockImplementation()!;
  fileStore.client.putFile.mockImplementation(async (fileId: string, data: Buffer) => {
    await putFile(fileId, data);
    await Dataset.updateOne({ _id: datasetId }, { $set: { 'import.status': 'cancelled' } });
  });
  try {
    await runImport(datasetId, importId);
  } finally {
    fileStore.client.putFile.mockImplementation(putFile);
  }
  expect(await DatasetItem.countDocuments({ datasetId })).toBe(0);
  expect([...fileStore.stored.keys()].some((key) => key.includes('/items/'))).toBe(false);
  expect((await Dataset.findById(datasetId).lean())?.import?.status).toBe('cancelled');
});

it('does nothing for an import cancelled before it started, and refuses one that no longer exists', async () => {
  const { importId, datasetId } = await createImport(vlmEntries());
  await Dataset.updateOne({ _id: datasetId }, { $set: { 'import.status': 'cancelled' } });
  await runImport(datasetId, importId);
  expect(fileStore.client.getFileStream).not.toHaveBeenCalledWith(expect.stringContaining(datasetId));

  await expect(runImport(datasetId, 'another')).rejects.toBeInstanceOf(NonRetryableImportError);
  await expect(runImport(new mongoose.Types.ObjectId().toString(), importId)).rejects.toBeInstanceOf(NonRetryableImportError);
});

it('keeps progress but not the status when an attempt fails transiently', async () => {
  const { importId, datasetId } = await createImport(vlmEntries());
  fileStore.client.putFile.mockRejectedValueOnce(new Error('file-service restarting'));
  await expect(runImport(datasetId, importId)).rejects.toThrow('file-service restarting');
  expect((await Dataset.findById(datasetId).lean())?.import?.status).toBe('running');

  await markImportFailed(datasetId, importId, 'gave up');
  const failed = (await Dataset.findById(datasetId).lean())?.import;
  expect(failed?.status).toBe('failed');
  expect(failed?.errors).toContainEqual({ path: '(zip)', reason: 'gave up' });

  await markImportFailed(datasetId, 'other', 'ignored');
  expect((await Dataset.findById(datasetId).lean())?.import?.errors).toHaveLength(1);
});

it('summarizes an empty dataset', async () => {
  expect(await summarizeItems(new mongoose.Types.ObjectId())).toEqual({ groups: [], imageCount: 0, coverFileId: undefined });
});
