import { describe, expect, it } from 'vitest';
import { MAX_RESULT_ROWS, resultTable } from './resultTable';

describe('resultTable', () => {
  it('discovers the conditions, classes and metrics from whatever the evaluator wrote', () => {
    const table = resultTable({
      day: { vehicle: { iou: 0.8, f1: 0.7 }, overall: { mIoU: 0.75 }, pedestrian: { iou: 0.6 } },
      night: { overall: { mIoU: 0.5, mean_ap: 0.4 } }
    });
    expect(table.metrics).toEqual(['mIoU', 'iou', 'f1', 'mean_ap']);
    expect(table.rows.map(row => [row.condition, row.scope])).toEqual([
      ['day', 'overall'], ['day', 'vehicle'], ['day', 'pedestrian'], ['night', 'overall']
    ]);
    expect(table.rows[1].values).toEqual({ iou: 0.8, f1: 0.7 });
    expect(table.omitted).toBe(0);
  });

  it('shows a whole-test overall apart, keeps a valid zero, and leaves out what is not a number', () => {
    const table = resultTable({
      day: { vehicle: { iou: 0, note: 'x', nested: { deep: 1 }, nan: Number.NaN } },
      overall: { mIoU: 0.7, label: 'text' },
      note: 'text',
      list: [1, 2],
      empty: { vehicle: { label: 'only text' } }
    });
    expect(table.rows).toEqual([
      { condition: 'day', scope: 'vehicle', values: { iou: 0 } },
      { condition: 'overall', scope: 'overall', values: { mIoU: 0.7 } }
    ]);
  });

  it('is empty for a result that is not an object of conditions', () => {
    for (const results of [undefined, null, 'x', 3, [1], {}]) {
      expect(resultTable(results)).toEqual({ metrics: [], rows: [], omitted: 0 });
    }
  });

  it('shows no more rows than the table can hold, and says how many it left out', () => {
    const results = { day: Object.fromEntries(Array.from({ length: MAX_RESULT_ROWS + 25 }, (_, index) => [`class${index}`, { iou: index / 1000 }])) };
    const table = resultTable(results);
    expect(table.rows).toHaveLength(MAX_RESULT_ROWS);
    expect(table.omitted).toBe(25);
  });
});
