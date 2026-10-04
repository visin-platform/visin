import { describe, expect, it } from 'vitest';
import type { Leaderboard, PublicLeaderboard } from '../types/evaluation';
import { latexText, leaderboardCsv, leaderboardLatex, tableFromBoard, tableFromPublic } from './leaderboardExport';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const DIGEST = 'abcdef0123456789'.repeat(4);

const board = (): Leaderboard => ({
  suite: { slug: 'road-test', version: 1, name: 'Road & rain', digest: DIGEST, headline: { key: 'mIoU_fg', direction: 'max' } },
  selection: 'latest-eligible-completed',
  scope: { candidates: 5, truncated: false },
  entries: [
    { evaluationId: 'e1', uuid: 'u1', checkpointKey: 'k1', rank: 1, attempts: 2, evidenceLevel: 'observed', receivedAt: '2026-10-01T00:00:00Z', checkpoint: { kind: 'local', label: 'clft_v2 (50%)', sha256: 'a'.repeat(64) }, summary: { headline: { key: 'mIoU_fg', value: 0.7351, direction: 'max' }, worst: { condition: 'night', value: 0.69 }, gap: 0.0451 } },
    { evaluationId: 'e2', uuid: 'u2', checkpointKey: 'k2', rank: 1, attempts: 1, evidenceLevel: 'attested', receivedAt: '2026-10-01T00:00:00Z', checkpoint: { kind: 'hf', repo: 'acme/clft', commit: COMMIT }, summary: { headline: { key: 'mIoU_fg', value: 0.7351, direction: 'max' }, worst: { condition: 'rain', value: 0.6 }, gap: 0.1 } }
  ],
  unranked: [],
  pagination: { page: 1, limit: 100, total: 2, pages: 1 },
  unrankedPagination: { page: 1, limit: 100, total: 0, pages: 0 }
});

const publicBoard = (): PublicLeaderboard => ({
  suite: { slug: 'road-test', version: 1, name: 'Road scenes', digest: DIGEST, task: 'seg', split: 'test', data: { kind: 'external', label: 'frames' }, conditions: [{ name: 'day', sampleCount: 1 }, { name: 'night', sampleCount: 1 }], headline: { key: 'mIoU_fg', direction: 'min' }, aggregation: 'pooled', evaluator: { package: 'p' } },
  selection: 'latest-eligible-completed',
  scope: { candidates: 2 },
  evidence: 'submitter-reported',
  generatedAt: '2026-10-03T12:00:00Z',
  pagination: { page: 2, limit: 1, total: 3, pages: 3 },
  entries: [{ rank: 2, evaluationId: 'p1', attempts: 1, evidenceLevel: 'reported', publishedAt: '2026-10-02T00:00:00Z', headline: 0.5, checkpoint: { kind: 'local', label: 'B', sha256: 'b'.repeat(64) }, worst: { condition: 'day', value: 0.6 }, gap: 0.1, conditions: { day: 0.6, night: 0.4 } }]
});

describe('latexText', () => {
  it('escapes every character LaTeX would take for a command', () => {
    expect(latexText('a_b & 50% $x #1 {y} ~z ^w \\n')).toBe('a\\_b \\& 50\\% \\$x \\#1 \\{y\\} \\textasciitilde{}z \\textasciicircum{}w \\textbackslash{}n');
  });
});

