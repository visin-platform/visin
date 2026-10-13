import { countPixels, decodeMaskRle, encodeMaskRle } from '../../utils/mask';

describe('mask run-length codec', () => {
  it('round-trips a mask, and writes long runs compactly', () => {
    const data = new Uint8Array(40 * 30);
    data.fill(3, 100, 700);
    data.fill(1, 1000, 1010);
    const encoded = encodeMaskRle({ width: 40, height: 30, data });

    expect(encoded.length).toBeLessThan(40);
    const decoded = decodeMaskRle(encoded);
    expect(decoded.width).toBe(40);
    expect(decoded.height).toBe(30);
    expect(Array.from(decoded.data)).toEqual(Array.from(data));
  });

  it('handles runs that need several length bytes and a single-colour image', () => {
    const data = new Uint8Array(1000 * 1000).fill(9);
    const decoded = decodeMaskRle(encodeMaskRle({ width: 1000, height: 1000, data }));
    expect(decoded.data[0]).toBe(9);
    expect(decoded.data[999_999]).toBe(9);
    expect(decoded.data).toHaveLength(1_000_000);
  });

  it('refuses bytes that are not a mask, or a different version of one', () => {
    expect(() => decodeMaskRle(Buffer.from('nope'))).toThrow('Not a Visin mask');
    const encoded = encodeMaskRle({ width: 1, height: 1, data: Uint8Array.from([1]) });
    encoded[4] = 2;
    expect(() => decodeMaskRle(encoded)).toThrow('Not a Visin mask');
  });

  it('refuses sizes outside what a frame may be', () => {
    const zero = encodeMaskRle({ width: 1, height: 1, data: Uint8Array.from([1]) });
    zero.writeUInt32LE(0, 5);
    expect(() => decodeMaskRle(zero)).toThrow('outside what a frame may be');

    const big = encodeMaskRle({ width: 4, height: 4, data: new Uint8Array(16) });
    expect(() => decodeMaskRle(big, 8)).toThrow('outside what a frame may be');
  });

  it('refuses runs that overflow, underfill or are malformed', () => {
    const header = encodeMaskRle({ width: 2, height: 2, data: new Uint8Array(4) }).subarray(0, 13);
    const withRuns = (...runs: number[]) => Buffer.concat([header, Buffer.from(runs)]);

    expect(() => decodeMaskRle(withRuns(1, 5))).toThrow('do not fit');
    expect(() => decodeMaskRle(withRuns(1, 0))).toThrow('do not fit');
    expect(() => decodeMaskRle(withRuns(1, 2))).toThrow('do not cover');
    expect(() => decodeMaskRle(withRuns(1))).toThrow('malformed');
    expect(() => decodeMaskRle(withRuns(1, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01))).toThrow('malformed');
  });
});

describe('countPixels', () => {
  it('counts labeled pixels per class index and leaves out the unlabeled', () => {
    expect(countPixels(Uint8Array.from([0, 0, 1, 1, 1, 2, 255]))).toEqual({ '1': 3, '2': 1, '255': 1 });
    expect(countPixels(new Uint8Array(5))).toEqual({});
  });
});
