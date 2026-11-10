import { afterEach, expect, it, vi } from 'vitest';
import { formatDateTime } from './dateTime';

afterEach(() => vi.unstubAllEnvs());

it('shows a 24-hour clock, with no AM or PM', () => {
  const text = formatDateTime('2026-10-05T17:43:56');
  expect(text).toMatch(/17:43/);
  expect(text).not.toMatch(/[AP]M/i);
  expect(formatDateTime('2026-10-05T05:07:00')).toMatch(/05:07/);
});

it('writes the day before the month, and the year', () => {
  expect(formatDateTime('2026-10-05T12:00:00')).toMatch(/^5 Oct 2026, 12:00$/);
});

it('has no midnight "24:00": a new day starts at 00:00', () => {
  expect(formatDateTime('2026-10-06T00:05:00')).toMatch(/6 Oct 2026, 00:05/);
});

it('is the viewer\'s own time zone, not UTC', () => {
  const at = new Date('2026-10-05T12:00:00Z');
  const local = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  expect(formatDateTime(at)).toContain(local);
});

it('shows nothing for a missing or unreadable moment', () => {
  expect(formatDateTime(undefined)).toBe('');
  expect(formatDateTime(null)).toBe('');
  expect(formatDateTime('')).toBe('');
  expect(formatDateTime('not a date')).toBe('');
});
