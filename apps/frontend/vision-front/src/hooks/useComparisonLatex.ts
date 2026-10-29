import { useMemo } from 'react';
import type { ProjectTaxonomy } from '../types/taxonomy';
import { discoverAggregateVocabulary } from '../components/result-tables/aggregateVocabulary';
import { DEFAULT_CLASS_METRICS } from '../components/result-tables/performanceMetricsUtils';
import { resolveTaxonomy } from '../taxonomy/resolveTaxonomy';
import { generateBenchmarkingLatex, generateTestingLatex, generateTrainingLatex } from '../utils/latex/comparisonExportLatex';

type TrainingRows = Parameters<typeof generateTrainingLatex>[0];
type EvaluationRows = Parameters<typeof generateTestingLatex>[0];
type BenchmarkRows = Parameters<typeof generateBenchmarkingLatex>[0];

/** The LaTeX for every table of a comparison: training, testing, benchmarking, and all three joined. */
export const useComparisonLatex = (
  trainings: TrainingRows,
  evaluations: EvaluationRows,
  benchmarks: BenchmarkRows,
  taxonomy: ProjectTaxonomy | undefined,
  decimals: number,
  multiplier: number
) => {
  const trainingLatex = useMemo(() => generateTrainingLatex(trainings, decimals, multiplier), [trainings, decimals, multiplier]);

  // The export runs outside the provider's subtree, so resolve the same taxonomy
  // here: the project's labels merged with what these comparisons actually contain.
  const exportTaxonomy = useMemo(
    () => discoverAggregateVocabulary(evaluations, resolveTaxonomy(taxonomy, {}), DEFAULT_CLASS_METRICS).taxonomy,
    [evaluations, taxonomy]
  );

  const testingLatex = useMemo(
    () => generateTestingLatex(evaluations, decimals, multiplier, exportTaxonomy),
    [evaluations, decimals, multiplier, exportTaxonomy]
  );

  const benchmarkingLatex = useMemo(() => generateBenchmarkingLatex(benchmarks), [benchmarks]);

  const allLatex = [trainingLatex, testingLatex, benchmarkingLatex]
    .filter(Boolean)
    .join('\n\n% ─────────────────────────────────────────────────\n\n');

  return { trainingLatex, testingLatex, benchmarkingLatex, allLatex };
};
