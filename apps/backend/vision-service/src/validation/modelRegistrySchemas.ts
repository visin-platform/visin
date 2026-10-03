import { z } from '@visin/backend-core';
import { sortOrderSchema } from './common';

/**
 * A path into `Epoch.results`, such as `val.mean_iou`. Results are open blobs, so any
 * name a pipeline reported is valid, including the ones other tools write
 * (`metrics/mAP50-95(B)`). A path is read key by key and never as Mongo syntax, so a name
 * cannot reach a query as an operator; the character set only keeps it printable and short.
 */
export const METRIC_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.@()%+:,= /[\]-]{0,99}$/;

export const listModelsQuerySchema = z
  .object({
    /** a project's id or slug */
    projectId: z.string().min(1).optional(),
    /** a Visin dataset id the run was trained on */
    datasetId: z.string().min(1).optional(),
    /** matches a run's name or a model's repo */
    search: z.string().trim().max(200).optional(),
    /** rank by the best value of this result, e.g. `val.mean_iou` */
    metric: z.string().regex(METRIC_PATH, 'Not a result name like "val.mean_iou"').optional(),
    /** whether larger is better for `metric`; a loss or a latency is `min` */
    direction: z.enum(['max', 'min']).default('max'),
    sortBy: z.enum(['addedAt', 'best']).default('addedAt'),
    order: sortOrderSchema('desc'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(30)
  })
  .refine(query => query.sortBy !== 'best' || query.metric !== undefined, {
    message: 'Sorting by best needs a metric',
    path: ['metric']
  });
export type ListModelsQuery = z.infer<typeof listModelsQuerySchema>;
