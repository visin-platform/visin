import { PaginatedResponse } from './api';

/** A model on the Hugging Face Hub, pinned to the commit the run produced. */
export interface ModelReference {
  _id: string;
  provider: 'hf';
  kind: 'model';
  /** `org/name` */
  repo: string;
  /** the full commit hash, never a branch */
  revision: string;
  /** a file or folder inside the repo, when the model is not all of it */
  path?: string;
  epoch?: number;
  /** a demo Space on the Hub where anyone can try the model: `org/name` */
  space?: string;
  addedAt: string;
}

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
  dataset?: { source: 'visin' | 'hf' | 'other'; id?: string; name: string; revision?: string; archiveRevision?: string };
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
  dataset?: { source: 'visin' | 'hf' | 'other'; id?: string; name: string; revision?: string; archiveRevision?: string };
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
