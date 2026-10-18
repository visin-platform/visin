/** Every number in a results blob, by its dotted path: an epoch's open results, readable as a list. */
export const numericRows = (value: unknown, path = ''): Array<[string, number]> => {
  if (typeof value === 'number' && Number.isFinite(value)) return [[path, value]];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    numericRows(child, path ? `${path}.${key}` : key)
  );
};

/** What the usual top-level blocks of an epoch's results are called. */
const BLOCK_NAMES: Record<string, string> = {
  train: 'Training',
  training: 'Training',
  val: 'Validation',
  valid: 'Validation',
  validation: 'Validation',
  test: 'Test'
};

/** A result block's name for people: `val` is "Validation"; an unknown one is kept as written. */
export const blockName = (key: string): string => BLOCK_NAMES[key.toLowerCase()] ?? key;

/** A number in the format its metric declares: a share as a percentage, a time in ms, a rate in FPS. */
export const formatResult = (value: number, metric: { format: string; decimals: number }): string => {
  if (metric.format === 'percent') return `${(value * 100).toFixed(Math.max(0, metric.decimals - 2))}%`;
  const fixed = Math.abs(value) >= 1e-3 || value === 0 ? value.toFixed(metric.decimals) : value.toExponential(2);
  if (metric.format === 'ms') return `${fixed} ms`;
  if (metric.format === 'fps') return `${fixed} FPS`;
  return fixed;
};
