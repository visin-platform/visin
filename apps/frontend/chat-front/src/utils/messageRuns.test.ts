import { describe, expect, it } from 'vitest';
import type { Message } from '../types/chat';
import { continuesRun } from './messageRuns';

const message = (overrides: Partial<Message> = {}): Message =>
  ({
    _id: 'm',
    kind: 'person',
    senderId: 'alice',
    senderName: 'Alice',
    body: 'hi',
    seq: 1,
    createdAt: '2026-11-10T12:00:00Z',
    evidence: [],
    ...overrides
  }) as Message;

describe('continuesRun', () => {
  it('joins messages from one sender within two minutes', () => {
    expect(continuesRun(message(), message({ createdAt: '2026-11-10T12:01:59Z' }))).toBe(true);
  });

  it('breaks on a pause, another sender, or a missing neighbour', () => {
    expect(continuesRun(message(), message({ createdAt: '2026-11-10T12:02:01Z' }))).toBe(false);
    expect(continuesRun(message(), message({ senderId: 'bob', senderName: 'Bob' }))).toBe(false);
    expect(continuesRun(message(), message({ kind: 'assistant', senderId: undefined }))).toBe(false);
    expect(continuesRun(message(), undefined)).toBe(false);
    expect(continuesRun(undefined, message())).toBe(false);
  });

  it('never runs a notice into anything', () => {
    expect(continuesRun(message({ kind: 'system' }), message({ kind: 'system' }))).toBe(false);
  });

  it('breaks at midnight even inside the window', () => {
    const late = new Date(2026, 10, 10, 23, 59, 30).toISOString();
    const early = new Date(2026, 10, 11, 0, 0, 30).toISOString();
    expect(continuesRun(message({ createdAt: late }), message({ createdAt: early }))).toBe(false);
  });
});
