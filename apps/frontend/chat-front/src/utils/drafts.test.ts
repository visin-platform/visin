import { expect, it } from 'vitest';
import type { Draft, Message } from '../types/chat';
import { visibleDrafts } from './drafts';

const draft = (patch: Partial<Draft> = {}): Draft => ({ runId: 'r1', messageId: 'q1', text: 'Partial', ...patch });
const message = (patch: Partial<Message> = {}): Message => ({
  _id: 'm1',
  kind: 'assistant',
  senderName: 'Visin analyst',
  body: 'Final',
  seq: 2,
  createdAt: '2026-11-10T10:00:00Z',
  evidence: [],
  ...patch
});

it('shows a draft that has something written and no answer yet', () => {
  expect(visibleDrafts([draft()], [message({ replyTo: 'other-question' })])).toEqual([draft()]);
  expect(visibleDrafts([], [])).toEqual([]);
});

it('hides a draft once its answer is a message, so the text never appears twice', () => {
  expect(visibleDrafts([draft()], [message({ replyTo: 'q1' })])).toEqual([]);
});

it('is not hidden by a person’s own message that merely replies to the same question', () => {
  expect(visibleDrafts([draft()], [message({ kind: 'person', replyTo: 'q1' })])).toEqual([draft()]);
});

it('shows nothing for an empty draft, and each draft is judged on its own', () => {
  expect(visibleDrafts([draft({ text: '' })], [])).toEqual([]);
  const two = [draft(), draft({ runId: 'r2', messageId: 'q2', text: 'Second' })];
  expect(visibleDrafts(two, [message({ replyTo: 'q1' })]).map((d) => d.runId)).toEqual(['r2']);
});
