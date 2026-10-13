import { describe, expect, it } from 'vitest';
import { decodeMaskRle, encodeMaskRle } from './maskCodec';

describe('mask run-length codec', () => {
  it('writes the header the server expects, then value and length pairs', () => {
    const bytes = encodeMaskRle(4, 2, Uint8Array.from([0, 0, 0, 0, 1, 1, 2, 2]));

    expect(Array.from(bytes.subarray(0, 5))).toEqual([0x56, 0x4d, 0x53, 0x4b, 1]);
    expect(Array.from(bytes.subarray(5, 13))).toEqual([4, 0, 0, 0, 2, 0, 0, 0]);
    expect(Array.from(bytes.subarray(13))).toEqual([0, 4, 1, 2, 2, 2]);
  });

  it('writes long runs as several length bytes', () => {
    const data = new Uint8Array(1000).fill(3);

    const bytes = encodeMaskRle(1000, 1, data);

    // 1000 = 0b111_1101000 → low seven bits with the continue flag, then the rest.
    expect(Array.from(bytes.subarray(13))).toEqual([3, 0xe8, 0x07]);
  });

  it('round-trips a mask', () => {
    const data = new Uint8Array(300);
    data.fill(2, 10, 200);
    data[250] = 9;

    const decoded = decodeMaskRle(encodeMaskRle(30, 10, data));

    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBe(30);
    expect(decoded!.height).toBe(10);
    expect(Array.from(decoded!.data)).toEqual(Array.from(data));
  });

  it('refuses bytes that are not a mask', () => {
    expect(decodeMaskRle(Uint8Array.from([1, 2, 3]))).toBeNull();
    const wrongVersion = encodeMaskRle(1, 1, Uint8Array.from([1]));
    wrongVersion[4] = 2;
    expect(decodeMaskRle(wrongVersion)).toBeNull();
  });

  it('refuses runs that do not add up to the image', () => {
    const base = encodeMaskRle(2, 2, new Uint8Array(4)).subarray(0, 13);
    const withRuns = (...runs: number[]) => Uint8Array.from([...base, ...runs]);

    expect(decodeMaskRle(withRuns(1, 9))).toBeNull(); // too long
    expect(decodeMaskRle(withRuns(1, 2))).toBeNull(); // too short
    expect(decodeMaskRle(withRuns(1, 0))).toBeNull(); // empty run
    expect(decodeMaskRle(withRuns(1))).toBeNull(); // no length
    expect(decodeMaskRle(withRuns(1, 0x80, 0x80, 0x80, 0x80, 0x80, 1))).toBeNull(); // length too wide
  });
});
