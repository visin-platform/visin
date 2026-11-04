import { expect, it } from 'vitest';
import type { Conversation } from '../types/chat';
import { matchesContext } from './chatContext';
it('keeps assistants separate when reusing project analysis conversations', () => {
  const conversation = { kind: 'assistant', projectId: 'p1', trainingIds: ['t1'], assistantId: 'a1' } as Conversation;
  expect(matchesContext(conversation, { projectId: 'p1', trainingIds: ['t1'], assistantId: 'a1' })).toBe(true);
  expect(matchesContext(conversation, { projectId: 'p1', trainingIds: ['t1'], assistantId: 'a2' })).toBe(false);
  expect(matchesContext(conversation, { projectId: 'p1', trainingIds: ['t1'] })).toBe(false);
});
