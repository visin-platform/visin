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

/** Fetch an export and hand it to the browser as a download. */
export const downloadExport = async (jobId: string, format: 'jsonl' | 'csv'): Promise<void> => {
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
  anchor.download = `job-${jobId}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const getMyGroups = async (): Promise<MyGroup[]> =>
  (await labelApi.get<ApiResponse<MyGroup[]>>('/me/groups')).data;
