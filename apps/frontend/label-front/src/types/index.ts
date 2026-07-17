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
  progress?: JobProgress; // present on the detail endpoint
}

export interface LabelBundle {
  _id: string;
  name: string;
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
  frame: { url: string; width?: number; height?: number };
  layers: { set: string; url: string }[];
  idmap?: { url: string };
}

export interface WorkItem {
  task: LabelTask;
  images: TaskImages;
}

export interface JobStats {
  tasks: number;
  completed: number;
  answers: number;
  perUser: { userEmail: string; userName?: string; answered: number }[];
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

export type MaterializeBody =
  | { kind: 'manifest'; content?: string; format?: 'csv' | 'jsonl' }
  | { kind: 'filter'; sampleN?: number; seed?: number };
