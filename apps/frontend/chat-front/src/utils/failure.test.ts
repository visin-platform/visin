import { expect, it } from 'vitest';
import { failureNote, resetTime } from './failure';

const NOON = new Date('2026-11-20T12:00:00Z');

it('says when the allowance resets, in the reader\'s clock, and offers no retry', () => {
  const note = failureNote({ error: 'Your daily Vivi question allowance is used.', failureCode: 'limit_reached' }, '2026-11-21T00:00:00Z');
  expect(note.retry).toBe(false);
  expect(note.text).toContain('You have used today’s Vivi allowance. It resets at ');
  expect(note.text).toContain('(your time)');
});
it('falls back to midnight UTC when it does not know the time', () => {
  expect(failureNote({ failureCode: 'limit_reached' }).text).toContain('resets at midnight UTC');
});
it.each([
  ['assistant_off', /administrator/, false],
  ['no_access', /no longer see/, false],
  ['timeout', /took too long/, true],
  ['stopped', /stopped/, true],
  ['busy', /still running/, true],
  ['access_changed', /terms changed/, true],
  ['interrupted', /interrupted/, true]
])('says what to do after %s', (failureCode, pattern, retry) => {
  const note = failureNote({ failureCode: failureCode as never });
  expect(note.text).toMatch(pattern);
  expect(note.retry).toBe(retry);
});
it('keeps the server\'s sentence for a provider error, and for a code it does not know', () => {
  expect(failureNote({ error: 'The assistant provider reported an error. Try again later.', failureCode: 'provider_error' })).toEqual({
    text: 'The assistant provider reported an error. Try again later.',
    retry: true
  });
  expect(failureNote({ error: 'Something new', failureCode: 'from-the-future' as never })).toEqual({ text: 'Something new', retry: true });
  expect(failureNote({})).toEqual({ text: 'The analysis failed.', retry: true });
});
it('keeps the server\'s own limit for an image, and offers no retry of the same one', () => {
  const note = failureNote({ failureCode: 'image', error: 'The image is too large to analyze. Choose an image up to 4 MB.' });
  expect(note.text).toBe('The image is too large to analyze. Choose an image up to 4 MB.');
  expect(note.text).not.toContain('narrower');
  expect(note.retry).toBe(false);
});
it('asks for a narrower question once, whatever the server said', () => {
  const note = failureNote({ error: 'Analysis reached its tool-round limit. Ask a narrower question.', failureCode: 'too_large' });
  expect(note.text.match(/narrower question/g)).toHaveLength(1);
  expect(note.retry).toBe(false);
});
it('gives a time only for a real date, naming the day when it is not today', () => {
  expect(resetTime(undefined)).toBeUndefined();
  expect(resetTime('not a date')).toBeUndefined();
  expect(resetTime('2026-11-21T00:00:00Z', NOON)).toMatch(/\w/);
});
