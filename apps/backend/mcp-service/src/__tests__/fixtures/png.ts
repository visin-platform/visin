import { crc32, deflateSync, inflateSync } from 'zlib';

/**
 * PNGs written the long way, so the codec is tested against files it did not write itself: any bit depth and colour
 * type, every row filter, a palette, and the malformed cases a reader has to refuse.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, check]);
};

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Apply `filter` to raw rows, as an encoder would: each byte minus what the filter predicts for it. */
const filterRows = (rows: Buffer[], filter: number, bytesPerPixel: number): Buffer =>
  Buffer.concat(
    rows.map((row, y) => {
      const above = y > 0 ? rows[y - 1] : Buffer.alloc(row.length);
      const out = Buffer.alloc(row.length + 1);
      out[0] = filter;
      for (let x = 0; x < row.length; x += 1) {
        const a = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
        const b = above[x];
        const c = x >= bytesPerPixel ? above[x - bytesPerPixel] : 0;
        const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter] ?? 0;
        out[x + 1] = (row[x] - predicted) & 0xff;
      }
      return out;
    })
  );

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

interface PngOptions {
  /** the samples of each row, channel by channel: grey levels, palette indices, or r, g, b (and alpha) */
  rows: number[][];
  depth?: 8 | 16;
  colour?: number;
  palette?: Array<[number, number, number]>;
  filter?: number;
  interlaced?: boolean;
}

/** A PNG of the given samples. */
export function png({ rows, depth = 8, colour = 0, palette, filter = 0, interlaced = false }: PngOptions): Buffer {
  const channels = CHANNELS[colour] ?? 1;
  const bytesPerPixel = (channels * depth) / 8;
  const raw = rows.map((row) => {
    const bytes = Buffer.alloc((row.length * depth) / 8);
    row.forEach((value, x) => (depth === 16 ? bytes.writeUInt16BE(value, x * 2) : (bytes[x] = value)));
    return bytes;
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE((rows[0]?.length ?? 0) / channels, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = depth;
  header[9] = colour;
  header[12] = interlaced ? 1 : 0;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    ...(palette ? [chunk('PLTE', Buffer.from(palette.flat()))] : []),
    chunk('IDAT', deflateSync(filterRows(raw, filter, bytesPerPixel))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** One grey row: how a run stores a mask or a confidence map. */
export const greyPng = (...values: number[]): Buffer => png({ rows: [values] });

/** The RGB pixels of a PNG this codec wrote, read back without it: its own rows, unfiltered by hand. */
export function rgbPixels(file: Buffer): number[][] {
  let at = SIGNATURE.length;
  let width = 0;
  const idat: Buffer[] = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const type = file.toString('latin1', at + 4, at + 8);
    const data = file.subarray(at + 8, at + 8 + length);
    if (file.readUInt32BE(at + 8 + length) !== crc32(file.subarray(at + 4, at + 8 + length)) >>> 0) {
      throw new Error(`bad CRC on ${type}`);
    }
    if (type === 'IHDR') width = data.readUInt32BE(0);
    if (type === 'IDAT') idat.push(data);
    at += 12 + length;
  }
  const stride = width * 3;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels: number[][] = [];
  let above = Buffer.alloc(stride);
  for (let y = 0; y * (stride + 1) < inflated.length; y += 1) {
    const filter = inflated[y * (stride + 1)];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[y * (stride + 1) + 1 + x];
      row[x] = filter === 2 ? (value + above[x]) & 0xff : value;
    }
    for (let x = 0; x < width; x += 1) pixels.push([...row.subarray(x * 3, x * 3 + 3)]);
    above = row;
  }
  return pixels;
}
