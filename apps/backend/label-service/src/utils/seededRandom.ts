/**
 * Deterministic sampling for task materialization: the same (items, seed) always
 * yields the same task set, so a job's selection is reproducible and auditable.
 */

/** mulberry32 PRNG — tiny, fast, good enough for sampling (not cryptography). */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher–Yates shuffle with a seeded PRNG; returns a new array. */
export const seededShuffle = <T>(items: T[], seed: number): T[] => {
  const random = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** First `n` of a seeded shuffle (n >= length returns all, shuffled). */
export const seededSample = <T>(items: T[], n: number, seed: number): T[] =>
  seededShuffle(items, seed).slice(0, Math.max(0, n));
