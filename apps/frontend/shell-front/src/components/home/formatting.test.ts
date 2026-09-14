import { describe, it, expect } from 'vitest';
import { firstNameOf, formatCount, formatRelative, formatToday, greetingFor } from './formatting';

const at = (hour: number) => new Date(2026, 8, 15, hour, 0);

describe('greetingFor', () => {
  it('follows the hour of the day', () => {
    expect(greetingFor(at(8))).toBe('Good morning');
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(18))).toBe('Good evening');
  });
});

describe('firstNameOf', () => {
  it('takes the first word of a name', () => {
    expect(firstNameOf('  Jane Q. Doe ')).toBe('Jane');
  });

  it('is null without a name', () => {
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf('   ')).toBeNull();
  });
});

describe('formatToday', () => {
  it('names the weekday and date', () => {
    expect(formatToday(at(9), 'en-US')).toBe('Tuesday, September 15');
  });
});

describe('formatRelative', () => {
  const now = at(20);
  const shifted = (seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString();

  it('picks the largest whole unit', () => {
    expect(formatRelative(shifted(-3 * 3600), now, 'en-US')).toBe('3 hours ago');
    expect(formatRelative(shifted(-24 * 3600), now, 'en-US')).toBe('yesterday');
    expect(formatRelative(shifted(-3 * 7 * 24 * 3600), now, 'en-US')).toBe('3 weeks ago');
  });

  it('says now for anything under a minute', () => {
    expect(formatRelative(shifted(-20), now, 'en-US')).toBe('now');
  });
});

describe('formatCount', () => {
  it('writes small counts in full and large ones compactly', () => {
    expect(formatCount(1284, 'en-US')).toBe('1,284');
    expect(formatCount(12_900, 'en-US')).toBe('12.9K');
  });
});
