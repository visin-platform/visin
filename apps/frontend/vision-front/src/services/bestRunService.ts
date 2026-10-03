import { visionApi } from '../config/visionApi';
import type { ApiResponse } from '../types';
import type { BestRun } from '../types/bestRun';

/** The best run of a project, or of a dataset across the projects the caller can see. */
export async function getBestRun(scope: { projectId?: string; datasetId?: string }): Promise<BestRun> {
  const response = await visionApi.get('/trainings/best', { params: { ...scope } });
  return (response.data as ApiResponse<BestRun>).data;
}
