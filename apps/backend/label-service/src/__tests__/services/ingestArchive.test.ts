import { Readable } from 'stream';
import sharp from 'sharp';
import { zip } from '../fixtures/zip';
jest.mock('../../models/ImportJob', () => ({ ImportJob: { findById: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../../models/LabelBundle', () => ({ LabelBundle: { updateOne: jest.fn() } }));
jest.mock('../../models/LabelImage', () => ({ LabelImage: { exists: jest.fn(), create: jest.fn(), updateOne: jest.fn(), countDocuments: jest.fn(), distinct: jest.fn() } }));
jest.mock('../../clients/fileServiceClient', () => ({ getFileStream: jest.fn(), putFile: jest.fn() }));
import { ImportJob } from '../../models/ImportJob';
import { LabelBundle } from '../../models/LabelBundle';
import { LabelImage } from '../../models/LabelImage';
import * as files from '../../clients/fileServiceClient';

let service: typeof import('../../services/ingestService');
const originalLimit = process.env.INGEST_MAX_ENTRY_BYTES;
let job: { bundleId: string; zipFileId: string; status: string; save: jest.Mock; fileErrors: unknown[] };
let png: Buffer;
beforeAll(async () => {
  process.env.INGEST_MAX_ENTRY_BYTES = '1024';
  service = await import('../../services/ingestService');
  png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
});
afterAll(() => { if (originalLimit === undefined) delete process.env.INGEST_MAX_ENTRY_BYTES; else process.env.INGEST_MAX_ENTRY_BYTES = originalLimit; });
beforeEach(() => {
  jest.clearAllMocks();
  job = { bundleId: 'b1', zipFileId: 'zip', status: 'pending', save: jest.fn(), fileErrors: [] };
  (ImportJob.findById as jest.Mock).mockResolvedValue(job);
  (LabelImage.exists as jest.Mock).mockResolvedValue(false);
  (LabelImage.countDocuments as jest.Mock).mockResolvedValue(1);
  (LabelImage.distinct as jest.Mock).mockResolvedValue([]);
});
function source(data: Buffer) {
  const stream = Readable.from((function* () { for (let i = 0; i < data.length; i += 17) yield data.subarray(i, i + 17); })());
  (files.getFileStream as jest.Mock).mockResolvedValue(stream);
  return stream;
}
it('preserves an ordinary image import through real decompression and thumbnail creation', async () => {
  source(zip([{ path: 'frames/a.png', data: png }]));
  await service.runImport('i1');
  expect(job.status).toBe('done');
  expect(files.putFile).toHaveBeenCalledWith('label-bundles/b1/frames/a.png', png);
  expect(LabelImage.create).toHaveBeenCalledWith(expect.objectContaining({ width: 2, height: 2 }));
});
it.each(['frames/huge.png', '__MACOSX/ignored', '../invalid.png', 'directory/'])('aborts a compressed oversized %s before publishing data', async path => {
  const stream = source(zip([{ path, data: Buffer.alloc(64 * 1024), descriptor: true }, { path: 'frames/a.png', data: png }]));
  await expect(service.runImport('i1')).rejects.toBeInstanceOf(service.NonRetryableIngestError);
  expect(stream.destroyed).toBe(true);
  expect(files.putFile).not.toHaveBeenCalled();
  expect(LabelImage.create).not.toHaveBeenCalled();
  expect(LabelBundle.updateOne).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: 'ready' }) }));
});

it('maintains the import heartbeat during download, before extracting any entry', async () => {
  let now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  const data = zip([{ path: 'frames/a.png', data: png }]);
  (files.getFileStream as jest.Mock).mockResolvedValue(Readable.from((async function* () {
    now += 6000;
    yield data.subarray(0, 40);
    now += 6000;
    yield data.subarray(40);
  })()));
  let downloadHeartbeat = false;
  (ImportJob.updateOne as jest.Mock).mockImplementation(async () => {
    if ((files.putFile as jest.Mock).mock.calls.length === 0) downloadHeartbeat = true;
  });
  try {
    await service.runImport('i1');
    expect(downloadHeartbeat).toBe(true);
    expect(job.status).toBe('done');
  } finally {
    clock.mockRestore();
  }
});

it.each([{ paths: Array.from({ length: 1001 }, (_, i) => `${i}.txt`) }, { paths: Array.from({ length: 20 }, (_, i) => `${i}${'x'.repeat(60000)}.txt`) }])('aborts excessive invalid-path diagnostics with a persistable terminal report', async ({ paths }) => {
  source(zip(paths.map(path => ({ path, data: Buffer.alloc(0) }))));
  await expect(service.runImport('i1')).rejects.toThrow('diagnostic limit');
  const { mongo } = await import('mongoose');
  expect(mongo.BSON.calculateObjectSize({ fileErrors: job.fileErrors })).toBeLessThan(2 * 1024 * 1024);
  expect(job.save).toHaveBeenCalled();
  expect(files.putFile).not.toHaveBeenCalled();
});
