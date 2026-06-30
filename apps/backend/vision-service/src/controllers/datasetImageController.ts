import { Request, Response } from 'express';

function strParam(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}
import {
  getImages,
  createDatasetImage as createDatasetImageService,
  getAllImageStats as getAllImageStatsService,
  getSimpleLabelingStats as getSimpleLabelingStatsService,
  getImageById as getImageByIdService,
  updateImage as updateImageService,
  deleteImage as deleteImageService,
  exportImageNames as exportImageNamesService
} from '../services/datasetImageService';

// Get all images
export const getAllImages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, search, tags, random, weatherCondition } = req.query;

    const searchParam = typeof search === 'string' ? search : undefined;
    const tagsParam = typeof tags === 'string' ? tags : undefined;
    const weatherConditionParam = typeof weatherCondition === 'string' ? weatherCondition : undefined;
    const pageParam = typeof page === 'string' ? Number(page) : 1;
    const limitParam = typeof limit === 'string' ? Number(limit) : 50;

    const result = await getImages({
      page: pageParam,
      limit: limitParam,
      search: searchParam,
      tags: tagsParam ? tagsParam.split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0) : undefined,
      weatherCondition: weatherConditionParam,
      random: random === 'true'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching all images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch images'
    });
  }
};

export const createDatasetImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      filename,
      originalName,
      minioFileId,
      datasetId,
      categoryId,
      title,
      description,
      mimetype,
      size,
      width,
      height,
      tags = [],
      labels = [],
      weatherCondition,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!filename || !originalName || !minioFileId || !datasetId || !categoryId || !mimetype || !size) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: filename, originalName, minioFileId, datasetId, categoryId, mimetype, size'
      });
      return;
    }

    const savedImage = await createDatasetImageService({
      filename,
      originalName,
      minioFileId,
      datasetId,
      categoryId,
      title,
      description,
      mimetype,
      size,
      width,
      height,
      tags,
      labels,
      weatherCondition,
      metadata
    });

    console.info(`Dataset image created: ${savedImage._id}`, {
      datasetId,
      categoryId,
      minioFileId
    });

    res.status(201).json({
      success: true,
      message: 'Dataset image created successfully',
      data: savedImage
    });
  } catch (error) {
    console.error('Error creating dataset image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create dataset image';
    
    if (errorMessage === 'Invalid categoryId. Category does not exist.' || errorMessage.includes('Missing required fields')) {
      res.status(400).json({ success: false, message: errorMessage });
    } else if (errorMessage === 'Image with this MinIO file ID already exists') {
      res.status(409).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create dataset image'
      });
    }
  }
};

// Get images by dataset
export const getImagesByDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const datasetId = req.params.datasetId as string;
    const { page, limit, search, categoryId, tags, weatherCondition, sortBy, sortOrder } = req.query;

    const searchParam = strParam(search);
    const categoryIdParam = strParam(categoryId);
    const weatherConditionParam = strParam(weatherCondition);
    const sortByParam = strParam(sortBy) ?? 'updatedAt';
    const pageParam = Number(strParam(page) ?? '1') || 1;

    const sortOrderRaw = strParam(sortOrder) ?? 'desc';
    const sortOrderParam: 'asc' | 'desc' = sortOrderRaw === 'asc' ? 'asc' : 'desc';

    const limitRaw = strParam(limit);
    const limitParam: number | undefined = limitRaw ? Number(limitRaw) : undefined;

    let tagsParam: string | undefined;
    if (typeof tags === 'string') {
      tagsParam = tags;
    } else if (Array.isArray(tags)) {
      tagsParam = (tags as string[]).join(' ');
    }

    const result = await getImages({
      datasetId,
      page: pageParam,
      limit: limitParam,
      search: searchParam,
      categoryId: categoryIdParam,
      tags: tagsParam ? tagsParam.split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0) : undefined,
      weatherCondition: weatherConditionParam,
      sortBy: sortByParam,
      sortOrder: sortOrderParam
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching dataset images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dataset images'
    });
  }
};

// Get comprehensive image statistics across all datasets
export const getAllImageStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getAllImageStatsService();

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching comprehensive image statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comprehensive image statistics'
    });
  }
};

// Get simple labeling statistics for a specific dataset (total, good, bad counts only)
export const getSimpleLabelingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const datasetId = req.params.datasetId as string;
    const result = await getSimpleLabelingStatsService(datasetId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching simple labeling statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch simple labeling statistics'
    });
  }
};

export const getImageById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const result = await getImageByIdService(id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching dataset image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dataset image';
    
    if (errorMessage === 'Dataset image not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dataset image'
      });
    }
  }
};

// Update image
export const updateImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { title, description, tags, labels, categoryId, weatherCondition, metadata } = req.body;

    const image = await updateImageService(id, {
      title,
      description,
      tags,
      labels,
      categoryId,
      weatherCondition,
      metadata
    });

    res.json({
      success: true,
      message: 'Dataset image updated successfully',
      data: image
    });
  } catch (error) {
    console.error('Error updating dataset image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update dataset image';
    
    if (errorMessage === 'Dataset image not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to update dataset image'
      });
    }
  }
};

// Delete image
export const deleteImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const result = await deleteImageService(id);

    console.info(`Dataset image deleted: ${id}`, result);

    res.json({
      success: true,
      message: 'Dataset image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting dataset image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete dataset image';
    
    if (errorMessage === 'Dataset image not found') {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to delete dataset image'
      });
    }
  }
};

// Export image names as CSV
export const exportImageNames = async (req: Request, res: Response): Promise<void> => {
  try {
    const datasetId = req.params.datasetId as string;
    const tag = strParam(req.query.tag);

    const images = await exportImageNamesService(datasetId, tag);

    // Create CSV content
    const csvRows = images.map(img => `camera/${img.filename}`).join('\n');
    const csvContent = csvRows;

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="images_${tag || 'all'}_${datasetId}.csv"`);

    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting image names:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export image names'
    });
  }
};
