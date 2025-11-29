import { getGlobalConfig } from '../config/ConfigProvider';

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
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL || 'http://localhost:4010';

  const params = new URLSearchParams({ page: String(page) });
  if (limit) params.append('limit', String(limit));
  if (search) params.append('search', search);
  if (tags) params.append('tags', tags);
  if (random) params.append('random', 'true');
  if (weatherCondition) params.append('weatherCondition', weatherCondition);

  const response = await fetch(`${apiUrl}/api/dataset-images?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch images');
  }

  return response.json();
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
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const params = new URLSearchParams({ page: String(page) });
  if (limit) params.append('limit', String(limit));
  if (search) params.append('search', search);
  if (categoryId) params.append('categoryId', categoryId);
  if (tags) params.append('tags', tags);
  if (weatherCondition) params.append('weatherCondition', weatherCondition);
  if (sortBy) params.append('sortBy', sortBy);
  if (sortOrder) params.append('sortOrder', sortOrder);

  const response = await fetch(`${apiUrl}/api/dataset-images/dataset/${datasetId}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch dataset images');
  }

  return response.json();
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
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const params = new URLSearchParams({ page: String(page) });
  if (limit) params.append('limit', String(limit));
  if (search) params.append('search', search);
  if (labels && labels.length > 0) params.append('labels', labels.join(','));

  const response = await fetch(`${apiUrl}/api/dataset-images/dataset/${datasetId}/category/${categoryId}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch dataset images by category');
  }

  return response.json();
};

/**
 * Get image by ID
 */
export const getImageById = async (id: string): Promise<DatasetImage> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/dataset-images/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch dataset image');
  }

  const data = await response.json();
  return data.data;
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
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/dataset-images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(imageData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create dataset image');
  }

  const data = await response.json();
  return data.data;
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
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/dataset-images/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update dataset image');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Delete dataset image
 */
export const deleteDatasetImage = async (id: string): Promise<void> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/dataset-images/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete dataset image');
  }
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
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/dataset-images/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get upload signed URL');
  }

  const result = await response.json();
  return result.data;
};

/**
 * Upload file to signed URL
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
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/dataset-images/labeling-stats`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch labeling statistics');
  }

  const data = await response.json();
  return data.data;
};

// Image Category interfaces and functions
export interface ImageCategory {
  _id: string;
  name: string;
  description?: string;
  datasetId: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get categories by dataset ID
 */
export const getCategoriesByDataset = async (datasetId: string): Promise<ImageCategory[]> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/image-categories/dataset/${datasetId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch image categories');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Get all categories
 */
export const getAllCategories = async (): Promise<ImageCategory[]> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/image-categories`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch image categories');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Get category by ID
 */
export const getCategoryById = async (id: string): Promise<ImageCategory> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/image-categories/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch image category');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Create image category
 */
export const createImageCategory = async (categoryData: {
  name: string;
  description?: string;
  datasetId: string;
  color?: string;
}): Promise<ImageCategory> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/image-categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(categoryData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create image category');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Update image category
 */
export const updateImageCategory = async (
  id: string,
  updateData: {
    name?: string;
    description?: string;
    color?: string;
  }
): Promise<ImageCategory> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/image-categories/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update image category');
  }

  const data = await response.json();
  return data.data;
};

/**
 * Delete image category
 */
export const deleteImageCategory = async (id: string): Promise<void> => {
  const config = getGlobalConfig();
  const apiUrl = config.VISION_API_URL;

  const response = await fetch(`${apiUrl}/api/image-categories/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete image category');
  }
};