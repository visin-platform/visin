import { afterEach, describe, expect, it } from 'vitest';
import type { Conversation } from '../types/chat';
import { aboutLabel, analysisOf, assistantChat, contextKey, placeOf, requestFromUrl, sameAbout, samePage } from './chatContext';
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

it('carries a page with nothing else to hand over, and only a path of this app', () => {
  expect(analysisOf({ kind: 'assistant', page: '/datasets/d1', title: 'Road scenes' })).toMatchObject({
    page: '/datasets/d1'
  });
  for (const page of ['//example.com/x', 'https://example.com/', '/\\example.com', 'datasets/d1'])
    expect(analysisOf({ kind: 'assistant', page })).not.toHaveProperty('page');
  expect(contextKey({ page: '/suites/road/2' })).toBe('page:/suites/road/2');
  // A project or paper names the context; the page is only for what has neither.
  expect(contextKey({ projectId: 'p1', page: '/datasets/d1' })).toBe('p1:');
  expect(aboutLabel({ page: '/datasets/d1', title: 'Road scenes' })).toBe('Road scenes');
  expect(aboutLabel({ page: '/datasets/d1' })).toBe('This page');
});

it('names a page with nothing else to hand over from its address, and nothing else', () => {
  expect(placeOf('/datasets/d1?tab=images')).toEqual({ page: '/datasets/d1?tab=images', title: 'This dataset' });
  expect(placeOf('/leaderboards/road-seg/2/judges')).toMatchObject({ title: 'Suite road-seg v2' });
  expect(placeOf('/evaluations/e1')).toMatchObject({ title: 'This evaluation' });
  for (const path of ['/datasets', '/projects/p1', '/suites/road/latest', '/evaluations/e1/compare/e2'])
    expect(placeOf(path)).toBeUndefined();
  expect(samePage('/datasets/d1?tab=a', '/datasets/d1')).toBe(true);
  expect(samePage('/datasets/d1', '/datasets/d2')).toBe(false);
});

describe('opening chat from an address', () => {
  const at = (query: string) => window.history.replaceState(null, '', `/chat${query}`);
  afterEach(() => at(''));

  it('opens a paper from /chat?paper=…', () => {
    at('?paper=paper1&title=CLFTv2');
    expect(requestFromUrl()).toEqual({ kind: 'assistant', paperId: 'paper1', title: 'CLFTv2' });
  });

  it('opens on a page from /chat?page=…, never on another site', () => {
    at('?page=%2Fdatasets%2Fd1&title=Road%20scenes');
    expect(requestFromUrl()).toEqual({ kind: 'assistant', page: '/datasets/d1', title: 'Road scenes' });
    at('?page=%2F%2Fexample.com');
    expect(requestFromUrl()).toBeUndefined();
  });

  it('still opens a project, and a project wins over a stray paper', () => {
    at('?project=p1&runs=t1,t2&paper=paper1');
    expect(requestFromUrl()).toMatchObject({ projectId: 'p1', trainingIds: ['t1', 't2'] });
    expect(requestFromUrl()).not.toHaveProperty('paperId');
    at('');
    expect(requestFromUrl()).toBeUndefined();
  });
});
