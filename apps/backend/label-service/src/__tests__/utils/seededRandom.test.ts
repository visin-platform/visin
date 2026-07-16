import { mulberry32, seededShuffle, seededSample } from '../../utils/seededRandom';

describe('mulberry32', () => {
  it('is deterministic for a given seed and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('seededShuffle', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it('is a deterministic permutation', () => {
    const once = seededShuffle(items, 7);
    const twice = seededShuffle(items, 7);

    expect(once).toEqual(twice);
    expect([...once].sort((a, b) => a - b)).toEqual(items);
    expect(once).not.toEqual(items); // 20! permutations — astronomically unlikely to be identity
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3];
    seededShuffle(input, 1);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('seededSample', () => {
  it('returns n items, all from the input', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const sample = seededSample(items, 3, 9);

    expect(sample).toHaveLength(3);
    for (const item of sample) {
      expect(items).toContain(item);
    }
  });

  it('returns everything (shuffled) when n exceeds the input', () => {
    expect(seededSample([1, 2], 10, 1)).toHaveLength(2);
  });

  it('clamps negative n to empty', () => {
    expect(seededSample([1, 2], -1, 1)).toEqual([]);
  });
});
