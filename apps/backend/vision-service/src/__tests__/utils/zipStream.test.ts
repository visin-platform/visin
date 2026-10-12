import { crc32 } from 'zlib';
import { safeZipName, zipStream, type ZipEntry } from '../../utils/zipStream';
import { unzip } from '../fixtures/unzip';

const collect = async (stream: AsyncIterable<Buffer>): Promise<Buffer> => {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(part);
  return Buffer.concat(parts);
};

async function* chunked(...parts: Buffer[]) {
  for (const part of parts) yield part;
}

describe('zipStream', () => {
  it('writes entries that a reader finds again, byte for byte, in order', async () => {
    const png = Buffer.from(Array.from({ length: 5000 }, (_, index) => (index * 7) % 256));
    const entries: ZipEntry[] = [
      { name: 'metrics.json', data: Buffer.from('{"a":1}') },
      { name: 'mask/sq11_000301.png', data: chunked(png.subarray(0, 1234), png.subarray(1234)) },
      { name: 'konfidenz/ärger.png', data: Buffer.alloc(0) }
    ];
    const info: Record<string, { size: number; crc32: number }> = {};
    const zip = await collect(zipStream(entries, (name, entry) => (info[name] = entry)));

    const files = unzip(zip);
    expect([...files.keys()]).toEqual(['metrics.json', 'mask/sq11_000301.png', 'konfidenz/ärger.png']);
    expect(files.get('metrics.json')!.toString()).toBe('{"a":1}');
    expect(files.get('mask/sq11_000301.png')!.equals(png)).toBe(true);
    expect(files.get('konfidenz/ärger.png')!.length).toBe(0);
    expect(info['mask/sq11_000301.png']).toEqual({ size: 5000, crc32: crc32(png) });
  });

  it('writes an empty archive that is still a zip', async () => {
    const zip = await collect(zipStream([]));
    expect(zip.length).toBe(22);
    expect(unzip(zip).size).toBe(0);
  });

  it('takes entries from an async source, one at a time', async () => {
    async function* source(): AsyncGenerator<ZipEntry> {
      yield { name: 'a.txt', data: Buffer.from('a') };
      yield { name: 'b.txt', data: Buffer.from('b') };
    }
    expect([...unzip(await collect(zipStream(source()))).keys()]).toEqual(['a.txt', 'b.txt']);
  });

  it('leaves no central directory when an entry’s data fails, so a reader sees a broken file', async () => {
    async function* failing(): AsyncGenerator<Buffer> {
      yield Buffer.from('partial');
      throw new Error('storage went away');
    }
    const seen: Buffer[] = [];
    await expect(
      (async () => {
        for await (const part of zipStream([{ name: 'a.png', data: failing() }])) seen.push(part);
      })()
    ).rejects.toThrow('storage went away');
    const partial = Buffer.concat(seen);
    expect(partial.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(false);
    expect(partial.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
    expect(() => unzip(partial)).toThrow();
  });

  it.each(['', '/etc/passwd', '../x', 'a/../b', 'a//b', 'a\\b', './a', 'a\0b'])('refuses the name %j', (name) => {
    expect(() => safeZipName(name)).toThrow('safe zip entry name');
  });

  it('refuses more entries than the format holds, or than the caller allows, rather than write a file no reader can open', async () => {
    function* many(count: number): Generator<ZipEntry> {
      for (let index = 0; index < count; index += 1) yield { name: `f${index}`, data: Buffer.alloc(0) };
    }
    await expect(collect(zipStream(many(0x10000)))).rejects.toThrow('ZIP64');
    await expect(collect(zipStream(many(4), undefined, { entries: 3 }))).rejects.toThrow('ZIP64');
    expect(unzip(await collect(zipStream(many(3), undefined, { entries: 3 }))).size).toBe(3);
  });

  it('refuses an archive over the size the caller allows, however it is split into entries', async () => {
    const entries = [{ name: 'a', data: Buffer.alloc(600) }, { name: 'b', data: Buffer.alloc(600) }];
    await expect(collect(zipStream(entries, undefined, { bytes: 1000 }))).rejects.toThrow('ZIP64');
    await expect(collect(zipStream([{ name: 'a', data: Buffer.alloc(2000) }], undefined, { bytes: 1000 }))).rejects.toThrow('ZIP64');
    expect(unzip(await collect(zipStream(entries, undefined, { bytes: 5000 }))).size).toBe(2);
  });

  it('takes bytes that are not a Buffer, and stamps an entry with the time it was given, never before 1980', async () => {
    async function* typed(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1, 2, 3]);
      yield Buffer.from([4]);
    }
    const zip = await collect(
      zipStream([
        { name: 'bytes', data: typed(), modified: new Date(Date.UTC(2026, 9, 12, 9, 27, 4)) },
        { name: 'old', data: Buffer.alloc(0), modified: new Date(Date.UTC(1970, 0, 1)) }
      ])
    );
    expect([...unzip(zip).get('bytes')!]).toEqual([1, 2, 3, 4]);

    // each directory header's DOS time and date, in order
    const end = zip.length - 22;
    let cursor = zip.readUInt32LE(end + 16);
    const stamps: Array<{ time: number; day: number }> = [];
    for (let index = 0; index < zip.readUInt16LE(end + 10); index += 1) {
      stamps.push({ time: zip.readUInt16LE(cursor + 12), day: zip.readUInt16LE(cursor + 14) });
      cursor += 46 + zip.readUInt16LE(cursor + 28);
    }
    expect(stamps[0]).toEqual({ time: (9 << 11) | (27 << 5) | 2, day: ((2026 - 1980) << 9) | (10 << 5) | 12 });
    expect(stamps[1].day >> 9).toBe(0); // clamped to 1980, the format's first year
  });

  it('refuses a name too long for the format', () => {
    expect(() => safeZipName('a'.repeat(0x10000))).toThrow('too long');
  });
});
