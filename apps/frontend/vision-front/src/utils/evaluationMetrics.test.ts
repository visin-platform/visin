import { describe, expect, it } from 'vitest';
import type { RunEvaluation } from '../types';
import { AVERAGED_METRICS, averageAcrossConditions, bestPerRun, overallMean } from './evaluationMetrics';

const result = (id: string, run: string | null, epoch: number, results: Record<string, unknown>, timestamp = '2026-01-01T00:00:00Z') =>
  ({
    _id: id,
    test_uuid: id,
    epoch,
    epoch_uuid: `e${id}`,
    timestamp,
    test_results: results,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(run ? { training: { _id: run, name: `Run ${run}`, uuid: `u${run}`, status: 'completed' } } : {})
  }) as unknown as RunEvaluation;

const withOverall = (value: number) => ({ day: { overall: { mean_iou: value } } });
const higher = (a: number, b: number) => a > b;
const lower = (a: number, b: number) => a < b;

describe('testResultMetrics', () => {
  it('averages a per-class metric over classes, then conditions, and reads a genuine zero', () => {
    const results = {
      day: { car: { iou: 0.8 }, person: { iou: 0 }, overall: { mean_iou: 0.9 } },
      night: { car: { iou: 0.6 } }
    };
    expect(averageAcrossConditions(results as never, 'iou')).toBeCloseTo((0.4 + 0.6) / 2);
    expect(averageAcrossConditions(results as never, 'recall')).toBeUndefined();
    expect(AVERAGED_METRICS).toContain('iou');
  });

  it('reads a summary metric from the conditions that report an overall block', () => {
    expect(overallMean({ day: { overall: { mean_iou: 0.5 } }, night: { overall: { mean_iou: 0.7 } } } as never, 'mean_iou')).toBeCloseTo(0.6);
    expect(overallMean({ overall: { mean_iou: 0.4 } } as never, 'mean_iou')).toBeCloseTo(0.4);
    expect(overallMean({ day: { car: { iou: 1 } } } as never, 'mean_iou')).toBeUndefined();
  });

  it('keeps one row per run at its best test, ranked best first', () => {
    const rows = bestPerRun(
      [
        result('a1', 'A', 5, withOverall(0.5)),
        result('a2', 'A', 10, withOverall(0.8)),
        result('b1', 'B', 7, withOverall(0.9)),
        result('c1', 'C', 3, withOverall(0.3))
      ],
      { key: 'mean_iou', source: 'overall' },
      higher
    );

    expect(rows.map((row) => [row.result._id, row.value, row.tests])).toEqual([
      ['b1', 0.9, 1],
      ['a2', 0.8, 2],
      ['c1', 0.3, 1]
    ]);
  });

  it('reads the direction the project gives: for a loss, the lowest is best', () => {
    const loss = (value: number) => ({ day: { overall: { loss: value } } });
    const rows = bestPerRun(
      [result('a1', 'A', 5, loss(0.9)), result('a2', 'A', 10, loss(0.2)), result('b1', 'B', 7, loss(0.5))],
      { key: 'loss', source: 'overall' },
      lower
    );

    expect(rows.map((row) => row.result._id)).toEqual(['a2', 'b1']);
  });

  it('breaks a tie to the later epoch, and puts runs with no value last, newest first', () => {
    const rows = bestPerRun(
      [
        result('a1', 'A', 5, withOverall(0.7)),
        result('a2', 'A', 9, withOverall(0.7)),
        result('x1', 'X', 1, {}, '2026-01-01T00:00:00Z'),
        result('y1', 'Y', 1, {}, '2026-02-01T00:00:00Z'),
        result('loose', null, 1, withOverall(0.1))
      ],
      { key: 'mean_iou', source: 'overall' },
      higher
    );

    expect(rows.map((row) => row.result._id)).toEqual(['a2', 'loose', 'y1', 'x1']);
    expect(rows[0].value).toBe(0.7);
    expect(rows[2].value).toBeUndefined();
  });
});
