import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { crc32 } from '../../utils/crc32';
import { openZip, ZIP_LIMITS, ZipWriter } from '../../utils/zip';

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'zip-test-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const writeZip = async (entries: [string, Buffer | string][]): Promise<string> => {
  const path = join(folder, 'a.zip');
  const out = createWriteStream(path);
  const writer = new ZipWriter(out);
  for (const [name, data] of entries) await writer.add(name, data);
  await writer.finish();
  await new Promise<void>((resolve) => out.end(resolve));
  return path;
};

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('ZipWriter and openZip', () => {
  it('round-trips text, binary and unicode names, deflating only what shrinks', async () => {
    const text = 'label '.repeat(500);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const path = await writeZip([
      ['labels/0001.txt', text],
      ['masks/0001.png', png],
      ['notes/köln.txt', 'hi'],
      ['empty.txt', '']
    ]);

    const archive = await openZip(path);
    try {
      expect(archive.entries.map((entry) => entry.name)).toEqual(['labels/0001.txt', 'masks/0001.png', 'notes/köln.txt', 'empty.txt']);
      const byName = new Map(archive.entries.map((entry) => [entry.name, entry]));
      expect(byName.get('labels/0001.txt')!.method).toBe(8);
      expect(byName.get('masks/0001.png')!.method).toBe(0);
      expect((await archive.read(byName.get('labels/0001.txt')!)).toString()).toBe(text);
      expect(Array.from(await archive.read(byName.get('masks/0001.png')!))).toEqual(Array.from(png));
      expect((await archive.read(byName.get('notes/köln.txt')!)).toString()).toBe('hi');
      expect((await archive.read(byName.get('empty.txt')!)).length).toBe(0);
    } finally {
      await archive.close();
    }
  });

  it('writes an empty archive that reads back as no entries', async () => {
    const archive = await openZip(await writeZip([]));
    expect(archive.entries).toEqual([]);
    await archive.close();
  });

  it('uses ZIP64 records past 65,534 entries, and reads them back', async () => {
    const entries: [string, string][] = Array.from({ length: 65_600 }, (_, i) => [`f/${i}.txt`, '']);
    const archive = await openZip(await writeZip(entries));
    try {
      expect(archive.entries).toHaveLength(65_600);
      expect(archive.entries[65_599].name).toBe('f/65599.txt');
    } finally {
      await archive.close();
    }
  }, 60_000);

  it('refuses to grow past what 32-bit offsets can address', async () => {
    const writer = new ZipWriter(new PassThrough());
    (writer as unknown as { offset: number }).offset = 0xfffffff0;
    await expect(writer.add('a.txt', 'x')).rejects.toThrow('larger than a zip');
  });

  it('waits for the stream to drain rather than buffering an export', async () => {
    const out = new PassThrough({ highWaterMark: 16 });
    const received: Buffer[] = [];
    out.on('data', (piece: Buffer) => received.push(piece));
    const writer = new ZipWriter(out);
    await writer.add('a.txt', 'x'.repeat(200));
    await writer.finish();
    out.end();
    expect(Buffer.concat(received).subarray(0, 4).toString('hex')).toBe('504b0304');
  });

  it('fails an add when the stream errors while waiting for it', async () => {
    const out = new PassThrough({ highWaterMark: 1 });
    const writer = new ZipWriter(out);
    const pending = writer.add('a.txt', 'x'.repeat(100));
    out.destroy(new Error('socket closed'));
    await expect(pending).rejects.toThrow('socket closed');
  });
});

describe('openZip refuses what it should', () => {
  it('rejects a file that is not a zip', async () => {
    const path = join(folder, 'bad.zip');
    await writeFile(path, Buffer.alloc(100, 1));
    await expect(openZip(path)).rejects.toThrow('Not a zip archive');
  });

  it('rejects an archive with more entries than allowed', async () => {
    const path = await writeZip([
      ['a', '1'],
      ['b', '2']
    ]);
    await expect(openZip(path, { ...ZIP_LIMITS, entries: 1 })).rejects.toThrow('more than 1 entries');
  });

  it('rejects an archive that expands past its total budget, and a single oversized file', async () => {
    const path = await writeZip([['a', 'x'.repeat(100)]]);
    await expect(openZip(path, { ...ZIP_LIMITS, totalBytes: 50 })).rejects.toThrow('expands to more');

    const archive = await openZip(path, { ...ZIP_LIMITS, entryBytes: 50 });
    await expect(archive.read(archive.entries[0])).rejects.toThrow('larger than a single file');
    await archive.close();
  });

  it('rejects a truncated directory and a corrupt entry', async () => {
    const path = await writeZip([['a.txt', 'hello hello hello hello']]);
    const archive = await openZip(path);
    const entry = { ...archive.entries[0] };
    await archive.close();

    // Flip the stored CRC: the data is intact but no longer what the directory says.
    const wrong = await openZip(path);
    await expect(wrong.read({ ...entry, crc: entry.crc ^ 1 })).rejects.toThrow('corrupt');
    // Point at a place that holds no local header.
    await expect(wrong.read({ ...entry, offset: 3 })).rejects.toThrow('corrupt');
    // A method this reader does not know.
    await expect(wrong.read({ ...entry, method: 12 })).rejects.toThrow('unsupported compression');
    await wrong.close();
  });

  it('rejects an entry whose deflate stream does not match its declared size', async () => {
    const path = await writeZip([['a.txt', 'hello hello hello hello hello hello']]);
    const archive = await openZip(path);
    const entry = archive.entries[0];
    await expect(archive.read({ ...entry, size: entry.size - 5 })).rejects.toThrow('corrupt');
    await archive.close();
  });

  it('rejects encrypted entries', async () => {
    const path = await writeZip([['a.txt', 'secret']]);
    const bytes = Buffer.from(await (await import('node:fs/promises')).readFile(path));
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt16LE(bytes.readUInt16LE(central + 8) | 1, central + 8);
    const encrypted = join(folder, 'enc.zip');
    await writeFile(encrypted, bytes);
    await expect(openZip(encrypted)).rejects.toThrow('Encrypted');
  });

  it('rejects a directory that does not start with a central record', async () => {
    const path = await writeZip([['a.txt', 'x']]);
    const bytes = Buffer.from(await (await import('node:fs/promises')).readFile(path));
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes[central] = 0;
    const broken = join(folder, 'broken.zip');
    await writeFile(broken, bytes);
    await expect(openZip(broken)).rejects.toThrow('directory is corrupt');
  });

  it('rejects a directory that runs past the end of the file', async () => {
    const path = await writeZip([['a.txt', 'x']]);
    const bytes = Buffer.from(await (await import('node:fs/promises')).readFile(path));
    const eocd = bytes.length - 22;
    bytes.writeUInt32LE(bytes.readUInt32LE(eocd + 12) + 1000, eocd + 12);
    const broken = join(folder, 'short.zip');
    await writeFile(broken, bytes);
    await expect(openZip(broken)).rejects.toThrow('truncated');
  });

  it('rejects ZIP64 markers with no ZIP64 record behind them', async () => {
    const path = await writeZip([['a.txt', 'x']]);
    const bytes = Buffer.from(await (await import('node:fs/promises')).readFile(path));
    bytes.writeUInt16LE(0xffff, bytes.length - 22 + 10);
    const broken = join(folder, 'z64.zip');
    await writeFile(broken, bytes);
    await expect(openZip(broken)).rejects.toThrow('directory is corrupt');
  });
});
