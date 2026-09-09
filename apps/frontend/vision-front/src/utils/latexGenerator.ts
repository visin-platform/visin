import { TestResult } from '../types';
import { ResolvedTaxonomy } from '../types/taxonomy';
import { isRecord, readMetric } from '../taxonomy/discover';
import { resolveTaxonomyFor } from '../taxonomy/useTaxonomy';

/**
 * One test result as a LaTeX table: conditions down the page, classes across it.
 *
 * The table's width follows the data. It used to be a hand-written 23-column
 * header naming Vehicle/Sign/Cyclist+Ped/Human four times over and a single
 * template literal emitting all 23 cells, which meant a project with two classes
 * got three empty columns and a project with five silently lost one.
 */

const CLASS_METRICS = ['iou', 'precision', 'recall', 'ap'];

/** Overall/inference columns, appended after the per-class block. */
interface SummaryColumn {
  key: string;
  label: string;
  decimals: number;
  /** which pseudo-class of the condition holds it */
  source: 'overall' | 'inference_time';
}

const INFERENCE_COLUMNS: SummaryColumn[] = [
  { key: 'avg_per_sample_ms', label: 'Avg (ms)', decimals: 2, source: 'inference_time' },
  { key: 'throughput_fps', label: 'FPS', decimals: 1, source: 'inference_time' },
  { key: 'total_seconds', label: 'Total (s)', decimals: 1, source: 'inference_time' }
];

const escapeLatex = (value: string) => value.replace(/[&%$#_{}~^\\]/g, '\\$&');

export const generateLatexCode = (testResult: TestResult, taxonomy?: ResolvedTaxonomy): string => {
  const resolved = taxonomy ?? resolveTaxonomyFor(undefined, [testResult]);

  const conditions = resolved.conditions.filter(condition =>
    isRecord(testResult.test_results?.[condition.key])
  );
  const classes = resolved.classes;

  // Only include an overall column something actually reported.
  const overallColumns: SummaryColumn[] = resolved.overallMetrics.map(metric => ({
    key: metric.key,
    label: metric.label,
    decimals: metric.decimals,
    source: 'overall' as const
  }));
  const inferenceColumns = INFERENCE_COLUMNS.filter(column =>
    conditions.some(condition => {
      const block = testResult.test_results?.[condition.key];
      return isRecord(block) && readMetric(block.inference_time, column.key) !== undefined;
    })
  );

  const totalColumns = classes.length * CLASS_METRICS.length + overallColumns.length + inferenceColumns.length;

  const metricGroups = CLASS_METRICS.map(
    metric => `\\multicolumn{${classes.length}}{|c|}{${resolved.metric(metric).label}}`
  );
  if (overallColumns.length > 0) {
    metricGroups.push(`\\multicolumn{${overallColumns.length}}{|c|}{Overall Metrics}`);
  }
  if (inferenceColumns.length > 0) {
    metricGroups.push(`\\multicolumn{${inferenceColumns.length}}{|c|}{Inference Time}`);
  }

  const classHeaders = CLASS_METRICS.flatMap(() => classes.map(c => escapeLatex(c.label)));
  const summaryHeaders = [...overallColumns, ...inferenceColumns].map(c => escapeLatex(c.label));

  let latex = `\\begin{table*}[ht]
\\centering
\\caption{Performance comparison across ${escapeLatex(resolved.conditionLabel.toLowerCase())}s.}
\\begin{tabular}{|c|${'c|'.repeat(totalColumns)}}
\\hline & ${metricGroups.join(' & ')} \\\\
\\hline & ${[...classHeaders, ...summaryHeaders].join(' & ')} \\\\
\\hline
`;

  conditions.forEach(condition => {
    const conditionData = testResult.test_results[condition.key];
    if (!isRecord(conditionData)) return;

    const cells = [
      ...CLASS_METRICS.flatMap(metric =>
        classes.map(className => {
          const value = readMetric(conditionData[className.key], metric);
          return value === undefined ? '-' : value.toFixed(resolved.metric(metric).decimals);
        })
      ),
      ...[...overallColumns, ...inferenceColumns].map(column => {
        const value = readMetric(conditionData[column.source], column.key);
        return value === undefined ? '-' : value.toFixed(column.decimals);
      })
    ];

    latex += `\\multicolumn{${totalColumns + 1}}{|c|}{${escapeLatex(condition.label)}} \\\\
\\hline
${cells.length > 0 ? `Result & ${cells.join(' & ')}` : 'Result'} \\\\
\\hline
`;
  });

  latex += `\\end{tabular}
\\label{table:performance}
\\end{table*}`;

  return latex;
};
