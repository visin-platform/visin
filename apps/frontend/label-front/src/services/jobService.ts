import { labelApi } from './labelApiClient';
import { getGlobalConfig } from '../config/ConfigProvider';
import {
  AnswerBody,
  ApiResponse,
  JobStats,
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

export interface CreateJobInput {
  name: string;
  description?: string;
  groupId: string;
  bundleId: string;
  taskType: 'single_choice' | 'mask_toggle';
  question: { prompt: string; choices?: { key: string; label: string; hotkey?: string }[] };
  annotationSets: string[];
  redundancy: number;
}

export const createJob = async (input: CreateJobInput): Promise<LabelJob> =>
  (await labelApi.post<ApiResponse<LabelJob>>('/jobs', input)).data;

export const materializeJob = async (
  jobId: string,
  body: MaterializeBody
): Promise<MaterializeResult> =>
  (await labelApi.post<ApiResponse<MaterializeResult>>(`/jobs/${jobId}/materialize`, body)).data;

export type JobAction = 'activate' | 'pause' | 'resume' | 'archive';

export const transitionJob = async (jobId: string, action: JobAction): Promise<LabelJob> =>
  (await labelApi.post<ApiResponse<LabelJob>>(`/jobs/${jobId}/${action}`)).data;

/** Irreversible: removes the job, its tasks and every answer. Export first. */
export const deleteJob = async (jobId: string): Promise<{ tasks: number; answers: number }> =>
  (await labelApi.delete<ApiResponse<{ tasks: number; answers: number }>>(`/jobs/${jobId}`)).data;

/** Open a specific task — what a shared `?task=` workbench link resolves to. */
export const getTask = async (taskId: string): Promise<WorkItem> =>
  (await labelApi.get<ApiResponse<WorkItem>>(`/tasks/${taskId}`)).data;

/**
 * The frame at a 0-based position in the job — how the workbench steps back and
 * forward through frames. `null` means the position is past the last frame, so
 * a caller can walk forwards without first knowing how many there are.
 */
export const getTaskAt = async (jobId: string, index: number): Promise<WorkItem | null> =>
  (await labelApi.get<ApiResponse<WorkItem | null>>(`/jobs/${jobId}/tasks/at/${index}`)).data;

export const nextTask = async (jobId: string, excludeTaskIds: string[] = []): Promise<WorkItem | null> =>
  (await labelApi.post<ApiResponse<WorkItem | null>>(`/jobs/${jobId}/next`, { excludeTaskIds })).data;

export const submitAnswer = async (taskId: string, body: AnswerBody): Promise<void> => {
  await labelApi.post(`/tasks/${taskId}/answer`, body);
};

export const undoAnswer = async (taskId: string): Promise<void> => {
  await labelApi.delete(`/tasks/${taskId}/answer`);
};

export const getJobStats = async (jobId: string): Promise<JobStats> =>
  (await labelApi.get<ApiResponse<JobStats>>(`/jobs/${jobId}/stats`)).data;

export type ExportFormat = 'jsonl' | 'csv' | 'manifest';

/** The manifest is a JSON document, not a row format, so it downloads as .json. */
const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  jsonl: 'jsonl',
  csv: 'csv',
  manifest: 'manifest.json'
};

/** Fetch an export and hand it to the browser as a download. */
export const downloadExport = async (jobId: string, format: ExportFormat): Promise<void> => {
  const base = getGlobalConfig().LABEL_SERVICE_URL || '';
  const response = await fetch(`${base}/api/jobs/${jobId}/export?format=${format}`, {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `job-${jobId}.${EXPORT_EXTENSIONS[format]}`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const getMyGroups = async (): Promise<MyGroup[]> =>
  (await labelApi.get<ApiResponse<MyGroup[]>>('/me/groups')).data;
