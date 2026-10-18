import type { StoredModelFormat, StoredModelInfo, StoredModelLink } from '../providers/visin';
import type { DatasetReference } from './training';

/** A dataset a prediction was made on, as the upload named it; `null` when it did not say. */
export interface PredictionDataset {
  source: 'visin';
  id: string;
  revision?: string;
  archiveRevision?: string;
}

/** One output of a model on one frame: a visualization the run uploaded against the model's epoch. */
export interface ModelOutputFile {
  visualizationUuid: string;
  folder: 'mask' | 'segment' | 'confidence';
  frame: string;
  filename: string;
  size?: number;
  geometry?: { width?: number; height?: number };
  confidenceEncoding?: 'uint8' | 'uint16' | 'unknown';
}

/** A test the model's checkpoint was scored on, as the API returns it. */
export interface ModelOutputEvaluation {
  id: string;
  suite?: { slug: string; version: number };
  executedAt?: string;
  sampleCounts?: Record<string, number>;
  results?: Record<string, unknown>;
}

/** `GET /trainings/:id/models/:modelId/outputs`: what a stored model produced, its scores and where it came from. */
export interface ModelOutputs {
  run: {
    id: string;
    uuid: string;
    name: string;
    status?: string;
    project?: { id: string; name: string; slug?: string };
    epoch: number;
    epochUuid: string;
  };
  model: {
    id: string;
    format: StoredModelFormat;
    filename?: string;
    size: number;
    sha256: string;
    epoch: number;
    license?: StoredModelLink['license'];
    credit?: string;
    modelInfo?: StoredModelInfo;
    parity?: StoredModelLink['parity'];
    sourceSha256?: string;
    file: string;
  };
  sameCheckpoint: Array<{ id: string; format: StoredModelFormat; size?: number; sha256?: string; file: string }>;
  trainedOn?: Partial<DatasetReference>;
  checkpoint: { epoch: number; sha256?: string };
  predictedOn: Array<{ dataset: PredictionDataset | null; frames: string[] }>;
  outputGeometry?: { coordinateSpace: string; modelInput: unknown; mapping: string };
  confidence?: { quantity: string; range: string; encodings: Record<string, string> };
  folders: Record<string, string>;
  totals: Record<string, number>;
  metrics: { epoch: number; results?: Record<string, unknown>; evaluations: ModelOutputEvaluation[] };
  files: ModelOutputFile[];
  truncated: boolean;
}
