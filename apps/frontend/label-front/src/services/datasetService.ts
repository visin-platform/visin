import { labelApi } from './labelApiClient';
import { ApiResponse, LabelDataset, MaskField } from '../types';

/**
 * Datasets live in dataset-service; label-service proxies the two reads a job
 * wizard needs, so this front needs no second API address of its own.
 */

export const listDatasets = async (): Promise<LabelDataset[]> =>
  (await labelApi.get<ApiResponse<LabelDataset[]>>('/me/datasets')).data;

/** Groupable mask fields in one annotation group, for slicing a mask job. */
export const getMaskFields = async (datasetId: string, set: string): Promise<MaskField[]> =>
  (await labelApi.get<ApiResponse<MaskField[]>>(`/me/datasets/${datasetId}/mask-fields?set=${encodeURIComponent(set)}`)).data;
