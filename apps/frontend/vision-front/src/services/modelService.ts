import { visionApi } from '../config/visionApi';
import type { ApiResponse } from '../types';
import type { RegistryPage, RegistryQuery } from '../types/modelRegistry';
import type { ModelReference } from '../types/training';

export const modelService = {
  /** Link a demo Space to a model, or unlink it with null. */
  async setDemo(trainingId: string, modelId: string, space: string | null): Promise<ModelReference[]> {
    const response = await visionApi.patch(`/trainings/${trainingId}/models/${modelId}`, { space });
    return (response.data as ApiResponse<ModelReference[]>).data;
  },

  /** The README Visin writes for a run's model, as Markdown. */
  async card(trainingId: string, params: { repo?: string; epoch?: number }): Promise<string> {
    const response = await visionApi.get(`/trainings/${trainingId}/model-card`, { params: { ...params } });
    return (response.data as ApiResponse<{ readme: string }>).data.readme;
  },

  /** Hub models linked to runs the caller can see, optionally ranked by a result. */
  async list(params: RegistryQuery): Promise<RegistryPage> {
    const response = await visionApi.get('/models', { params: { ...params } });
    return (response.data as ApiResponse<RegistryPage>).data;
  }
};
