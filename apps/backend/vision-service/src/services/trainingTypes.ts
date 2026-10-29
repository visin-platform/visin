import type { TrainingSortField } from '../validation/trainingSchemas';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: TrainingSortField;
  order?: 1 | -1;
}

export interface TrainingFilters {
  search?: string;
  status?: string;
  datasetId?: string;
  projectId?: string;
  /** `contribute`: only runs in projects the caller may write to. */
  access?: 'contribute';
  tags?: string[];
  excludeTags?: string[];
  /** Only these runs (still subject to visibility). */
  ids?: string[];
}
