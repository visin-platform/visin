import type { DatasetReference, ModelReference } from './training';

/** How well a run did on the result the registry is ranked by. */
export interface RegistryBest {
  metric: string;
  direction: 'max' | 'min';
  value: number;
  epoch: number;
}

/** What a checkpoint scored on a suite: its latest eligible evaluation there, as the suite's headline figure. */
export interface RegistryEvaluation {
  evaluationId: string;
  suite: { slug: string; version: number; name: string };
  headline: { key: string; value: number; unit?: string };
  evidence: 'observed' | 'reported' | 'attested' | 'none';
  receivedAt: string;
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
    dataset?: Pick<DatasetReference, 'source' | 'id' | 'name' | 'revision'>;
    createdAt: string;
  };
  project?: { _id: string; name: string; slug?: string };
  /** present when ranked by a result and this run reported it: where the run peaked */
  best?: RegistryBest;
  /** present when the link names its epoch and that epoch reported the result: this checkpoint's own score */
  checkpoint?: RegistryBest;
  /** the suites this checkpoint was evaluated on, matched by its canonical key; absent when there are none */
  evaluations?: RegistryEvaluation[];
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
