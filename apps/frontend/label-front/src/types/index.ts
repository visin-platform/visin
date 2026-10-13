export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type JobStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

/** What an annotator may draw for a class. */
export type AnnotationTool = 'box' | 'mask';

export interface JobClass {
  key: string;
  name: string;
  /** `#rrggbb` as stored; draw it through `useChartColors().adapt` so it suits the scheme showing */
  color: string;
  hotkey?: string;
  tools: AnnotationTool[];
  /** the value a pixel of this class has in a mask; 0 is unlabeled */
  maskIndex: number;
  modelClass?: string;
}

export type SensorKey = 'camera' | 'lidar' | 'radar';

export interface JobSensor {
  key: SensorKey;
  group: string;
  kind: 'image' | 'points';
  variant?: string;
}

export interface JobProgress {
  tasks: number;
  completed: number;
  done: number;
  skipped: number;
  myDone: number;
}

export interface LabelJob {
  _id: string;
  name: string;
  description?: string;
  datasetId: string;
  /** job detail only, for those who can reach the job: the dataset, whose owner the job follows */
  dataset?: { _id: string; name: string; owner: { kind: 'user' | 'group'; id: string } };
  taskType: 'annotate';
  classes: JobClass[];
  sensors: JobSensor[];
  redundancy: number;
  status: JobStatus;
  isPublic?: boolean;
  canLabel?: boolean; // current membership capability, present on job detail
  canManage?: boolean; // may run the job (manage on its dataset), present on job detail
  tasksCount: number;
  createdBy: { userId: string; email: string; name?: string };
  createdAt: string;
  updatedAt: string;
  progress?: JobProgress; // present on the list and detail endpoints
}

/** A dataset as the job wizard sees it: its image groups are what a job picks from. */
export interface LabelDataset {
  _id: string;
  name: string;
  description?: string;
  owner: { kind: 'user' | 'group'; id: string };
  visibility: 'private' | 'public';
  groups: { name: string; images: number; jsons: number }[];
  imageCount: number;
  importStatus?: string;
}

export type BoxSource = 'human' | 'model' | 'import';

/** One box, `bbox` being `[x, y, width, height]` in the camera frame's pixels. */
export interface BoxObject {
  id: string;
  classKey: string;
  bbox: [number, number, number, number];
  source: BoxSource;
  score?: number;
}

export interface MaskView {
  url: string;
  width: number;
  height: number;
}

/** One annotator's labels on a frame, with no trace of who made them. */
export interface AnnotationView {
  status: 'draft' | 'done' | 'skipped';
  objects: BoxObject[];
  mask?: MaskView;
  updatedAt: string;
}

/** Labels that came with an import, shown dashed until accepted. */
export interface SuggestionView {
  objects: BoxObject[];
  mask?: MaskView;
}

export interface MapPoint {
  u: number;
  v: number;
  value?: number;
}

export type SensorImage =
  | { key: SensorKey; kind: 'image'; url: string }
  | { key: SensorKey; kind: 'points'; points: MapPoint[] };

export interface TaskImages {
  frame: { url: string; width?: number; height?: number; stem?: string };
  sensors: SensorImage[];
}

export interface LabelTask {
  _id: string;
  jobId: string;
  order: number;
  stratum?: string;
  sensors?: { key: SensorKey; kind: string }[];
}

/** Where a frame sits in the job's frame order — `index` is 0-based. */
export interface TaskPosition {
  index: number;
  total: number;
}

export interface TaskAnnotationState {
  /** annotators who finished the frame */
  count: number;
  /** Your own labels, when you have any — what the editor opens with. */
  mine: AnnotationView | null;
  /** The most recently finished labels from anyone, shown to a viewer with none of their own. */
  latest: AnnotationView | null;
}

export interface WorkItem {
  task: LabelTask;
  images: TaskImages;
  position: TaskPosition;
  annotation: TaskAnnotationState;
  suggestions: SuggestionView | null;
}

export interface JobStats {
  tasks: number;
  completed: number;
  done: number;
  skipped: number;
  objects: number;
  perClass: { classKey: string; name: string; boxes: number; pixels: number }[];
  /** Omitted for anonymous viewers — it is a list of annotators' email addresses. */
  perUser?: { userEmail: string; userName?: string; done: number; skipped: number }[];
  perStratum: { stratum: string; tasks: number; completed: number }[];
}

export interface MyGroup {
  groupId: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

export type MaterializeBody =
  | { kind: 'manifest'; content?: string; format?: 'csv' | 'jsonl' }
  | { kind: 'filter'; sampleN?: number; seed?: number };

/** What materialization did: task count, unmatched manifest rows, and frames per overlay sensor. */
export interface MaterializeResult {
  tasks: number;
  missing: string[];
  sensors: Record<string, number>;
}

export type LabelFormatId = 'yolo' | 'coco' | 'voc' | 'semantic-png' | 'visin';

/** A label format and what it can hold, as the server describes it. */
export interface LabelFormat {
  id: LabelFormatId;
  name: string;
  description: string;
  boxes: boolean;
  masks: boolean;
}

export interface ImportClassPlan {
  name: string;
  boxes: number;
  maskFrames: number;
  /** a job class key, `"+"` for a new class, or null to leave its labels out */
  target: string | null;
  matched: boolean;
}

export interface ImportReport {
  format: LabelFormatId;
  formatName: string;
  dryRun: boolean;
  as: 'suggestions' | 'done';
  frames: { inFile: number; matched: number; unmatched: number; unmatchedSample: string[] };
  classes: ImportClassPlan[];
  boxes: number;
  maskFrames: number;
  createdClasses: string[];
  warnings: string[];
}
