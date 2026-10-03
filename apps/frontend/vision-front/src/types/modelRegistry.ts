import type { ModelReference } from './training';

/** How well a run did on the result the registry is ranked by. */
export interface RegistryBest {
  metric: string;
  direction: 'max' | 'min';
  value: number;
  epoch: number;
}

/** One Hub model linked to a run, with where it came from. */
export interface RegistryModel {
  model: ModelReference;
  training: {
    _id: string;
    uuid: string;
    name: string;
    status: string;
    projectId?: string;
    datasetId?: string;
    dataset?: { source: 'visin' | 'hf' | 'other'; id?: string; name: string; revision?: string };
    createdAt: string;
  };
  project?: { _id: string; name: string; slug?: string };
  /** present when ranked by a result and this run reported it */
  best?: RegistryBest;
}

export interface RegistryQuery {
  projectId?: string;
  datasetId?: string;
  search?: string;
  metric?: string;
  direction?: 'max' | 'min';
  sortBy?: 'addedAt' | 'best';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface RegistryPage {
  models: RegistryModel[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
