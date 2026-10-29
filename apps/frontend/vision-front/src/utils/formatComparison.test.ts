import { describe, it, expect } from 'vitest';
import { formatTime, formatNumber } from './formatComparison';

describe('formatTime', () => {
  it('formats seconds, minutes, hours, and days', () => {
    expect(formatTime(45)).toBe('45s');
    expect(formatTime(90)).toBe('1.5m');
    expect(formatTime(7200)).toBe('2.0h');
    expect(formatTime(172800)).toBe('2.0d');
  });
});

describe('formatNumber', () => {
  it('scales and formats a numeric value', () => {
    expect(formatNumber(0.8567, 2, 100)).toBe('85.67');
    expect(formatNumber(0.5, 1, 10)).toBe('5.0');
  });

  it('returns N/A for non-numeric or NaN input', () => {
    expect(formatNumber(undefined)).toBe('N/A');
    expect(formatNumber(NaN)).toBe('N/A');
    expect(formatNumber('x' as unknown as number)).toBe('N/A');
  });
});