describe('leaderboardLatex', () => {
  const latex = leaderboardLatex(tableFromBoard(board()));

  it('is a table with one row per checkpoint, scores to four decimals, and the model names escaped', () => {
    expect(latex).toContain('\\begin{table}[t]');
    expect(latex).toContain('\\caption{Road \\& rain (road-test@1)}');
    expect(latex).toContain('Rank & Model & mIoU\\_fg & Worst condition & Gap \\\\');
    expect(latex).toContain('1 & clft\\_v2 (50\\%) & 0.7351 & night: 0.6900 & 0.0451 \\\\');
    expect(latex).toContain('1 & acme/clft @ 3f2a1c9 & 0.7351 & rain: 0.6000 & 0.1000 \\\\');
    expect(latex).toContain('\\end{table}');
  });

  it('traces the table to its suite, protocol, selection rule, evidence and every evaluation', () => {
    expect(latex).toContain(`Suite road-test@1, protocol digest ${DIGEST}.`);
    expect(latex).toContain('Higher mIoU\\_fg is better; one row per checkpoint, from its latest eligible completed evaluation, never its best repeat; ties share a rank.');
    expect(latex).toContain('Evidence: observed, attested, as reported by the submitters and not verified by Visin.');
    expect(latex).toContain('Evaluations: 1:e1, 1:e2.');
  });

  it('adds a column for each condition the public ranking carries, says lower is better, and names the page', () => {
    const out = leaderboardLatex(tableFromPublic(publicBoard()));
    expect(out).toContain('Rank & Model & mIoU\\_fg & day & night & Worst condition & Gap \\\\');
    expect(out).toContain('2 & B & 0.5000 & 0.6000 & 0.4000 & day: 0.6000 & 0.1000 \\\\');
    expect(out).toContain('Lower mIoU\\_fg is better');
    expect(out).toContain('Page 2 of 3 (3 checkpoints); ranks are over all pages.');
    expect(out).toContain('Evidence: reported, as reported');
  });

  it('prints a dash for a condition a row has no score in, never a zero', () => {
    const table = tableFromPublic(publicBoard());
    table.rows.push({ ...table.rows[0], rank: 3, evaluationId: 'p2', conditions: { day: 0.3 } });
    expect(leaderboardLatex(table)).toContain('3 & B & 0.5000 & 0.3000 & -- & day: 0.6000 & 0.1000 \\\\');
  });

  it('leaves out the page and evidence lines when there is only one page and no evidence level', () => {
    const table = tableFromBoard(board());
    table.rows.forEach(row => { row.evidence = undefined; });
    const out = leaderboardLatex(table);
    expect(out).not.toContain('Page ');
    expect(out).not.toContain('Evidence:');
  });
});

describe('leaderboardCsv', () => {
  it('carries the trace in columns, quotes every field, and makes a formula-looking model name inert', () => {
    const table = tableFromBoard(board());
    table.rows[0].model = '=SUM(A1) "best"';
    const lines = leaderboardCsv(table).trimEnd().split('\n');
    expect(lines[0]).toBe('"suite","digest","rank","model","mIoU_fg","worst_condition","worst_value","gap","attempts","evidence","evaluation_id"');
    expect(lines[1]).toBe(`"road-test@1","${DIGEST}","1","'=SUM(A1) ""best""","0.7351","night","0.69","0.0451","2","observed","e1"`);
    expect(lines[2]).toContain('"acme/clft @ 3f2a1c9"');
    expect(lines).toHaveLength(3);
  });

  it('keeps a negative score a number, while still making a text that looks like a formula inert', () => {
    const table = tableFromBoard(board());
    table.rows[0].headline = -0.52;
    table.rows[0].worst = { condition: '-night', value: -1.5 };
    table.rows[0].gap = -0.25;
    const [, line] = leaderboardCsv(table).trimEnd().split('\n');
    expect(line).toContain('"-0.52","\'-night","-1.5","-0.25"');
  });

  it('has a column per condition with an empty cell where a row has none', () => {
    const table = tableFromPublic(publicBoard());
    table.rows.push({ ...table.rows[0], rank: 3, evaluationId: 'p2', conditions: { day: 0.3 } });
    const lines = leaderboardCsv(table).trimEnd().split('\n');
    expect(lines[0]).toContain('"mIoU_fg","day","night","worst_condition"');
    expect(lines[1]).toContain('"0.5","0.6","0.4","day"');
    expect(lines[2]).toContain('"0.5","0.3","","day"');
  });
});
