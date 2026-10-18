import { describe, expect, it } from 'vitest';
import { blockName, formatResult, numericRows } from './numericRows';

describe('numericRows', () => {
  it('lists every finite number in a results blob by its dotted path', () => {
    expect(
      numericRows({ train: { loss: 0.2, per_class: { car: { iou: 0.7 } } }, lr: 1e-4, note: 'x', list: [1], bad: NaN })
    ).toEqual([
      ['train.loss', 0.2],
      ['train.per_class.car.iou', 0.7],
      ['lr', 1e-4]
    ]);
    expect(numericRows(undefined)).toEqual([]);
    expect(numericRows(3)).toEqual([['', 3]]);
  });
});

describe('blockName', () => {
  it('names the usual result blocks, and keeps any other as written', () => {
    expect(['train', 'val', 'Validation', 'test', 'zod_night'].map(blockName)).toEqual([
      'Training',
      'Validation',
      'Validation',
      'Test',
      'zod_night'
    ]);
  });
});

describe('formatResult', () => {
  it('writes a number the way its metric is declared', () => {
    expect(formatResult(0.81234, { format: 'number', decimals: 4 })).toBe('0.8123');
    expect(formatResult(0.81234, { format: 'percent', decimals: 3 })).toBe('81.2%');
    expect(formatResult(12.5, { format: 'ms', decimals: 2 })).toBe('12.50 ms');
    expect(formatResult(30, { format: 'fps', decimals: 1 })).toBe('30.0 FPS');
    expect(formatResult(0, { format: 'number', decimals: 2 })).toBe('0.00');
  });

  it('keeps a tiny number readable rather than rounding it to zero', () => {
    expect(formatResult(0.00001, { format: 'number', decimals: 4 })).toBe('1.00e-5');
  });
});
