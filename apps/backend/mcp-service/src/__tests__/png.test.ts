import { deflateSync } from 'zlib';
import { decodeGrey, encodeRgb } from '../png';
import { chunk, png, rgbPixels } from './fixtures/png';

/** Three rows that differ from row to row and pixel to pixel, so every filter predicts something different. */
const rows = [
  [0, 1, 2, 250],
  [3, 0, 255, 4],
  [9, 9, 1, 0]
];

describe('decodeGrey', () => {
  it.each([0, 1, 2, 3, 4])('reads 8-bit grey rows stored with filter %i', (filter) => {
    expect(decodeGrey(png({ rows, filter }))).toEqual({ width: 4, height: 3, values: new Uint8Array(rows.flat()) });
  });

  it.each([0, 4])('reads 16-bit grey stored with filter %i, scaled to 8 bits', (filter) => {
    const decoded = decodeGrey(png({ rows: [[0, 32768, 65535], [257, 514, 65535 - 257]], depth: 16, filter }));
    expect([...decoded!.values]).toEqual([0, 128, 255, 1, 2, 254]);
  });

  it('reads grey stored as RGB, or with alpha, as image libraries often write it', () => {
    expect([...decodeGrey(png({ rows: [[5, 5, 5, 9, 9, 9]], colour: 2, filter: 1 }))!.values]).toEqual([5, 9]);
    expect([...decodeGrey(png({ rows: [[5, 5, 5, 0, 9, 9, 9, 255]], colour: 6, filter: 4 }))!.values]).toEqual([5, 9]);
    expect([...decodeGrey(png({ rows: [[5, 0, 9, 255]], colour: 4 }))!.values]).toEqual([5, 9]);
    expect([...decodeGrey(png({ rows: [[32768, 32768, 32768]], colour: 2, depth: 16 }))!.values]).toEqual([128]);
    expect(decodeGrey(png({ rows: [[5, 5, 6]], colour: 2 }))).toBeUndefined();
  });

  it('reads a palette of greys as their levels, and leaves a coloured palette alone', () => {
    const greys: Array<[number, number, number]> = [[0, 0, 0], [1, 1, 1], [2, 2, 2]];
    expect([...decodeGrey(png({ rows: [[2, 0, 1]], colour: 3, palette: greys }))!.values]).toEqual([2, 0, 1]);
    expect(decodeGrey(png({ rows: [[0, 1]], colour: 3, palette: [[0, 0, 0], [200, 10, 10]] }))).toBeUndefined();
    expect(decodeGrey(png({ rows: [[0, 5]], colour: 3, palette: greys }))).toBeUndefined();
    expect(decodeGrey(png({ rows: [[0]], colour: 3 }))).toBeUndefined();
  });

  it('refuses what it does not read: not a PNG, colour, interlacing, bad filters, damaged data', () => {
    expect(decodeGrey(Buffer.from('<html>expired</html>'))).toBeUndefined();
    expect(decodeGrey(Buffer.alloc(4))).toBeUndefined();
    expect(decodeGrey(png({ rows: [[1, 2, 3]], colour: 2 }))).toBeUndefined();
    expect(decodeGrey(png({ rows: [[1]], colour: 5 }))).toBeUndefined();
    expect(decodeGrey(png({ rows, interlaced: true }))).toBeUndefined();
    expect(decodeGrey(png({ rows: [[1]], filter: 7 }))).toBeUndefined();
    expect(decodeGrey(png({ rows: [[]] }))).toBeUndefined();

    const whole = png({ rows });
    expect(decodeGrey(whole.subarray(0, whole.length - 30))).toBeUndefined();
    const header = whole.subarray(0, 33);
    expect(decodeGrey(Buffer.concat([header, chunk('IDAT', Buffer.from('not deflate'))]))).toBeUndefined();
    expect(decodeGrey(Buffer.concat([header, chunk('IDAT', deflateSync(Buffer.alloc(3)))]))).toBeUndefined();
  });

  it('refuses a header too short to hold the image size, rather than throwing', () => {
    const signature = png({ rows: [[1]] }).subarray(0, 8);
    expect(decodeGrey(Buffer.concat([signature, chunk('IHDR', Buffer.alloc(4))]))).toBeUndefined();
  });

  it('refuses a header claiming more pixels than any frame has, before inflating anything', () => {
    const huge = png({ rows: [[1]] });
    huge.writeUInt32BE(100_000, 16);
    huge.writeUInt32BE(100_000, 20);
    expect(decodeGrey(huge)).toBeUndefined();
  });
});

describe('encodeRgb', () => {
  it('writes an RGB PNG with valid checksums that reads back as the pixels given', () => {
    const pixels = [[10, 20, 30], [40, 50, 60], [10, 20, 30], [255, 0, 7]];
    const file = encodeRgb(2, 2, Uint8Array.from(pixels.flat()));
    expect(file.subarray(1, 4).toString()).toBe('PNG');
    expect(rgbPixels(file)).toEqual(pixels);
  });
});
