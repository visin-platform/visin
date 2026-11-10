import { ApiError } from '@visin/frontend-core';
import { expect, it } from 'vitest';
import { refusalMessage, resetTime } from './refusal';

it('names the daily allowance and when it returns', () => {
  const message = refusalMessage(new ApiError(429, 'x', { reason: 'session', resetAt: '2026-11-11T00:00:00Z' }), 3);
  expect(message).toMatch(/^You've used today's 3 questions\. Sign in to keep going, or come back after /);
});

it('falls back to "tomorrow" for a missing or unreadable reset time', () => {
  expect(resetTime(undefined)).toBe('tomorrow');
  expect(resetTime('not a date')).toBe('tomorrow');
});

it('adds the day when the reset is not today', () => {
  const now = new Date('2026-11-10T12:00:00');
  expect(resetTime('2026-11-10T20:00:00', now)).not.toMatch(/[A-Z][a-z]{2} /);
  expect(resetTime('2026-11-12T20:00:00', now)).toMatch(/[A-Z][a-z]{2}/);
});

it('treats an unknown or missing reason as a shared pause, and passes other errors through', () => {
  expect(refusalMessage(new ApiError(429, 'x'), 3)).toMatch(/paused right now/);
  expect(refusalMessage(new Error('Network down'), 3)).toBe('Network down');
  expect(refusalMessage('odd', 3)).toBe('Could not submit the question');
});
