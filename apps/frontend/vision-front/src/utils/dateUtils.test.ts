import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatDuration, formatRelativeTime } from './dateUtils';
import { runsLabel } from './runsLabel';

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

describe('formatDate', () => {
  it('formats a date as DD.MM.YYYY with zero-padding and no time', () => {
    const date = new Date(2026, 0, 4, 9, 5);
    expect(formatDate(date.toISOString())).toBe('04.01.2026');
  });

  it('keeps two-digit days and months as they are', () => {
    const date = new Date(2026, 11, 31, 23, 59);
    expect(formatDate(date.toISOString())).toBe('31.12.2026');
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

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-14T12:00:00.000Z').getTime();
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('says "just now" for under a minute, and for a clock a little ahead', () => {
    expect(formatRelativeTime(ago(20), now)).toBe('just now');
    expect(formatRelativeTime(ago(-30), now)).toBe('just now');
  });

  it('counts back in the largest whole unit', () => {
    expect(formatRelativeTime(ago(5 * 60), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(2 * 3600), now)).toBe('2 hours ago');
    expect(formatRelativeTime(ago(3 * 24 * 3600), now)).toBe('3 days ago');
    expect(formatRelativeTime(ago(2 * 7 * 24 * 3600), now)).toBe('2 weeks ago');
    expect(formatRelativeTime(ago(70 * 24 * 3600), now)).toBe('2 months ago');
    expect(formatRelativeTime(ago(800 * 24 * 3600), now)).toBe('2 years ago');
  });

  it('says "yesterday" for a day ago', () => {
    expect(formatRelativeTime(ago(25 * 3600), now)).toBe('yesterday');
  });

  it('does not make up a time from something that is not one', () => {
    expect(formatRelativeTime('not a date', now)).toBe('just now');
  });
});

describe('runsLabel', () => {
  it('says how many runs, in the singular and plural, and when there are none', () => {
    expect(runsLabel(12)).toBe('12 runs');
    expect(runsLabel(1)).toBe('1 run');
    expect(runsLabel(0)).toBe('No runs yet');
    expect(runsLabel(undefined)).toBeNull();
  });
});
