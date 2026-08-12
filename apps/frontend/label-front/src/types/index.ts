export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type TaskType = 'single_choice' | 'mask_toggle';
export type JobStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type BundleStatus = 'empty' | 'importing' | 'ready' | 'failed';
export type ImportStatus = 'pending' | 'running' | 'done' | 'failed';

export interface JobChoice {
  key: string;
  label: string;
  hotkey?: string;
}

export interface JobProgress {
  tasks: number;
  completed: number;
  answers: number;
  myAnswers: number;
}

export interface LabelJob {
  _id: string;
  name: string;
  description?: string;
  groupId: string;
  bundleId?: string;
  taskType: TaskType;
  question: { prompt: string; choices?: JobChoice[] };
  annotationSets: string[];
  redundancy: number;
  status: JobStatus;
  tasksCount: number;
  createdBy: { userId: string; email: string; name?: string };
  createdAt: string;
  updatedAt: string;
  progress?: JobProgress; // present on the list and detail endpoints
}

export interface LabelBundle {
  _id: string;
  name: string;
  description?: string;
  groupId: string;
  annotationSets: string[];
  counts: { frames: number; layers: number };
  manifest?: { stem: string; stratum?: string }[];
  status: BundleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ImportJob {
  _id: string;
  bundleId: string;
  status: ImportStatus;
  processed: number;
  skipped: number;
  total?: number;
  fileErrors: { path: string; reason: string }[];
  mapping?: ImportMapping;
}

/** Which folder of the uploaded zip holds what. Mirrors label-service's `ImportMapping`. */
export interface ImportMapping {
  frames: string; // '' = the zip root
  annotations?: { path: string; set: string }[];
  manifest?: string;
  idsSuffix?: string;
  masksSuffix?: string;
}

export interface ZipFolderSummary {
  path: string;
  files: number;
  images: number;
  idMaps: number;
  maskFiles: number;
  others: number;
  samples: string[];
}

/** A zip already uploaded for a bundle — importable without re-sending it. */
export interface BundleUpload {
  zipFileId: string;
  size: number;
  uploadedAt: string;
}

export interface ZipPreview {
  entries: number;
  truncated: boolean;
  folders: ZipFolderSummary[];
  manifestCandidates: string[];
  suggestion: ImportMapping;
}

export interface MaskMeta {
  id: number;
  class: string;
  bbox?: number[]; // [x1, y1, x2, y2]
  [key: string]: unknown;
}

export interface LabelTask {
  _id: string;
  jobId: string;
  labelImageId: string;
  order: number;
  stratum?: string;
  payload?: {
    layers?: { set: string; imageId: string }[];
    maskMap?: { imageId: string; masks: MaskMeta[] };
  };
}

export interface TaskImages {
  frame: { url: string; width?: number; height?: number; stem?: string };
  layers: { set: string; url: string }[];
  idmap?: { url: string };
}

/** One verdict on a frame, carrying no trace of who gave it. */
export interface AnswerSnapshot {
  choiceKey?: string;
  rejectedMaskIds?: number[];
  updatedAt: string;
}

export interface TaskAnswerState {
  count: number;
  /** Your own answer, when you have one — what the workbench prefills. */
  mine: AnswerSnapshot | null;
  /** The most recent answer from anyone, shown to a viewer with none of their own. */
  latest: AnswerSnapshot | null;
}

/** Where a frame sits in the job's frame order — `index` is 0-based. */
export interface TaskPosition {
  index: number;
  total: number;
}

export interface WorkItem {
  task: LabelTask;
  images: TaskImages;
  position: TaskPosition;
  answer: TaskAnswerState;
}

export interface JobStats {
  tasks: number;
  completed: number;
  answers: number;
  /** Omitted for anonymous viewers — it is a list of labelers' email addresses. */
  perUser?: { userEmail: string; userName?: string; answered: number }[];
  perStratum: { stratum: string; tasks: number; completed: number }[];
  agreement: number | null;
}

export interface MyGroup {
  groupId: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

export interface AnswerBody {
  choiceKey?: string;
  rejectedMaskIds?: number[];
  elapsedMs?: number;
}

/**
 * Narrows a mask_toggle job to part of its annotation set, so one full-corpus
 * bundle can back several jobs. `perValue` caps each value across the whole
 * bundle, not per frame.
 */
export interface MaskSelector {
  field: string;
  include?: string[];
  perValue?: number;
  seed?: number;
}

export type MaterializeBody =
  | { kind: 'manifest'; content?: string; format?: 'csv' | 'jsonl'; masks?: MaskSelector }
  | { kind: 'filter'; sampleN?: number; seed?: number; masks?: MaskSelector };

/** What materialization did: task count, unmatched manifest rows, masks per value. */
export interface MaterializeResult {
  tasks: number;
  missing: string[];
  masks?: Record<string, number>;
}

/** Groupable mask metadata in one annotation set, with a count per value. */
export interface MaskField {
  field: string;
  values: { value: string; count: number }[];
}
