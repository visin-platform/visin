import { describe, expect, it } from 'vitest';
import type { Conversation } from './api';
import { unreadCount } from './unread';

const room = (readSeq: number, joinedSeq?: number): Conversation => ({
  _id: 'r1',
  kind: 'room',
  title: 'Room',
  trainingIds: [],
  seq: 12,
  lastMessageSeq: 12,
  participants: [{ userId: 'alice', name: 'Alice', state: 'active', role: 'member', readSeq, joinedSeq }]
});

describe('unreadCount', () => {
  it('counts the messages after the last one read', () => {
    expect(unreadCount(room(9), 'alice')).toBe(3);
    expect(unreadCount(room(12), 'alice')).toBe(0);
  });
  it('does not count room history from before the reader joined', () => {
    expect(unreadCount(room(0, 10), 'alice')).toBe(2);
  });
  it('counts everything in a channel the reader has never opened', () => {
    expect(unreadCount(room(0), 'bob')).toBe(12);
  });
});
