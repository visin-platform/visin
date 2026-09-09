import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';

/**
 * A capture condition, as a free string. Images arrive from ingest pipelines over
 * the API, which cannot register a vocabulary first, so this is deliberately open —
 * a project's taxonomy relabels what turns up, it never limits it.
 */
export type ImageCondition = string;

export interface DatasetImage {
  _id: string;
  filename: string;
  originalName: string;
  fileId: string;
  thumbnailFileId?: string;
  datasetId: string;
  categoryId: string;
  title?: string;
  description?: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  tags: string[];
  labels: string[];
  condition?: ImageCondition;
  metadata: Record<string, unknown>;
  signedUrl?: string;
  signedUrlExpiresAt?: string;
  signedUrlExpiresInMinutes?: number;
  thumbnailSignedUrl?: string;
  thumbnailSignedUrlExpiresAt?: string;
  thumbnailSignedUrlExpiresInMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetImagesResponse {
  success: boolean;
  data: {
    images: DatasetImage[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

/**
 * Get all images
 */
export const getAllImages = async (
  page: number = 1,
  limit?: number,
  search?: string,
  tags?: string,
  random?: boolean,
  condition?: ImageCondition
): Promise<DatasetImagesResponse> => {
  const response = await visionApi.get('/dataset-images', {
    params: {
      page,
      limit,
      search,
      tags,
      random: random ? 'true' : undefined,
      condition
    }
  });
  return response.data as DatasetImagesResponse;
};

/**
 * Get images by dataset ID
 */
export const getImagesByDataset = async (
  datasetId: string,
  page: number = 1,
  limit?: number,
  search?: string,
  categoryId?: string,
  tags?: string,
  condition?: ImageCondition,
  sortBy?: 'updatedAt' | 'createdAt' | 'filename',
  sortOrder?: 'asc' | 'desc'
): Promise<DatasetImagesResponse> => {
  const response = await visionApi.get(`/dataset-images/dataset/${datasetId}`, {
    params: { page, limit, search, categoryId, tags, condition, sortBy, sortOrder }
  });
  return response.data as DatasetImagesResponse;
};

/**
 * Get images by dataset and category ID
 */
export const getImagesByCategory = async (
  datasetId: string,
  categoryId: string,
  page: number = 1,
  limit?: number,
  search?: string,
  labels?: string[]
): Promise<DatasetImagesResponse> => {
  const response = await visionApi.get(`/dataset-images/dataset/${datasetId}/category/${categoryId}`, {
    params: { page, limit, search, labels: labels && labels.length > 0 ? labels.join(',') : undefined }
  });
  return response.data as DatasetImagesResponse;
};

/**
 * Get image by ID
 */
export const getImageById = async (id: string): Promise<DatasetImage> => {
  const response = await visionApi.get(`/dataset-images/${id}`);
  return (response.data as ApiResponse<DatasetImage>).data;
};

/**
 * Create dataset image
 */
export const createDatasetImage = async (imageData: {
  filename: string;
  originalName: string;
  fileId: string;
  datasetId: string;
  // Required: every image record belongs to a category (enforced by the model).
  categoryId: string;
  title?: string;
  description?: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  tags?: string[];
  labels?: string[];
  condition?: ImageCondition;
  metadata?: Record<string, unknown>;
}): Promise<DatasetImage> => {
  const response = await visionApi.post('/dataset-images', imageData);
  return (response.data as ApiResponse<DatasetImage>).data;
};

/**
 * Update dataset image
 */
export const updateDatasetImage = async (
  id: string,
  updateData: {
    title?: string;
    description?: string;
    tags?: string[];
    labels?: string[];
    categoryId?: string;
    condition?: ImageCondition;
    metadata?: Record<string, unknown>;
  }
): Promise<DatasetImage> => {
  const response = await visionApi.put(`/dataset-images/${id}`, updateData);
  return (response.data as ApiResponse<DatasetImage>).data;
};

/**
 * Delete dataset image
 */
export const deleteDatasetImage = async (id: string): Promise<void> => {
  await visionApi.delete(`/dataset-images/${id}`);
};

interface UploadSignedUrlResult {
  uploadUrl: string;
  fileId: string;
  datasetId: string;
  categoryId?: string;
  expiresInMinutes: number;
}

/**
 * Get upload signed URL for direct client upload
 */
export const getUploadSignedUrl = async (data: {
  filename: string;
  mimetype: string;
  datasetId: string;
  categoryId?: string;
}): Promise<UploadSignedUrlResult> => {
  const response = await visionApi.post('/dataset-images/upload-url', data);
  return (response.data as ApiResponse<UploadSignedUrlResult>).data;
};

/**
 * Upload file to signed URL.
 *
 * Deliberately raw `fetch`, not `visionApi`: the signed URL points at
 * file-service directly, not vision-service — it needs neither the
 * `/api` base URL nor the shared auth cookie (the signature in the URL
 * itself is the credential).
 */
export const uploadFileToSignedUrl = async (signedUrl: string, file: File): Promise<void> => {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type
    }
  });

  if (!response.ok) {
    throw new Error('Failed to upload file to signed URL');
  }
};
