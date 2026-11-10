import { expect, it } from 'vitest';
import { applyMessageUpdates, mergeMessages } from './messages';
import type { Message } from '../types/chat';
const original: Message = {
  _id: 'm1',
  kind: 'person',
  senderName: 'Alice',
  body: 'Secret original',
  seq: 1,
  createdAt: '',
  evidence: []
};
it('prevents stale HTTP and SSE snapshots from resurrecting an unsent message', () => {
  const removed = applyMessageUpdates(
    [original],
    [{ _id: 'm1', revision: 2, unsentAt: '2026-11-10T12:00:00Z', reactions: [] }]
  );
  expect(mergeMessages(removed, [original])[0].body).toBe('');
  expect(
    applyMessageUpdates(removed, [{ _id: 'm1', revision: 1, reactions: [{ userId: 'bob', emoji: '👍' }] }])[0].reactions
  ).toEqual([]);
});
it('redacts loaded quotes even when the original message is outside the loaded page', () => {
  const reply = {
    ...original,
    _id: 'm2',
    seq: 2,
    body: 'Reply',
    quote: { messageId: 'm1', kind: 'person' as const, senderName: 'Alice', body: 'Secret original' }
  };
  expect(
    applyMessageUpdates([reply], [{ _id: 'm1', revision: 1, unsentAt: '2026-11-10T12:00:00Z' }])[0].quote?.body
  ).toBe('Message unsent');
});
