import { expect, it } from 'vitest';
import { formatChatDateTime, formatChatTime } from './regionalTime';

it('uses Tallinn local time and a 24-hour clock even with an English US browser', () => {
  expect(formatChatTime('2026-11-10T21:27:00Z', 'en-US', 'Europe/Tallinn')).toBe('23:27');
  expect(formatChatTime('2026-11-10T22:05:00Z', 'en-US', 'Europe/Tallinn')).toBe('00:05');
  expect(formatChatTime('2026-07-10T20:27:00Z', 'et-EE', 'Europe/Tallinn')).toBe('23:27');
});
it('keeps the regional language convention outside Europe', () => {
  expect(formatChatTime('2026-11-10T21:27:00Z', 'en-US', 'America/New_York')).toMatch(/04:27\s?PM/);
  expect(formatChatTime('2026-11-10T21:27:00Z', 'en-GB', 'America/New_York')).toBe('16:27');
});
it('uses the same regional clock for full source timestamps', () => {
  const text = formatChatDateTime('2026-11-10T21:27:00Z', 'en-US', 'Europe/Tallinn');
  expect(text).toContain('23:27');
  expect(text).not.toMatch(/AM|PM/);
});
