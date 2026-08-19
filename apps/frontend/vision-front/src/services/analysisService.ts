import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';

export interface AnalysisResponse {
  data: DatasetAnalysis[];
  pagination: {
    total: number;
    limit: number;
    skip: number;
  };
}

export interface DatasetAnalysis {
  _id: string;
  dataset: string;
  // Both derived from the uploaded archive by vision-service — never set by
  // the client, which is why neither is editable in the UI.
  size?: string;
  fileId?: string;
  // Optional to reflect legacy records predating the `data` wrapper, where
  // the JSON payload lived at the document's top level instead.
  data?: Record<string, unknown>;
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisUploadUrl {
  uploadUrl: string;
  fileId: string;
  expiresInMinutes: number;
}

export interface AnalysisComparisonResponse {
  success: boolean;
  data: {
    comparison: Array<{
      analysis: {
        _id: string;
        dataset: string;
        createdAt: string;
        updatedAt: string;
      };
      data: Record<string, unknown>; // Dynamic JSON data
    }>;
    summary: {
      totalAnalyses: number;
      datasets: string[];
    };
  };
}

/**
 * Upload analysis JSON data
 */
export const uploadAnalysis = async (analysisData: Record<string, unknown>): Promise<DatasetAnalysis> => {
  const response = await visionApi.post('/analysis/upload', analysisData);
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Get a signed URL for uploading a dataset archive straight to file-service
 */
const getAnalysisUploadUrl = async (file: File): Promise<AnalysisUploadUrl> => {
  const response = await visionApi.post('/analysis/upload-url', {
    filename: file.name,
    mimetype: file.type || 'application/octet-stream'
  });
  return (response.data as ApiResponse<AnalysisUploadUrl>).data;
};

/**
 * Upload the archive to the signed URL.
 *
 * Deliberately raw `fetch`, not `visionApi`: the signed URL points at
 * file-service directly, so it needs neither the `/api` base URL nor the
 * shared auth cookie (the signature in the URL itself is the credential).
 */
const uploadDatasetFile = async (uploadUrl: string, file: File): Promise<void> => {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' }
  });

  if (!response.ok) {
    throw new Error('Failed to upload dataset file');
  }
};

/** Store the archive and return the `fileId` the backend records against it. */
export const uploadDatasetArchive = async (file: File): Promise<string> => {
  const upload = await getAnalysisUploadUrl(file);
  await uploadDatasetFile(upload.uploadUrl, file);
  return upload.fileId;
};

/**
 * Create a new dataset from an uploaded archive.
 *
 * Size is read off the stored file by the backend, so it is never passed here.
 */
export const createAnalysis = async (datasetName: string, file?: File): Promise<DatasetAnalysis> => {
  const fileId = file ? await uploadDatasetArchive(file) : undefined;

  const response = await visionApi.post('/analysis/upload', { dataset: datasetName, fileId });
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Get all analyses
 */
export const getAllAnalyses = async (
  limit: number = 50,
  skip: number = 0,
  dataset?: string
): Promise<AnalysisResponse> => {
  const params: Record<string, unknown> = { limit, skip };
  if (dataset) {
    params.dataset = dataset;
  }

  const response = await visionApi.get('/analysis', { params });
  return response.data as AnalysisResponse;
};

/**
 * Get analyses by dataset name
 */
export const getAnalysesByDataset = async (
  datasetName: string,
  limit: number = 50,
  skip: number = 0
): Promise<AnalysisResponse> => {
  const response = await visionApi.get(`/analysis/dataset/${datasetName}`, { params: { limit, skip } });
  return response.data as AnalysisResponse;
};

/**
 * Get analysis by ID
 */
export const getAnalysisById = async (id: string): Promise<DatasetAnalysis> => {
  const response = await visionApi.get(`/analysis/${id}`);
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Update analysis by ID. Only the fields passed are written — omitting `data`
 * leaves the stored analysis JSON untouched.
 */
export const updateAnalysis = async (
  id: string,
  analysisData: { dataset?: string; fileId?: string; data?: Record<string, unknown> }
): Promise<DatasetAnalysis> => {
  const response = await visionApi.put(`/analysis/${id}`, analysisData);
  return (response.data as ApiResponse<DatasetAnalysis>).data;
};

/**
 * Rename a dataset and optionally replace its archive
 */
export const editAnalysis = async (id: string, datasetName: string, file?: File): Promise<DatasetAnalysis> => {
  const fileId = file ? await uploadDatasetArchive(file) : undefined;

  return updateAnalysis(id, { dataset: datasetName, fileId });
};

/**
 * Get a download URL for an analysis' dataset archive
 */
export const getAnalysisDownloadUrl = async (id: string): Promise<{ downloadUrl: string; expiresAt?: string }> => {
  const response = await visionApi.get(`/analysis/${id}/download`);
  return (response.data as ApiResponse<{ downloadUrl: string; expiresAt?: string }>).data;
};

/**
 * Delete analysis by ID
 */
export const deleteAnalysis = async (id: string): Promise<void> => {
  await visionApi.delete(`/analysis/${id}`);
};

/**
 * Compare multiple analyses
 */
export const compareAnalyses = async (analysisIds: string[]): Promise<AnalysisComparisonResponse> => {
  const response = await visionApi.post('/analysis/compare', { analysisIds });
  return response.data as AnalysisComparisonResponse;
};
