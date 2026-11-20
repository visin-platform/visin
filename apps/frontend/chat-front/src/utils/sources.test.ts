import { expect, it } from 'vitest';
import { pageRanges, sourceLabel, sourceLinks } from './sources';

const RUN = '64b1f0c2a3b4c5d6e7f80912';
const PROJECT = '74b1f0c2a3b4c5d6e7f80913';
const DATASET = '84b1f0c2a3b4c5d6e7f80914';
const PAPER = '94b1f0c2a3b4c5d6e7f80915';
const at = '2026-11-20T12:00:00Z';
const evidence = (...reads: [string, Record<string, unknown>][]) => ({
  evidence: reads.map(([tool, input]) => ({ tool, input, at }))
});

it('links every kind of thing Vivi read, once each', () => {
  const links = sourceLinks(
    evidence(
      ['get_training', { training: RUN }],
      ['get_training_curve', { training: RUN }],
      ['compare_trainings', { trainings: [RUN, '54b1f0c2a3b4c5d6e7f80999'] }],
      ['get_project', { project: PROJECT }],
      ['get_dataset', { dataset: DATASET }],
      ['get_paper', { paper: PAPER }],
      ['get_leaderboard', { suite: 'road-seg@2' }]
    )
  );
  expect(links.map((link) => link.href)).toEqual([
    `/trainings/${RUN}`,
    '/trainings/54b1f0c2a3b4c5d6e7f80999',
    `/projects/${PROJECT}`,
    `/datasets/${DATASET}`,
    `/papers/${PAPER}`,
    '/suites/road-seg/2'
  ]);
});
it('names the pages of a paper that were read, merged and in order', () => {
  const [paper] = sourceLinks(
    evidence(
      ['get_paper', { paper: PAPER }],
      ['read_paper_pages', { paper: PAPER, from: 5, to: 6 }],
      ['read_paper_pages', { paper: PAPER, from: 3, to: 5 }],
      ['read_paper_pages', { paper: PAPER, from: 9 }]
    )
  );
  expect(paper.pages).toBe('3–6, 9');
  expect(sourceLabel(paper)).toBe(`Paper ${PAPER.slice(-6)}, p. 3–6, 9`);
});
it('links nothing a model merely typed: only a well-formed id, and a suite as slug@version', () => {
  expect(
    sourceLinks(
      evidence(
        ['get_project', { project: 'road' }],
        ['get_project', { project: '../admin' }],
        ['get_leaderboard', { suite: 'road-seg' }],
        ['get_leaderboard', { suite: 'road-seg@latest' }],
        ['get_leaderboard', { suite: '../x@1' }],
        ['search_visin', { terms: ['driving'] }]
      )
    )
  ).toEqual([]);
});
it('has no links for an answer that read nothing', () => {
  expect(sourceLinks({ evidence: [] })).toEqual([]);
});
it('labels a run by the name it was asked about, and the rest by what they are', () => {
  const [run, project] = sourceLinks(evidence(['get_training', { training: RUN }], ['get_project', { project: PROJECT }]));
  expect(sourceLabel(run, 'yolo-b')).toBe('yolo-b');
  expect(sourceLabel(run)).toBe(`Run ${RUN.slice(-6)}`);
  expect(sourceLabel(project)).toBe(`Project ${PROJECT.slice(-6)}`);
});
it('writes page ranges the way a reader does', () => {
  expect(pageRanges([3, 4, 5, 9])).toBe('3–5, 9');
  expect(pageRanges([2])).toBe('2');
  expect(pageRanges([])).toBe('');
});
