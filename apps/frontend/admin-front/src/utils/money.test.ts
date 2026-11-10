import { expect, it } from 'vitest';
import { formatMoney, fromMicros } from './money';

it('converts millionths to whole units', () => {
  expect(fromMicros(2_500_000)).toBe(2.5);
  expect(fromMicros(0)).toBe(0);
});

it('formats with the currency, to at least cents and at most the given digits', () => {
  expect(formatMoney(2.5, 'USD')).toMatch(/2\.50/);
  expect(formatMoney(0.001234, 'USD', 4)).toMatch(/0\.0012/);
  expect(formatMoney(1, 'EUR')).toMatch(/€|EUR/);
});

it('never shows a missing price as free, and survives a code Intl does not know', () => {
  expect(formatMoney(0, undefined)).toBe('Unknown');
  expect(formatMoney(1.5, 'MIXED', 2)).toBe('1.50 MIXED');
});
