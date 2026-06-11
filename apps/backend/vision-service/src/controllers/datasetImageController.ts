// @ts-nocheck
import { Request, Response } from 'express';
import {
  getImages,
  createDatasetImage as createDatasetImageService,
  getAllImageStats as getAllImageStatsService,
  getSimpleLabelingStats as getSimpleLabelingStatsService,
  getImageById as getImageByIdService,
  updateImage as updateImageService,
  deleteImage as deleteImageService
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
    const { datasetId } = req.params;
    const { page = 1, limit, search, categoryId, tags, weatherCondition, sortBy = 'updatedAt', sortOrder = 'desc' } = req.query as any;

    let searchParam: any;
    if (typeof search === 'string') {
      searchParam = search;
    } else if (Array.isArray(search)) {
      searchParam = search[0];
    } else {
      searchParam = undefined;
    }

    let categoryIdParam: any;
    if (typeof categoryId === 'string') {
      categoryIdParam = categoryId;
    } else if (Array.isArray(categoryId)) {
      categoryIdParam = categoryId[0];
    } else {
      categoryIdParam = undefined;
    }

    let tagsParam: any;
    if (typeof tags === 'string') {
      tagsParam = tags;
    } else if (Array.isArray(tags)) {
      tagsParam = tags.join(' ');
    } else {
      tagsParam = undefined;
    }

    let weatherConditionParam: any;
    if (typeof weatherCondition === 'string') {
      weatherConditionParam = weatherCondition;
    } else if (Array.isArray(weatherCondition)) {
      weatherConditionParam = weatherCondition[0];
    } else {
      weatherConditionParam = undefined;
    }

    let sortByParam: any;
    if (typeof sortBy === 'string') {
      sortByParam = sortBy;
    } else if (Array.isArray(sortBy)) {
      sortByParam = sortBy[0];
    } else {
      sortByParam = 'updatedAt';
    }

    let sortOrderParam: any;
    if (typeof sortOrder === 'string' && (sortOrder === 'asc' || sortOrder === 'desc')) {
      sortOrderParam = sortOrder;
    } else if (Array.isArray(sortOrder) && (sortOrder[0] === 'asc' || sortOrder[0] === 'desc')) {
      sortOrderParam = sortOrder[0];
    } else {
      sortOrderParam = 'desc';
    }

    let pageParam: any;
    if (typeof page === 'string') {
      pageParam = Number(page);
    } else if (Array.isArray(page)) {
      pageParam = Number(page[0]);
    } else {
      pageParam = 1;
    }

    let limitParam: number | undefined;
    if (limit) {
      if (typeof limit === 'string') {
        limitParam = Number(limit);
      } else if (Array.isArray(limit)) {
        limitParam = Number(limit[0]);
      } else {
        limitParam = undefined;
      }
    } else {
      limitParam = undefined;
    }

    const result = await (getImages as any)({
      datasetId,
      page: pageParam,
      limit: limitParam,
      search: searchParam,
      categoryId: categoryIdParam,
      tags: tagsParam ? tagsParam.split(' ').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0) : undefined,
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
    const { datasetId } = req.params;
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
    const { id } = req.params;
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
    const { id } = req.params;
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
    const { id } = req.params;
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
    const { datasetId } = req.params;
    const { tag } = req.query;

    // Get images for the dataset
    const result = await getImages({
      datasetId: datasetId,
      limit: 10000 // Export all images
    });

    let images = result.images;

    // Filter by tag if specified
    if (tag && tag !== 'all') {
      images = images.filter(img => img.tags && img.tags.includes(tag as string));
    }

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
