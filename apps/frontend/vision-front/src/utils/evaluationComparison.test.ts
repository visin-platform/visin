import { describe, expect, it } from 'vitest';
import type { Evaluation, Suite } from '../types/evaluation';
import { compareEvaluations, NotComparable, suiteMetrics } from './evaluationComparison';

const DIGEST = 'd'.repeat(64);
const suite = (over: Partial<Suite['protocol']> = {}): Suite => ({
  _id: 's1', slug: 'road-test', version: 1, name: 'Road', projectId: 'p', visibility: 'public', submissions: 'open', createdBy: 'u', digest: DIGEST, createdAt: '', updatedAt: '',
  protocol: {
    task: 'seg', data: { kind: 'external', label: 'x', manifestSha256: 'a'.repeat(64) }, split: 'test',
    conditions: [{ name: 'day', sampleCount: 10 }, { name: 'night', sampleCount: 5 }], classes: [], ignoredClasses: [],
    metrics: [{ key: 'latency', direction: 'min' }, { key: 'mIoU', direction: 'max', headline: true }],
    aggregation: 'pooled', input: {}, evaluator: { package: 'p' }, ...over
  }
});

const scores = (day: number, night: number, overall: number, latency = [10, 12, 11]) => ({
  conditions: { day: { mIoU: day, latency: latency[0] }, night: { mIoU: night, latency: latency[1] } },
  overall: { mIoU: overall, latency: latency[2] }
});

const evaluation = (id: string, result?: ReturnType<typeof scores>, over: Partial<Evaluation> = {}): Evaluation => ({
  _id: id, uuid: id, projectId: 'p', ownerId: 'o', status: 'completed', receivedAt: '', createdAt: '',
  suite: { id: 's1', slug: 'road-test', version: 1, digest: DIGEST },
  validation: { version: 2, state: result ? 'eligible' : 'incomplete', reasons: [], warnings: [], ...(result ? { scores: result } : {}) },
  ...over
});

describe('compareEvaluations', () => {
  it('compares the overall figure and each declared condition on the headline, in the suite\'s direction', () => {
    const result = compareEvaluations(suite(), evaluation('a', scores(0.8, 0.6, 0.7)), evaluation('b', scores(0.82, 0.55, 0.7)));
    expect(result.metric).toEqual({ key: 'mIoU', direction: 'max' });
    expect(result.rows.map(row => [row.scope, row.verdict])).toEqual([['overall', 'same'], ['day', 'better'], ['night', 'worse']]);
    expect(result.rows[1]).toMatchObject({ baseline: 0.8, candidate: 0.82, improvement: expect.closeTo(0.02), delta: expect.closeTo(0.02) });
    expect(result.rows[2].improvement).toBeCloseTo(-0.05);
    expect(result.problems).toEqual([]);
  });

  it('reads a lower-is-better metric the other way round: a rise is worse', () => {
    const result = compareEvaluations(suite(), evaluation('a', scores(0.8, 0.6, 0.7)), evaluation('b', scores(0.8, 0.6, 0.7, [9, 13, 11])), 'latency');
    expect(result.metric.direction).toBe('min');
    expect(result.rows.map(row => [row.scope, row.verdict])).toEqual([['overall', 'same'], ['day', 'better'], ['night', 'worse']]);
    expect(result.rows[2]).toMatchObject({ delta: 1, improvement: -1 });
  });

  it('shows a score one side lacks as missing, never as a zero, and says which conditions each side covers', () => {
    const thin = scores(0.8, 0.6, 0.7);
    delete (thin.conditions as Record<string, unknown>).night;
    const result = compareEvaluations(suite(), evaluation('a', scores(0.8, 0.6, 0.7)), evaluation('b', thin));
    const night = result.rows.find(row => row.scope === 'night')!;
    expect(night).toEqual({ scope: 'night', baseline: 0.6, candidate: undefined, verdict: 'missing' });
    expect(result.coverage).toEqual({ declared: ['day', 'night'], baseline: ['day', 'night'], candidate: ['day'] });
  });

  it('keeps a valid zero as a score', () => {
    const result = compareEvaluations(suite(), evaluation('a', scores(0.8, 0, 0.7)), evaluation('b', scores(0.8, 0, 0.7)));
    expect(result.rows.find(row => row.scope === 'night')).toMatchObject({ baseline: 0, candidate: 0, verdict: 'same' });
  });

  it('says an evaluation that is not ranked has no scores, and shows every score as missing', () => {
    const result = compareEvaluations(suite(), evaluation('a', scores(0.8, 0.6, 0.7)), evaluation('b'));
    expect(result.rows.every(row => row.verdict === 'missing')).toBe(true);
    expect(result.problems).toEqual(['The second checkpoint is incomplete, so it has no ranked scores to compare.']);
    expect(result.coverage.candidate).toEqual([]);
  });

  it('refuses another suite version, no suite, or another protocol', () => {
    const base = evaluation('a', scores(0.8, 0.6, 0.7));
    expect(() => compareEvaluations(suite(), base, evaluation('b', scores(1, 1, 1), { suite: { id: 's2', slug: 'road-test', version: 2, digest: DIGEST } }))).toThrow(/second checkpoint is on road-test@2, not road-test@1/);
    expect(() => compareEvaluations(suite(), base, evaluation('b', scores(1, 1, 1), { suite: undefined }))).toThrow(/on no suite/);
    expect(() => compareEvaluations(suite(), base, evaluation('b', scores(1, 1, 1), { suite: { id: 's1', slug: 'road-test', version: 1, digest: 'e'.repeat(64) } }))).toThrow(NotComparable);
    expect(() => compareEvaluations(suite(), evaluation('a', scores(1, 1, 1), { suite: { id: 's9', slug: 'other', version: 1, digest: DIGEST } }), base)).toThrow(/first checkpoint is on other@1/);
  });

  it('falls back to the first metric when none is the headline, and refuses a suite with none', () => {
    const noHeadline = suite({ metrics: [{ key: 'mIoU', direction: 'max' }] });
    expect(compareEvaluations(noHeadline, evaluation('a', scores(1, 1, 1)), evaluation('b', scores(1, 1, 1))).metric.key).toBe('mIoU');
    expect(() => compareEvaluations(suite({ metrics: [] }), evaluation('a', scores(1, 1, 1)), evaluation('b', scores(1, 1, 1)))).toThrow(/names no metric/);
  });

  it('lists the headline metric first', () => {
    expect(suiteMetrics(suite()).map(metric => metric.key)).toEqual(['mIoU', 'latency']);
  });
});
