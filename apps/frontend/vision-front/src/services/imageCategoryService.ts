import { visionApi } from '../config/visionApi';
import { ApiResponse } from '../types';

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
  const response = await visionApi.get(`/image-categories/dataset/${datasetId}`);
  return (response.data as ApiResponse<ImageCategory[]>).data;
};

/**
 * Get all categories
 */
export const getAllCategories = async (): Promise<ImageCategory[]> => {
  const response = await visionApi.get('/image-categories');
  return (response.data as ApiResponse<ImageCategory[]>).data;
};

/**
 * Get category by ID
 */
export const getCategoryById = async (id: string): Promise<ImageCategory> => {
  const response = await visionApi.get(`/image-categories/${id}`);
  return (response.data as ApiResponse<ImageCategory>).data;
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
  const response = await visionApi.post('/image-categories', categoryData);
  return (response.data as ApiResponse<ImageCategory>).data;
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
  const response = await visionApi.put(`/image-categories/${id}`, updateData);
  return (response.data as ApiResponse<ImageCategory>).data;
};

/**
 * Delete image category
 */
export const deleteImageCategory = async (id: string): Promise<void> => {
  await visionApi.delete(`/image-categories/${id}`);
};
