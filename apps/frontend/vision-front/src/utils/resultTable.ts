/**
 * What a result blob reports, as rows: a condition (one test set), a class within it, and the numbers it has.
 * The names are whatever the evaluator wrote, so the conditions, classes and metrics are discovered from the blob and
 * none is expected. Only numbers are shown; text and nesting deeper than a metric are left to the raw JSON.
 *
 * `overall` is the evaluator's own whole-condition summary, and a top-level `overall` is its whole-test one. Both are
 * shown, labelled as reported, apart from the ranked figures Visin computes from the declared conditions.
 */
export interface ResultRow {
  /** the condition, or `overall` for the whole-test block */
  condition: string;
  /** the class, or `overall` for the condition's own summary */
  scope: string;
  values: Record<string, number>;
}

export interface ResultTable {
  metrics: string[];
  rows: ResultRow[];
  /** rows left out because there were more than the table shows */
  omitted: number;
}

export const MAX_RESULT_ROWS = 500;
const OVERALL = 'overall';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const numbersOf = (block: Record<string, unknown>): Record<string, number> =>
  Object.fromEntries(Object.entries(block).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));

export function resultTable(results: unknown): ResultTable {
  const rows: ResultRow[] = [];
  if (isRecord(results)) {
    for (const [condition, block] of Object.entries(results)) {
      if (!isRecord(block)) continue;
      if (condition === OVERALL) {
        const values = numbersOf(block);
        if (Object.keys(values).length > 0) rows.push({ condition: OVERALL, scope: OVERALL, values });
        continue;
      }
      const scopes = Object.entries(block).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]));
      // The condition's own summary leads, then its classes in the order they were written.
      scopes.sort(([a], [b]) => Number(b === OVERALL) - Number(a === OVERALL));
      for (const [scope, metrics] of scopes) {
        const values = numbersOf(metrics);
        if (Object.keys(values).length > 0) rows.push({ condition, scope, values });
      }
    }
  }
  const shown = rows.slice(0, MAX_RESULT_ROWS);
  const metrics = [...new Set(shown.flatMap(row => Object.keys(row.values)))];
  return { metrics, rows: shown, omitted: rows.length - shown.length };
}
