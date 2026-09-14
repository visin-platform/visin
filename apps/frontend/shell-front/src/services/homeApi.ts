import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from '../config/ConfigProvider';

export type TrainingStatus = 'pending' | 'running' | 'completed' | 'failed';

/** The fields of a training the home page reads; vision-service sends more. */
export interface HomeTraining {
  _id: string;
  name: string;
  projectId?: string;
  status: TrainingStatus;
  updatedAt: string;
}

export interface HomeProject {
  _id: string;
  name: string;
  slug?: string;
  isPublic: boolean;
  updatedAt: string;
}

export interface HomeJob {
  _id: string;
  name: string;
  tasksCount: number;
  /** Present on label-service's list endpoint. */
  progress?: { tasks: number; completed: number };
  updatedAt: string;
}

/** A written conclusion about a project or a run, by a person or an assistant. */
export interface HomeFinding {
  _id: string;
  projectId: string;
  /** The run the finding is about, where it is about one. */
  trainingId?: string;
  title: string;
  authorKind: 'person' | 'assistant';
  authorLabel: string;
  createdAt: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

// The same services the apps call, from the same origin, with the same session
// cookie. The page leaves out whatever an unset URL would have fed, so these
// are never called against the shell's own origin.
const visionApi = createApiClient({
  baseUrl: () => `${stripTrailingSlash(getGlobalConfig().VISION_API_URL ?? '')}/api`
});
const labelApi = createApiClient({
  baseUrl: () => `${stripTrailingSlash(getGlobalConfig().LABEL_SERVICE_URL ?? '')}/api`
});

export const homeApi = {
  /** Most recently updated first — the server's order — with the total across every page. */
  async trainings(options: {
    limit: number;
    status?: TrainingStatus;
  }): Promise<{ trainings: HomeTraining[]; total: number }> {
    const query = new URLSearchParams({ limit: String(options.limit) });
    if (options.status) {
      query.set('status', options.status);
    }
    const { data } = await visionApi.get<
      Envelope<{ trainings: HomeTraining[]; pagination?: { total: number } }>
    >(`/trainings?${query}`);
    return { trainings: data.trainings, total: data.pagination?.total ?? data.trainings.length };
  },

  /** Every project the viewer can see, most recently updated first. */
  async projects(): Promise<HomeProject[]> {
    return (await visionApi.get<Envelope<HomeProject[]>>('/projects?sortBy=updatedAt&sortOrder=desc')).data;
  },

  /** Findings across every project the viewer can see, newest first. */
  async findings(limit: number): Promise<HomeFinding[]> {
    return (await visionApi.get<Envelope<HomeFinding[]>>(`/findings?limit=${limit}`)).data;
  },

  /** Active jobs in the viewer's groups: what there is to label. */
  async jobs(): Promise<HomeJob[]> {
    return (await labelApi.get<Envelope<HomeJob[]>>('/jobs?role=worker')).data;
  }
};

/** Tasks of a job still short of their answers. */
export function remainingTasks(job: HomeJob): number {
  return Math.max(0, (job.progress?.tasks ?? job.tasksCount) - (job.progress?.completed ?? 0));
}
