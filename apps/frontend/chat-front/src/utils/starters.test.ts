import { expect, it } from 'vitest';
import { startersFor } from './starters';

const questions = (path: string) => startersFor(path).map((starter) => starter.question);

it('offers questions about a run on a run page, whatever tab it is on', () => {
  const run = '/trainings/64b1f0c2a3b4c5d6e7f80912';
  expect(questions(run)[0]).toBe('How is this run doing?');
  expect(questions(`${run}?tab=epochs&frame=abc`)).toEqual(questions(run));
});
it('tells a comparison from a run, and a new paper from a paper', () => {
  expect(questions('/trainings/compare?ids=a,b')[0]).toMatch(/these runs/);
  expect(questions('/papers/new')).not.toContain('Summarise this paper.');
  expect(questions('/papers/64b1f0c2a3b4c5d6e7f80912')).toContain('Summarise this paper.');
});
it.each([
  ['/projects/64b1f0c2a3b4c5d6e7f80912', /this project/],
  ['/datasets/64b1f0c2a3b4c5d6e7f80912', /this dataset/],
  ['/suites/road-seg/2', /leaderboard/],
  ['/leaderboards/road-seg/2/judges', /leaderboard/]
])('fits %s', (path, pattern) => {
  expect(questions(path).join(' ')).toMatch(pattern);
});
it('asks about Visin in general anywhere else, and never offers nothing', () => {
  for (const path of ['/', '/chat', '/account', '/trainings', '/unknown/page'])
    expect(startersFor(path).length).toBeGreaterThanOrEqual(3);
  expect(questions('/chat')[0]).toBe('What projects are on Visin?');
});
it('gives each starter a short label and a whole question', () => {
  for (const path of ['/', '/trainings/abc', '/projects/abc', '/papers/abc', '/datasets/abc', '/suites/a/1'])
    for (const starter of startersFor(path)) {
      expect(starter.label.length).toBeLessThanOrEqual(30);
      expect(starter.question.endsWith('?') || starter.question.endsWith('.')).toBe(true);
    }
});

it('offers questions about one evaluation on its page', () => {
  expect(startersFor('/evaluations/e1').map((starter) => starter.label)).toContain('Where is it weakest?');
  expect(startersFor('/evaluations/e1/compare/e2')).toEqual(startersFor('/'));
});
