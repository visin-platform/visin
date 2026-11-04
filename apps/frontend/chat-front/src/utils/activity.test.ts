import { expect, it } from 'vitest';
import { lastActiveLabel } from './activity';
it('formats approximate activity and handles missing or invalid timestamps', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  expect(lastActiveLabel(undefined, now)).toBeUndefined();
  expect(lastActiveLabel('invalid', now)).toBeUndefined();
  expect(lastActiveLabel('2026-11-04T11:58:00Z', now)).toBe('Active recently');
  expect(lastActiveLabel('2026-11-04T11:50:00Z', now)).toBe('Last active about 10m ago');
  expect(lastActiveLabel('2026-11-04T10:00:00Z', now)).toBe('Last active about 2h ago');
});
