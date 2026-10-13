import { labelApi } from './labelApiClient';
import { getGlobalConfig } from '../config/ConfigProvider';
import {
  ApiResponse,
  BoxObject,
  ImportReport,
  JobClass,
  JobSensor,
  JobStats,
  LabelFormat,
  LabelFormatId,
  LabelJob,
  MaterializeBody,
  MaterializeResult,
  MyGroup,
  WorkItem
} from '../types';

export const listJobs = async (role: 'worker' | 'admin'): Promise<LabelJob[]> =>
  (await labelApi.get<ApiResponse<LabelJob[]>>(`/jobs?role=${role}`)).data;

export const getJob = async (jobId: string): Promise<LabelJob> =>
  (await labelApi.get<ApiResponse<LabelJob>>(`/jobs/${jobId}`)).data;

/** A class as the wizard sends it; the key, colour and hotkey are filled in by the server when absent. */
export interface ClassInput {
  name: string;
  color?: string;
  hotkey?: string;
  tools?: JobClass['tools'];
  modelClass?: string;
}

export interface CreateJobInput {
  name: string;
  description?: string;
  datasetId: string;
  sensors: Pick<JobSensor, 'key' | 'group' | 'kind' | 'variant'>[];
  classes: ClassInput[];
  redundancy?: number;
}

export const createJob = async (input: CreateJobInput): Promise<LabelJob> =>
  (await labelApi.post<ApiResponse<LabelJob>>('/jobs', input)).data;

export const materializeJob = async (jobId: string, body: MaterializeBody): Promise<MaterializeResult> =>
  (await labelApi.post<ApiResponse<MaterializeResult>>(`/jobs/${jobId}/materialize`, body)).data;

export type JobAction = 'activate' | 'pause' | 'resume' | 'archive';

export const transitionJob = async (jobId: string, action: JobAction): Promise<LabelJob> =>
  (await labelApi.post<ApiResponse<LabelJob>>(`/jobs/${jobId}/${action}`)).data;

export const setJobVisibility = async (jobId: string, isPublic: boolean): Promise<LabelJob> =>
  (await labelApi.put<ApiResponse<LabelJob>>(`/jobs/${jobId}/visibility`, { isPublic })).data;

export const setModelClassMapping = async (jobId: string, mapping: Record<string, string | null>): Promise<LabelJob> =>
  (await labelApi.put<ApiResponse<LabelJob>>(`/jobs/${jobId}/model-mapping`, { mapping })).data;

/** Irreversible: removes the job, its tasks, every label and the mask files. Export first. */
export const deleteJob = async (jobId: string): Promise<{ tasks: number; annotations: number; suggestions: number }> =>
  (await labelApi.delete<ApiResponse<{ tasks: number; annotations: number; suggestions: number }>>(`/jobs/${jobId}`)).data;

/** Open a specific task — what a shared `?task=` editor link resolves to. */
export const getTask = async (taskId: string): Promise<WorkItem> =>
  (await labelApi.get<ApiResponse<WorkItem>>(`/tasks/${taskId}`)).data;

/**
 * The frame at a 0-based position in the job — how the editor steps back and
 * forward through frames. `null` means the position is past the last frame, so
 * a caller can walk forwards without first knowing how many there are.
 */
export const getTaskAt = async (jobId: string, index: number): Promise<WorkItem | null> =>
  (await labelApi.get<ApiResponse<WorkItem | null>>(`/jobs/${jobId}/tasks/at/${index}`)).data;

export const nextTask = async (jobId: string, excludeTaskIds: string[] = []): Promise<WorkItem | null> =>
  (await labelApi.post<ApiResponse<WorkItem | null>>(`/jobs/${jobId}/next`, { excludeTaskIds })).data;

/** Autosave of the boxes on a frame: the whole list, replacing what is stored. */
export const saveObjects = async (taskId: string, objects: BoxObject[], elapsedMs?: number): Promise<void> => {
  await labelApi.put(`/tasks/${taskId}/annotation`, { objects, ...(elapsedMs !== undefined ? { elapsedMs } : {}) });
};

/** Autosave of the mask, as the run-length bytes `maskCodec` writes. */
export const saveMask = async (taskId: string, bytes: Uint8Array): Promise<void> => {
  await labelApi.request(`/tasks/${taskId}/annotation/mask`, {
    method: 'PUT',
    body: bytes as BodyInit,
    headers: { 'Content-Type': 'application/octet-stream' }
  });
};

export const clearMask = async (taskId: string): Promise<void> => {
  await labelApi.delete(`/tasks/${taskId}/annotation/mask`);
};

export const finishTask = async (taskId: string, outcome: 'done' | 'skip', elapsedMs?: number): Promise<void> => {
  await labelApi.post(`/tasks/${taskId}/annotation/${outcome}`, elapsedMs !== undefined ? { elapsedMs } : {});
};

export const getJobStats = async (jobId: string): Promise<JobStats> =>
  (await labelApi.get<ApiResponse<JobStats>>(`/jobs/${jobId}/stats`)).data;

export const getFormats = async (): Promise<LabelFormat[]> =>
  (await labelApi.get<ApiResponse<LabelFormat[]>>('/jobs/formats')).data;

const API_BASE = (): string => `${getGlobalConfig().LABEL_SERVICE_URL || ''}/api`;

/** Format ids that can be downloaded, plus the manifest — a JSON document, not a label set. */
export type ExportKind = LabelFormatId | 'manifest';

const downloadName = (jobId: string, kind: ExportKind): string =>
  kind === 'manifest' ? `job-${jobId}.manifest.json` : `job-${jobId}-${kind}.zip`;

/**
 * Fetch an export and hand it to the browser as a download. Plain `fetch`, not
 * `labelApi`: the body is a file to save as a blob, and the API client only
 * returns parsed JSON.
 */
export const downloadExport = async (
  jobId: string,
  kind: ExportKind,
  include: 'done' | 'all' = 'done'
): Promise<void> => {
  const response = await fetch(`${API_BASE()}/jobs/${jobId}/export?format=${kind}&include=${include}`, {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = downloadName(jobId, kind);
  anchor.click();
  URL.revokeObjectURL(url);
};

export interface ImportOptions {
  as: 'suggestions' | 'done';
  dryRun: boolean;
  /** imported class name → a job class key, `"+"` to add it as a new class, or null to leave it out */
  classMap?: Record<string, string | null>;
  format?: LabelFormatId;
}

/** Send a labels archive. The archive is the request body; the options travel in the query. */
export const importLabels = async (jobId: string, archive: Blob, options: ImportOptions): Promise<ImportReport> => {
  const query = new URLSearchParams({ as: options.as, dryRun: String(options.dryRun) });
  if (options.format) query.set('format', options.format);
  if (options.classMap && Object.keys(options.classMap).length > 0) {
    query.set('classMap', JSON.stringify(options.classMap));
  }
  return (
    await labelApi.request<ApiResponse<ImportReport>>(`/jobs/${jobId}/import?${query.toString()}`, {
      method: 'POST',
      body: archive,
      headers: { 'Content-Type': 'application/zip' }
    })
  ).data;
};

export const getMyGroups = async (): Promise<MyGroup[]> =>
  (await labelApi.get<ApiResponse<MyGroup[]>>('/me/groups')).data;
