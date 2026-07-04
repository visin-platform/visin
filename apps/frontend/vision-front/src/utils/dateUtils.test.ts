import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDuration } from './dateUtils';

describe('formatDateTime', () => {
  it('formats a date as DD.MM.YYYY HH:mm with zero-padding', () => {
    const date = new Date(2026, 0, 4, 9, 5); // Jan 4 2026, 09:05 local time
    expect(formatDateTime(date.toISOString())).toBe('04.01.2026 09:05');
  });

  it('does not zero-pad the year', () => {
    const date = new Date(2026, 11, 31, 23, 59);
    expect(formatDateTime(date.toISOString())).toBe('31.12.2026 23:59');
  });
});

describe('formatDuration', () => {
  it('returns "0s" for zero seconds', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats seconds only when under a minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('omits seconds when the remainder is exactly zero (but keeps minutes)', () => {
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats hours, minutes and seconds together', () => {
    expect(formatDuration(9030)).toBe('2h 30m 30s');
  });

  it('omits zero-valued hours/minutes segments in the middle', () => {
    expect(formatDuration(3605)).toBe('1h 5s');
  });

  it('rounds fractional seconds to the nearest integer', () => {
    expect(formatDuration(59.6)).toBe('1m');
  });
});
