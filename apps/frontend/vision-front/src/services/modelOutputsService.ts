import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';
import type { ModelOutputs } from '../types/modelOutputs';

export const modelOutputsService = {
  /** What a stored model produced on its frames, its checkpoint's scores and where both came from. */
  async get(trainingId: string, modelId: string): Promise<ModelOutputs> {
    const response = await visionApi.get(`/trainings/${trainingId}/models/${modelId}/outputs`);
    return (response.data as ApiResponse<ModelOutputs>).data;
  }
};
