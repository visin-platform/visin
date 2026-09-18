import { Readable } from 'stream';
import { DEFAULT_ZIP_LIMITS, importZipLimits, NonRetryableImportError, readZipEntries, ZipLimits } from '../../utils/boundedZip';
import { zip } from '../fixtures/zip';

const limits: ZipLimits = { entryBytes: 1024, expandedBytes: 2048, inputBytes: 8192, entries: 100, directoryBytes: 8192 };
const entry = (path = 'file', size = 1024) => ({ path, data: Buffer.alloc(size, 65) });
const collect = async (data: Buffer, overrides: Partial<ZipLimits> = {}, shouldRead: (path: string) => boolean = () => true) => {
  const results = [];
  for await (const item of readZipEntries(Readable.from([data]), { ...limits, ...overrides }, shouldRead)) results.push(item);
  return results;
};

it('reads files and skips directories', async () => {
  const results = await collect(zip([entry('a', 10), entry('dir/', 0)]));
  expect(results.map((item) => [item.path, item.data.length])).toEqual([['a', 10]]);
});

it('never decompresses an entry the caller declines, so it cannot hit a limit', async () => {
  const results = await collect(zip([entry('lidar/huge', 64000), entry('frames/a', 10)]), {}, (path) => path.startsWith('frames/'));
  expect(results.map((item) => item.path)).toEqual(['frames/a']);
});

it('rejects an entry over its limit and archives over the expanded, input and entry budgets', async () => {
  await expect(collect(zip([entry('big', 1025)]))).rejects.toBeInstanceOf(NonRetryableImportError);
  await expect(collect(zip([entry('a'), entry('b'), entry('c', 1)]))).rejects.toThrow('expanded data');
  const data = zip([entry()]);
  await expect(collect(data, { inputBytes: data.length - 1 })).rejects.toThrow('Zip input');
  await expect(collect(zip([entry('a', 1), entry('b', 1)]), { entries: 1 })).rejects.toThrow('entries');
  await expect(collect(zip([entry('a', 1)]), { directoryBytes: 10 })).rejects.toThrow('directory');
});

it('rejects dishonest sizes', async () => {
  await expect(collect(zip([{ ...entry('file', 64000), declaredSize: 1, descriptor: true }]))).rejects.toThrow();
});

it('propagates a download failure', async () => {
  const source = new Readable({ read() { this.destroy(new Error('connection reset')); } });
  const iterate = async () => {
    for await (const _ of readZipEntries(source, limits, () => true)) { /* drain */ }
  };
  await expect(iterate()).rejects.toThrow('connection reset');
});

describe('importZipLimits', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('uses defaults and env overrides', () => {
    delete process.env.DATASET_IMPORT_MAX_ENTRIES;
    expect(importZipLimits()).toEqual(DEFAULT_ZIP_LIMITS);
    process.env.DATASET_IMPORT_MAX_ENTRIES = '7';
    expect(importZipLimits().entries).toBe(7);
  });

  it('refuses nonsense', () => {
    process.env.DATASET_IMPORT_MAX_ENTRY_BYTES = '-1';
    expect(() => importZipLimits()).toThrow('DATASET_IMPORT_MAX_ENTRY_BYTES');
  });
});
