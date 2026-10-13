import { deflateSync } from 'node:zlib';
import { crc32 } from '../../utils/crc32';
import { decodePng, encodeGrayscalePng, encodePalettePng, readPngSize } from '../../utils/png';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const chunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A PNG built the way other tools build them: rows of already-packed bytes, each with its own filter. */
const build = (opts: {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  rows: number[][];
  filters?: number[];
  palette?: number[][];
  interlace?: number;
  extraChunks?: Buffer[];
}): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(opts.width, 0);
  header.writeUInt32BE(opts.height, 4);
  header[8] = opts.bitDepth;
  header[9] = opts.colorType;
  header[12] = opts.interlace ?? 0;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[opts.colorType]!;
  const step = Math.max(1, (channels * opts.bitDepth) >> 3);
  const raw: number[] = [];
  opts.rows.forEach((row, y) => {
    const filter = opts.filters?.[y] ?? 0;
    raw.push(filter);
    row.forEach((value, x) => {
      const left = x >= step ? row[x - step] : 0;
      const up = y > 0 ? opts.rows[y - 1][x] : 0;
      const upLeft = y > 0 && x >= step ? opts.rows[y - 1][x - step] : 0;
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
      raw.push((value - predicted) & 0xff);
    });
  });
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    ...(opts.palette ? [chunk('PLTE', Buffer.from(opts.palette.flat()))] : []),
    ...(opts.extraChunks || []),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

describe('encoding', () => {
  it('writes a grayscale PNG that reads back to the same class indices', () => {
    const data = Uint8Array.from([0, 1, 2, 3, 255, 0]);
    const png = encodeGrayscalePng(3, 2, data);

    expect(readPngSize(png)).toEqual({ width: 3, height: 2 });
    const decoded = decodePng(png);
    expect(decoded).toMatchObject({ width: 3, height: 2, colorType: 0, channels: 1 });
    expect(Array.from(decoded.data)).toEqual(Array.from(data));
  });

  it('writes a palette PNG whose palette comes back with it', () => {
    const png = encodePalettePng(2, 1, Uint8Array.from([0, 1]), [
      [0, 0, 0],
      [200, 10, 20]
    ]);

    const decoded = decodePng(png);
    expect(decoded.colorType).toBe(3);
    expect(Array.from(decoded.data)).toEqual([0, 1]);
    expect(decoded.palette).toEqual([
      [0, 0, 0],
      [200, 10, 20]
    ]);
  });

  it('refuses data that is not width × height bytes', () => {
    expect(() => encodeGrayscalePng(2, 2, new Uint8Array(3))).toThrow('expected 4');
  });
});

describe('decoding what other tools write', () => {
  it('undoes every row filter', () => {
    const rows = [
      [10, 20, 30, 40],
      [11, 25, 29, 90],
      [12, 26, 200, 91],
      [250, 1, 2, 3],
      [5, 5, 5, 5]
    ];
    const png = build({ width: 4, height: 5, bitDepth: 8, colorType: 0, rows, filters: [0, 1, 2, 3, 4] });

    expect(Array.from(decodePng(png).data)).toEqual(rows.flat());
  });

  it('undoes filters that look back a whole pixel in an RGB image', () => {
    const rows = [
      [1, 2, 3, 4, 5, 6],
      [10, 20, 30, 40, 50, 60],
      [9, 9, 9, 8, 8, 8]
    ];
    const png = build({ width: 2, height: 3, bitDepth: 8, colorType: 2, rows, filters: [1, 4, 3] });

    const decoded = decodePng(png);
    expect(decoded.channels).toBe(3);
    expect(Array.from(decoded.data)).toEqual(rows.flat());
  });

  it('unpacks 1, 2 and 4-bit palette rows to one byte per pixel', () => {
    // 4-bit: 0x12 0x30 → 1 2 3 (the last nibble of the row is padding).
    const four = decodePng(build({ width: 3, height: 1, bitDepth: 4, colorType: 3, rows: [[0x12, 0x30]], palette: [[0, 0, 0]] }));
    expect(Array.from(four.data)).toEqual([1, 2, 3]);
    // 2-bit: 0b01_10_11_00 → 1 2 3 0
    const two = decodePng(build({ width: 4, height: 1, bitDepth: 2, colorType: 0, rows: [[0b01101100]] }));
    expect(Array.from(two.data)).toEqual([1, 2, 3, 0]);
    // 1-bit: 0b1010_0000 → 1 0 1 0
    const one = decodePng(build({ width: 4, height: 1, bitDepth: 1, colorType: 0, rows: [[0b10100000]] }));
    expect(Array.from(one.data)).toEqual([1, 0, 1, 0]);
  });

  it('stops at IEND and ignores chunks it does not use', () => {
    const png = build({
      width: 1,
      height: 1,
      bitDepth: 8,
      colorType: 0,
      rows: [[7]],
      extraChunks: [chunk('tEXt', Buffer.from('Comment\0hello'))]
    });

    expect(Array.from(decodePng(png).data)).toEqual([7]);
  });

  it('reads RGBA masks, which some tools export', () => {
    const png = build({ width: 1, height: 1, bitDepth: 8, colorType: 6, rows: [[10, 20, 30, 255]] });
    const decoded = decodePng(png);
    expect(decoded.channels).toBe(4);
    expect(Array.from(decoded.data)).toEqual([10, 20, 30, 255]);
  });
});

describe('refusing what it cannot read', () => {
  it('rejects data that is not a PNG', () => {
    expect(() => decodePng(Buffer.from('definitely not a png file, no way at all.'))).toThrow('Not a PNG');
    expect(() => readPngSize(Buffer.alloc(4))).toThrow('Not a PNG');
  });

  it('rejects interlaced, 16-bit and unknown colour types', () => {
    const base = { width: 1, height: 1, rows: [[0]] };
    expect(() => decodePng(build({ ...base, bitDepth: 8, colorType: 0, interlace: 1 }))).toThrow('non-interlaced');
    expect(() => decodePng(build({ ...base, bitDepth: 16, colorType: 0 }))).toThrow('bit depth 16');
    expect(() => decodePng(build({ ...base, bitDepth: 8, colorType: 5 }))).toThrow('non-interlaced');
    expect(() => decodePng(build({ ...base, bitDepth: 4, colorType: 2 }))).toThrow('bit depth 4');
  });

  it('rejects an image larger than the pixel budget, before allocating it', () => {
    const png = encodeGrayscalePng(4, 4, new Uint8Array(16));
    expect(() => decodePng(png, 10)).toThrow('outside what a mask may be');
  });

  it('rejects corrupt and truncated image data and unknown row filters', () => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(2, 0);
    header.writeUInt32BE(2, 4);
    header[8] = 8;
    const withIdat = (idat: Buffer) =>
      Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);

    expect(() => decodePng(withIdat(Buffer.from('not zlib')))).toThrow('corrupt');
    expect(() => decodePng(withIdat(deflateSync(Buffer.from([0, 1, 2]))))).toThrow('truncated');
    expect(() => decodePng(withIdat(deflateSync(Buffer.from([9, 1, 2, 0, 3, 4]))))).toThrow('unknown row filter');
  });
});
