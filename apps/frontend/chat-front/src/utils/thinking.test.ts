import { expect, it } from 'vitest';
import { answerTrail, runTrail, searchWords, trailSummary } from './thinking';

it('reads the words of a search, the same way for each search tool', () => {
  expect(searchWords('search_visin', { terms: ['autonomous vehicles', 'driving'] })).toBe('autonomous vehicles, driving');
  expect(searchWords('list_projects', { search: 'road' })).toBe('road');
  expect(searchWords('list_datasets', { search: 'kitti' })).toBe('kitti');
  expect(searchWords('list_papers', { search: 'fusion' })).toBe('fusion');
  expect(searchWords('search_paper', { paper: 'p', query: 'mIoU' })).toBe('mIoU');
});
it('has no words for another tool or an empty search, and flattens and cuts what is long', () => {
  expect(searchWords('get_project', { search: 'x' })).toBeUndefined();
  expect(searchWords('list_projects', {})).toBeUndefined();
  expect(searchWords('list_projects', undefined)).toBeUndefined();
  expect(searchWords('list_projects', { search: ' \n ' })).toBeUndefined();
  expect(searchWords('list_projects', { search: 'a\n  b' })).toBe('a b');
  expect(searchWords('list_projects', { search: 'x'.repeat(100) })).toHaveLength(80);
});
it('shows a finished answer\'s searches with their words, in the order they happened', () => {
  const trail = answerTrail({
    thoughts: [{ text: 'I will search first.', at: '2026-11-20T12:00:00Z' }],
    evidence: [
      { tool: 'search_visin', input: { terms: ['driving'] }, at: '2026-11-20T12:00:01Z' },
      { tool: 'get_project', input: { project: 'p1' }, at: '2026-11-20T12:00:02Z' }
    ]
  });
  expect(trail).toEqual([
    { kind: 'thought', text: 'I will search first.' },
    { kind: 'read', tool: 'search_visin', done: true, detail: 'driving' },
    { kind: 'read', tool: 'get_project', done: true, detail: undefined }
  ]);
  expect(trailSummary(trail)).toBe('2 sources');
});
it('shows a running run\'s steps, with the words only where the server recorded them', () => {
  expect(
    runTrail([
      { tool: 'search_visin', detail: 'driving, road', startedAt: '2026-11-20T12:00:00Z' },
      { tool: 'get_project', startedAt: '2026-11-20T12:00:01Z', endedAt: '2026-11-20T12:00:02Z' },
      { thought: 'Next I will read it.', startedAt: '2026-11-20T12:00:02Z' },
      { startedAt: '2026-11-20T12:00:03Z' }
    ])
  ).toEqual([
    { kind: 'read', tool: 'search_visin', done: false, detail: 'driving, road' },
    { kind: 'read', tool: 'get_project', done: true },
    { kind: 'thought', text: 'Next I will read it.' }
  ]);
  expect(runTrail(undefined)).toEqual([]);
  expect(trailSummary([])).toBe('');
});
