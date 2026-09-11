import { Readable } from 'stream';
import fs from 'fs/promises';
import { ZipFile } from 'yauzl';
import { DEFAULT_ZIP_LIMITS, ingestZipLimits, NonRetryableIngestError, readZipEntries, ZipLimits } from '../../utils/boundedZip';
import { zip } from '../fixtures/zip';

const limits: ZipLimits = { entryBytes: 1024, expandedBytes: 2048, inputBytes: 8192, entries: 100, directoryBytes: 8192 };
const entry = (path = 'file', size = 1024) => ({ path, data: Buffer.alloc(size, 65) });
const collect = async (data: Buffer, overrides: Partial<ZipLimits> = {}) => {
  const results = [];
  for await (const item of readZipEntries(Readable.from([data]), { ...limits, ...overrides })) results.push(item);
  return results;
};
let temporaryDirectories: string[];
beforeEach(() => {
  temporaryDirectories = [];
  const original = fs.mkdtemp;
  jest.spyOn(fs, 'mkdtemp').mockImplementation((async (...args: Parameters<typeof fs.mkdtemp>) => {
    const directory = await original(...args);
    temporaryDirectories.push(String(directory));
    return directory;
  }) as typeof fs.mkdtemp);
});
afterEach(async () => {
  jest.restoreAllMocks();
  for (const directory of temporaryDirectories) await expect(fs.stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each([false, true])('accepts exact entry and archive budgets (stored=%s)', async stored => {
  const data = zip([{ ...entry(), stored }, { ...entry('directory/'), stored }]);
  const results = await collect(data, { inputBytes: data.length, entries: 2 });
  expect(results.map(item => item.data.length)).toEqual([1024, 1024]);
  expect(results[1].type).toBe('Directory');
});
it.each([false, true])('rejects an actual entry one byte over its limit (stored=%s)', async stored => {
  await expect(collect(zip([{ ...entry('file', 1025), stored }]))).rejects.toBeInstanceOf(NonRetryableIngestError);
});
it('counts expanded bytes across individually allowed files', async () => {
  await expect(collect(zip([entry('ignored'), entry('directory/'), entry('last', 1)]))).rejects.toThrow('expanded data');
});
it('caps compressed input before writing the over-limit chunk', async () => {
  const data = zip([entry()]);
  await expect(collect(data, { inputBytes: data.length - 1 })).rejects.toThrow('Zip input');
});
it('counts directory and ignored entries', async () => {
  await expect(collect(zip([entry('directory/', 0), entry('__MACOSX/a', 0)]), { entries: 1 })).rejects.toThrow('entries');
});
it.each([false, true])('rejects dishonest uncompressed sizes (descriptor=%s)', async descriptor => {
  await expect(collect(zip([{ ...entry('file', 64000), declaredSize: 1, descriptor }]))).rejects.toThrow();
});
it('accepts data descriptors and an empty archive', async () => {
  expect(await collect(zip([{ ...entry(), descriptor: true }]))).toHaveLength(1);
  expect(await collect(zip([]))).toEqual([]);
});
it('decodes Unicode names and leaves invalid path diagnostics to the import classifier', async () => {
  const results = await collect(zip([{ path: '../bad.png', data: Buffer.alloc(0) }, { path: 'frames/õ.png', data: Buffer.alloc(0) }]));
  expect(results.map(item => item.path)).toEqual(['../bad.png', 'frames/õ.png']);
});
it('does not open later entries until the consumer requests them and cleans up on cancellation', async () => {
  const open = jest.spyOn(ZipFile.prototype, 'openReadStreamPromise');
  const source = Readable.from([zip(Array.from({ length: 50 }, (_, index) => entry(String(index), 1)))]);
  const iterator = readZipEntries(source, limits);
  expect((await iterator.next()).value).toMatchObject({ path: '0' });
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(open).toHaveBeenCalledTimes(1);
  await iterator.return(undefined);
  expect(source.destroyed).toBe(true);
});
it('cleans up when the consumer fails', async () => {
  const operation = async () => {
    for await (const item of readZipEntries(Readable.from([zip([entry()])]), limits)) {
      expect(item.path).toBe('file');
      throw new Error('storage unavailable');
    }
  };
  await expect(operation()).rejects.toThrow('storage unavailable');
});
it('propagates a transport failure during download and destroys the source', async () => {
  const source = Readable.from((async function* () {
    yield Buffer.from('PK');
    throw new Error('download interrupted');
  })());
  const operation = async () => { for await (const item of readZipEntries(source, limits)) void item; };
  await expect(operation()).rejects.toThrow('download interrupted');
  expect(source.destroyed).toBe(true);
});
it('handles a download failure before the spool is ready', async () => {
  const source = new Readable({ read() {} });
  const operation = readZipEntries(source, limits).next();
  source.destroy(new Error('early failure'));
  await expect(operation).rejects.toThrow('early failure');
});
it('destroys the source if temporary storage is unavailable', async () => {
  jest.spyOn(fs, 'mkdtemp').mockRejectedValueOnce(new Error('disk unavailable'));
  const source = Readable.from([zip([])]);
  await expect(readZipEntries(source, limits).next()).rejects.toThrow('disk unavailable');
  expect(source.destroyed).toBe(true);
});
it.each([Buffer.alloc(0), Buffer.from('not a zip'), zip([entry()]).subarray(0, 40)])('rejects malformed or truncated archives and cleans up', async data => {
  await expect(collect(data)).rejects.toThrow();
});

describe('configuration', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it('uses fixed defaults without deployment configuration', () => {
    delete process.env.INGEST_MAX_ENTRY_BYTES;
    delete process.env.INGEST_MAX_ENTRIES;
    expect(ingestZipLimits()).toEqual(DEFAULT_ZIP_LIMITS);
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1.5', '9007199254740992'])('rejects invalid existing limits: %s', value => {
    process.env.INGEST_MAX_ENTRY_BYTES = value;
    expect(ingestZipLimits).toThrow('positive safe integers');
    process.env.INGEST_MAX_ENTRY_BYTES = '1024';
    process.env.INGEST_MAX_ENTRIES = value;
    expect(ingestZipLimits).toThrow('positive safe integers');
  });
});

it('bounds retained names independently of empty payloads', async () => {
  const data = zip([entry('a'.repeat(100), 0), entry('b'.repeat(100), 0)]);
  await expect(collect(data, { directoryBytes: 291 })).rejects.toThrow('Zip directory');
  expect(await collect(data, { directoryBytes: 292 })).toHaveLength(2);
});

it('awaits heartbeat failures and cleans up the input', async () => {
  const source = Readable.from([zip([entry()])]);
  const heartbeat = jest.fn().mockRejectedValue(new Error('database unavailable'));
  await expect(readZipEntries(source, limits, heartbeat).next()).rejects.toThrow('database unavailable');
  expect(source.destroyed).toBe(true);
});
