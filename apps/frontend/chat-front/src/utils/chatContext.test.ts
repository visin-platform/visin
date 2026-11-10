import { afterEach, describe, expect, it } from 'vitest';
import type { Conversation } from '../types/chat';
import { analysisOf, contextKey, matchesContext, requestFromUrl, starters } from './chatContext';
it('keeps assistants separate when reusing project analysis conversations', () => {
  const conversation = { kind: 'assistant', projectId: 'p1', trainingIds: ['t1'], assistantId: 'a1' } as Conversation;
  expect(matchesContext(conversation, { projectId: 'p1', trainingIds: ['t1'], assistantId: 'a1' })).toBe(true);
  expect(matchesContext(conversation, { projectId: 'p1', trainingIds: ['t1'], assistantId: 'a2' })).toBe(false);
  expect(matchesContext(conversation, { projectId: 'p1', trainingIds: ['t1'] })).toBe(false);
});

it('reuses the thread already about the same paper, and no other', () => {
  const conversation = { kind: 'assistant', paperId: 'paper1', trainingIds: [] } as unknown as Conversation;
  expect(contextKey({ paperId: 'paper1' })).toBe('paper:paper1');
  expect(matchesContext(conversation, { paperId: 'paper1' })).toBe(true);
  expect(matchesContext(conversation, { paperId: 'paper2' })).toBe(false);
  // A project's analysis is never mistaken for a paper's, even with no runs selected.
  expect(
    matchesContext({ kind: 'assistant', projectId: 'p1', trainingIds: [] } as unknown as Conversation, {
      paperId: 'paper1'
    })
  ).toBe(false);
});

it('carries the paper through a request to analyse it', () => {
  expect(analysisOf({ kind: 'assistant', paperId: 'paper1', title: 'CLFTv2' })).toMatchObject({
    paperId: 'paper1',
    title: 'CLFTv2'
  });
});

it('offers questions about a paper: what it says, where its results are, and whether they hold', () => {
  const asked = starters({ paperId: 'paper1' });
  expect(asked).toContain('Summarize this paper');
  expect(asked.join(' ')).toMatch(/recorded runs/);
  expect(asked.join(' ')).not.toMatch(/epoch|configuration/);
});

describe('opening chat from an address', () => {
  const at = (query: string) => window.history.replaceState(null, '', `/chat${query}`);
  afterEach(() => at(''));

  it('opens a paper from /chat?paper=…', () => {
    at('?paper=paper1&title=CLFTv2');
    expect(requestFromUrl()).toEqual({ kind: 'assistant', paperId: 'paper1', title: 'CLFTv2' });
  });

  it('still opens a project, and a project wins over a stray paper', () => {
    at('?project=p1&runs=t1,t2&paper=paper1');
    expect(requestFromUrl()).toMatchObject({ projectId: 'p1', trainingIds: ['t1', 't2'] });
    expect(requestFromUrl()).not.toHaveProperty('paperId');
    at('');
    expect(requestFromUrl()).toBeUndefined();
  });
});
