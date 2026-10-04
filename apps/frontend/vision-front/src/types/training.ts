import { PaginatedResponse } from './api';
import type { HubModelLink } from '../providers/huggingFace';
import type { DatasetSourceKind } from './providers';

/** Where a run's data came from: a Visin dataset, a store, or something Visin only names. */
export interface DatasetReference {
  source: DatasetSourceKind;
  id?: string;
  name: string;
  revision?: string;
  archiveRevision?: string;
}

/** A pointer to a model on a store: one variant per store a model can be linked from. */
export type ModelLink = HubModelLink;

/** A model kept on a store, pinned to the revision the run produced; the fields beyond these are the store's own. */
export type ModelReference = ModelLink & {
  _id: string;
  epoch?: number;
  addedAt: string;
};

/** What a run was started from, so it can be reproduced; filled in by the pipeline's client. */
export interface Provenance {
  git?: { commit: string; branch?: string; /** uncommitted changes were present */ dirty?: boolean; remote?: string };
  /** the command line, with credentials redacted by the client */
  command?: string;
  packages?: Record<string, string>;
  host?: { hostname?: string; platform?: string; python?: string; cuda?: string };
}

export interface Training {
  _id: string;
  uuid: string;
  training_uuid?: string; // Alternative UUID field name
  name: string;
  description?: string;
  datasetId?: string;
  dataset?: DatasetReference;
  /** Hub models linked to this run; the bytes stay on the Hub */
  models?: ModelReference[];
  /** the researcher's own commentary on the run, apart from `description` */
  notes?: string;
  provenance?: Provenance;
  configId?: string;
  projectId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stalled';
  tags?: string[];
  lastSeenAt?: string;
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Present only on runs from the deleted-trainings listing */
  deletedAt?: string;
  metrics?: {
    totalTime: number;
    epochCount: number;
    maxEpoch: number;
    lastEpochTimestamp: string | null;
    cpuCost: number;
    gpuCost: number;
    totalCost: number;
    /** ISO code the costs above are denominated in, from the project's rates */
    currency?: string;
  };
}

export interface CreateTrainingData {
  uuid?: string;
  name: string;
  description?: string;
  /** an empty string removes the note */
  notes?: string;
  datasetId?: string;
  dataset?: DatasetReference;
  configId?: string;
  projectId?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'stalled';
  tags?: string[];
  lastSeenAt?: string;
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, unknown>;
}

export interface DeletedTrainingsResponse {
  success: boolean;
  data: {
    trainings: Training[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

export interface TrainingsPaginatedResponse extends PaginatedResponse<Training> {
  data: {
    trainings: Training[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}
