import { BadRequestError, ForbiddenError } from '@visin/backend-core';
import { getComparisonById } from './comparisonService';
import { getTrainingSummary } from './trainingSummaryService';
import { toCsv, toXlsx, type Cell, type Table } from '../utils/tableExport';

export type ExportFormat = 'csv' | 'xlsx';

export interface ComparisonFile {
  filename: string;
  contentType: string;
  body: Buffer | string;
}

/** A comparison of runs, one row each: what they are, and per result its best epoch beside its last. */
export async function comparisonTable(id: string, userId: string | undefined): Promise<{ name: string; table: Table }> {
  const comparison = await getComparisonById(id, userId);
  if (comparison.type !== 'trainings') {
    throw new BadRequestError(`Only a comparison of trainings can be exported; this one compares ${comparison.type}`);
  }

  const summaries = [];
  for (const trainingId of comparison.itemIds) {
    try {
      summaries.push(await getTrainingSummary(trainingId, userId));
    } catch (error) {
      // A run the caller may not read, or one deleted since, is left out rather than failing the file.
      if (!(error instanceof ForbiddenError) && (error as { statusCode?: number }).statusCode !== 404) throw error;
    }
  }

  const paths = [...new Set(summaries.flatMap(summary => summary.metrics.map(metric => metric.path)))].sort();
  const columns = [
    'Run', 'Status', 'Dataset', 'Epochs', 'Models',
    ...paths.flatMap(path => [`${path} best`, `${path} best epoch`, `${path} last`, `${path} better is`])
  ];
  const rows: Cell[][] = summaries.map(({ training, epochCount, metrics, models }) => [
    training.name,
    training.status,
    training.dataset?.name ?? training.datasetId,
    epochCount,
    models.map(model => `${model.repo}@${model.revision.slice(0, 7)}`).join('; '),
    ...paths.flatMap(path => {
      const metric = metrics.find(candidate => candidate.path === path);
      return metric
        ? [metric.best.value, metric.best.epoch, metric.last.value, `${metric.direction}${metric.directionFrom === 'default' ? ' (assumed)' : ''}`]
        : [null, null, null, null];
    })
  ]);
  return { name: comparison.name, table: { columns, rows } };
}

const fileStem = (name: string): string => name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'comparison';

/**
 * The comparison as a file for a spreadsheet. "Better is" says which way each result was read,
 * and "(assumed)" marks a direction guessed from the result's name rather than set by the project.
 */
export async function exportComparison(id: string, userId: string | undefined, format: ExportFormat): Promise<ComparisonFile> {
  const { name, table } = await comparisonTable(id, userId);
  const stem = fileStem(name);
  return format === 'csv'
    ? { filename: `${stem}.csv`, contentType: 'text/csv; charset=utf-8', body: toCsv(table) }
    : {
        filename: `${stem}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: toXlsx(table, name)
      };
}
