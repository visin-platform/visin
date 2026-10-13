import { describe, expect, it } from 'vitest';
import { rampColor, valueRange } from './sensorColors';

describe('rampColor', () => {
  it('runs from the cool end to the warm end', () => {
    expect(rampColor(0)).toBe('#313695');
    expect(rampColor(1)).toBe('#d73027');
  });

  it('blends between stops and clamps outside the range', () => {
    expect(rampColor(0.5)).toMatch(/^#[0-9a-f]{6}$/);
    expect(rampColor(-3)).toBe(rampColor(0));
    expect(rampColor(7)).toBe(rampColor(1));
    expect(rampColor(Number.NaN)).toBe(rampColor(0));
  });
});

describe('valueRange', () => {
  it('finds the span, skipping readings that are missing or not numbers', () => {
    expect(valueRange([3, undefined, 9, Number.NaN, -2])).toEqual({ min: -2, max: 9 });
  });

  it('is null when no point carries a reading', () => {
    expect(valueRange([undefined, undefined])).toBeNull();
    expect(valueRange([])).toBeNull();
  });
});
