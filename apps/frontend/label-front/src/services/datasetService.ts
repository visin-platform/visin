import { labelApi } from './labelApiClient';
import { ApiResponse, LabelDataset } from '../types';

/**
 * Datasets live in dataset-service; label-service proxies the one read a job
 * wizard needs, so this front needs no second API address of its own.
 */
export const listDatasets = async (): Promise<LabelDataset[]> =>
  (await labelApi.get<ApiResponse<LabelDataset[]>>('/me/datasets')).data;
