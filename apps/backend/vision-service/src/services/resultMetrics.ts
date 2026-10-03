/**
 * Metric subtrees that are machine telemetry rather than a result.
 *
 * Same exclusion mcp-service makes, and deliberately a second copy rather than
 * a shared one: putting it in backend-core would make this feature wait on a
 * lib release and a version bump in two services, for twenty lines that have
 * never changed.
 */
const NOT_METRICS = new Set(['system_info']);

/**
 * Top-level numbers a pipeline logs beside its results that describe the run, not the model:
 * published as a score on a model card, or crowned as a run's best, they would only mislead.
 */
const BOOKKEEPING = new Set(['lr', 'learning_rate', 'epoch_time', 'epoch_time_s', 'timestamp']);

/** Holds a block's per-class rows, which are a breakdown of its metrics and not metrics themselves. */
const PER_CLASS_KEYS = new Set(['per_class']);

export interface MetricLeaf {
  /** where the number sits, keys joined with dots: the name shown to people */
  path: string;
  /** the keys themselves. A key may contain a dot (`map_0.5`), so `path` alone cannot be split back. */
  segments: string[];
  value: number;
}

interface Leaf extends MetricLeaf {
  depth: number;
}

function numericLeaves(results: Record<string, unknown>, parents: string[] = []): Leaf[] {
  return Object.entries(results).flatMap(([key, value]) => {
    if (parents.length === 0 && (NOT_METRICS.has(key) || BOOKKEEPING.has(key))) return [];
    if (PER_CLASS_KEYS.has(key)) return [];

    const segments = [...parents, key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return [{ path: segments.join('.'), segments, value, depth: segments.length }];
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return numericLeaves(value as Record<string, unknown>, segments);
    }
    return [];
  });
}

/**
 * An epoch's headline metrics: the numbers that summarise it, with where each sits.
 *
 * A number logged at the top level (`accuracy`) is a summary by being there, so it counts. Inside
 * blocks (`train`, `val`) only the shallowest numbers of the epoch count, which is what separates a
 * summary from a breakdown without knowing either schema: `val.loss` sits above `val.vehicle.iou`,
 * and above the nested telemetry of a `system` block. The two are judged apart because a top-level
 * number is always one level up from its blocks: judging them together keeps a bare `lr` and drops
 * every result, for a pipeline that logs `{ lr, train: { loss }, val: { mean_iou } }`.
 */
export function metricLeaves(results: Record<string, unknown>): MetricLeaf[] {
  const leaves = numericLeaves(results);
  const inBlocks = leaves.filter(leaf => leaf.depth > 1);
  const shallowest = Math.min(...inBlocks.map(leaf => leaf.depth));
  return leaves
    .filter(leaf => leaf.depth === 1 || leaf.depth === shallowest)
    .map(({ path, segments, value }) => ({ path, segments, value }));
}
