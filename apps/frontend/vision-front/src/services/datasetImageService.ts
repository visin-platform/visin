import { visionApi } from '../config/visionApi';

export type WeatherCondition = 'day_fair' | 'night_fair' | 'day_rain' | 'night_rain' | 'snow';

export interface DatasetImage {
  _id: string;
  filename: string;
  originalName: string;
  minioFileId: string;
  minioThumbnailFileId?: string;
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
  weatherCondition?: WeatherCondition;
  metadata: any;
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
  weatherCondition?: WeatherCondition
): Promise<DatasetImagesResponse> => {
  const response = await visionApi.get('/dataset-images', {
    params: {
      page,
      limit,
      search,
      tags,
      random: random ? 'true' : undefined,
      weatherCondition
    }
  });
  return response.data;
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
  weatherCondition?: WeatherCondition,
  sortBy?: 'updatedAt' | 'createdAt' | 'filename',
  sortOrder?: 'asc' | 'desc'
): Promise<DatasetImagesResponse> => {
  const response = await visionApi.get(`/dataset-images/dataset/${datasetId}`, {
    params: { page, limit, search, categoryId, tags, weatherCondition, sortBy, sortOrder }
  });
  return response.data;
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
  return response.data;
};

/**
 * Get image by ID
 */
export const getImageById = async (id: string): Promise<DatasetImage> => {
  const response = await visionApi.get(`/dataset-images/${id}`);
  return response.data.data;
};

/**
 * Create dataset image
 */
export const createDatasetImage = async (imageData: {
  filename: string;
  originalName: string;
  minioFileId: string;
  datasetId: string;
  categoryId?: string;
  title?: string;
  description?: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  tags?: string[];
  labels?: string[];
  weatherCondition?: WeatherCondition;
  metadata?: any;
}): Promise<DatasetImage> => {
  const response = await visionApi.post('/dataset-images', imageData);
  return response.data.data;
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
    weatherCondition?: WeatherCondition;
    metadata?: any;
  }
): Promise<DatasetImage> => {
  const response = await visionApi.put(`/dataset-images/${id}`, updateData);
  return response.data.data;
};

/**
 * Delete dataset image
 */
export const deleteDatasetImage = async (id: string): Promise<void> => {
  await visionApi.delete(`/dataset-images/${id}`);
};

/**
 * Get upload signed URL for direct client upload
 */
export const getUploadSignedUrl = async (data: {
  filename: string;
  mimetype: string;
  datasetId: string;
  categoryId?: string;
}): Promise<{
  uploadUrl: string;
  minioFileId: string;
  datasetId: string;
  categoryId?: string;
  expiresInMinutes: number;
}> => {
  const response = await visionApi.post('/dataset-images/upload-url', data);
  return response.data.data;
};

/**
 * Upload file to signed URL.
 *
 * Deliberately raw `fetch`, not `visionApi`: the signed URL points at
 * object storage (MinIO), not vision-service — it needs neither the
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

/**
 * Get labeling statistics for all images (efficient aggregation)
 */
export const getLabelingStats = async (): Promise<{
  total: number;
  good: number;
  bad: number;
  unlabeled: number;
  goodPercentage: number;
  badPercentage: number;
  unlabeledPercentage: number;
}> => {
  const response = await visionApi.get('/datasets/labeling-stats');
  return response.data.data;
};