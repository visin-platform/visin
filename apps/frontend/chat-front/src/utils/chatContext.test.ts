import { afterEach, describe, expect, it } from 'vitest';
import type { Conversation } from '../types/chat';
import { aboutLabel, analysisOf, assistantChat, contextKey, requestFromUrl, sameAbout } from './chatContext';
it('finds the one chat with an assistant, and keeps assistants apart', () => {
  const chats = [
    { _id: 'direct', kind: 'direct' },
    { _id: 'two', kind: 'assistant', assistantId: 'a2' },
    { _id: 'one', kind: 'assistant', assistantId: 'a1' }
  ] as unknown as Conversation[];
  expect(assistantChat(chats, 'a1')?._id).toBe('one');
  expect(assistantChat(chats, 'a3')).toBeUndefined();
  // With no assistant named, the first private chat in the list.
  expect(assistantChat(chats)?._id).toBe('two');
  expect(assistantChat([chats[0]], undefined)).toBeUndefined();
});

it('says in words what a question is about, and nothing when it is about nothing', () => {
  expect(aboutLabel(undefined)).toBe('');
  expect(aboutLabel({ title: 'General' })).toBe('');
  expect(aboutLabel({ projectId: 'p1', projectName: 'IseAuto', trainingIds: [] })).toBe('IseAuto');
  expect(aboutLabel({ projectId: 'p1', projectName: 'IseAuto', trainingIds: ['a', 'b'] })).toBe('IseAuto · 2 runs');
  expect(
    aboutLabel({ projectId: 'p1', projectName: 'IseAuto', trainingIds: ['a'], trainingLabels: [{ id: 'a', name: 'run-7' }] })
  ).toBe('IseAuto · run-7');
  expect(aboutLabel({ projectId: 'p1', title: 'IseAuto trainings' })).toBe('IseAuto trainings');
  expect(aboutLabel({ projectId: 'p1', trainingIds: ['a', 'b'], title: 'Compare 2 runs' })).toBe('Compare 2 runs');
  expect(aboutLabel({ projectId: 'p1', projectName: 'IseAuto', trainingIds: ['a'], title: 'run-9' })).toBe('IseAuto · run-9');
  expect(aboutLabel({ projectId: 'p1' })).toBe('Project');
  expect(aboutLabel({ paperId: 'x', paperTitle: 'CLFTv2' })).toBe('Paper: CLFTv2');
});

it('treats the same project and runs, in any order, as the same thing asked about', () => {
  expect(sameAbout({ projectId: 'p', trainingIds: ['a', 'b'] }, { projectId: 'p', trainingIds: ['b', 'a'] })).toBe(true);
  expect(sameAbout({ projectId: 'p', trainingIds: ['a'] }, { projectId: 'p', trainingIds: [] })).toBe(false);
  expect(sameAbout(undefined, { paperId: 'x' })).toBe(false);
  expect(sameAbout(undefined, undefined)).toBe(true);
});

it('names a paper by itself as a context', () => {
  expect(contextKey({ paperId: 'paper1' })).toBe('paper:paper1');
});

it('carries the paper through a request to analyse it', () => {
  expect(analysisOf({ kind: 'assistant', paperId: 'paper1', title: 'CLFTv2' })).toMatchObject({
    paperId: 'paper1',
    title: 'CLFTv2'
  });
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
