import { ResolvedMetric, ResolvedTaxonomy, ResolvedTerm } from '../../types/taxonomy';
import { isRecord } from '../../taxonomy/discover';
import { resolveTaxonomy } from '../../taxonomy/resolveTaxonomy';
import { RESERVED_CLASS_KEYS, RESERVED_CONDITION_KEYS } from '../../taxonomy/reserved';
import type { ComparisonData } from './performanceMetricsUtils';

/**
 * Discovery for the *aggregated* comparison shape, whose values are `{mean, std}`
 * objects rather than plain numbers — so it can't reuse the raw-test-result walker.
 *
 * Re-resolves the project taxonomy against what these particular comparisons
 * contain, keeping configured labels and order while still surfacing any class or
 * condition the project never declared.
 */
export interface AggregateVocabulary {
  taxonomy: ResolvedTaxonomy;
  conditions: ResolvedTerm[];
  classes: ResolvedTerm[];
  metrics: ResolvedMetric[];
}

export const discoverAggregateVocabulary = (
  comparisonData: ComparisonData[],
  projectTaxonomy: ResolvedTaxonomy,
  candidateMetrics: string[]
): AggregateVocabulary => {
  const conditions = new Set<string>();
  const classes = new Set<string>();
  const metrics = new Set<string>();
  const overallMetrics = new Set<string>();

  comparisonData.forEach(comp => {
    if (!isRecord(comp.aggregatedResults)) return;
    Object.entries(comp.aggregatedResults).forEach(([conditionKey, conditionValue]) => {
      if (RESERVED_CONDITION_KEYS.has(conditionKey) || !isRecord(conditionValue)) return;
      conditions.add(conditionKey);
      Object.entries(conditionValue).forEach(([classKey, classValue]) => {
        if (!isRecord(classValue)) return;
        if (classKey === 'overall') {
          Object.entries(classValue).forEach(([metricKey, stat]) => {
            if (isRecord(stat) && typeof stat.mean === 'number') {
              overallMetrics.add(metricKey);
            }
          });
          return;
        }
        if (RESERVED_CLASS_KEYS.has(classKey)) return;
        classes.add(classKey);
        Object.entries(classValue).forEach(([metricKey, stat]) => {
          if (isRecord(stat) && typeof stat.mean === 'number') {
            metrics.add(metricKey);
          }
        });
      });
    });
  });

  // Rebuild the project's config from its resolved form so labels, colours and
  // order survive, then let discovery add whatever it did not know about.
  const taxonomy = resolveTaxonomy(
    {
      conditionLabel: projectTaxonomy.conditionLabel,
      conditions: projectTaxonomy.conditions.map((c, i) => ({ ...c, order: i })),
      classes: projectTaxonomy.classes.map((c, i) => ({ ...c, order: i })),
      metrics: [...metrics, ...overallMetrics, ...candidateMetrics].map(key =>
        projectTaxonomy.metric(key)
      ),
      overallMetrics: projectTaxonomy.overallMetrics.length
        ? projectTaxonomy.overallMetrics.map(m => m.key).filter(key => overallMetrics.has(key))
        : undefined,
      taskType: projectTaxonomy.taskType
    },
    {
      conditions: Array.from(conditions),
      classes: Array.from(classes),
      overallMetrics: Array.from(overallMetrics)
    }
  );

  // Only show a metric column something actually reported; fall back to the
  // candidate list when a comparison carries no per-class metrics at all.
  const presentMetrics = candidateMetrics.filter(key => metrics.has(key));
  const extraMetrics = Array.from(metrics)
    .filter(key => !candidateMetrics.includes(key))
    .sort((a, b) => a.localeCompare(b));

  return {
    taxonomy,
    conditions: taxonomy.conditions,
    classes: taxonomy.classes,
    metrics: [...presentMetrics, ...extraMetrics].map(taxonomy.metric)
  };
};
