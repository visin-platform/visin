// @ts-nocheck
import { Request, Response } from 'express';
import {
  getImages,
  createDatasetImage as createDatasetImageService,
  getImagesByCategory as getImagesByCategoryService,
  getAllImageStats as getAllImageStatsService,
  getLabelingStats as getLabelingStatsService,
  getSimpleLabelingStats as getSimpleLabelingStatsService,
  exportImagesByLabels as exportImagesByLabelsService,
  getImageById as getImageByIdService,
  updateImage as updateImageService,
  deleteImage as deleteImageService,
  getUploadSignedUrlRequest as getUploadSignedUrlRequestService,
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

// Get images by dataset and category
export const getImagesByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId, categoryId } = req.params;
    const { page = 1, limit, search, labels } = req.query as any;

    let searchParam: any;
    if (typeof search === 'string') {
      searchParam = search;
    } else if (Array.isArray(search)) {
      searchParam = search[0];
    } else {
      searchParam = undefined;
    }

    let labelsParam: any;
    if (typeof labels === 'string') {
      labelsParam = labels;
    } else if (Array.isArray(labels)) {
      labelsParam = labels[0];
    } else {
      labelsParam = undefined;
    }

    let pageParam: any;
    if (typeof page === 'string') {
      pageParam = Number(page);
    } else if (Array.isArray(page)) {
      pageParam = Number(page[0]);
    } else {
      pageParam = 1;
    }

    let limitParam: any;
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

    const result = await (getImagesByCategoryService as any)(datasetId, categoryId, {
      page: pageParam,
      limit: limitParam,
      search: searchParam,
      labels: labelsParam
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching dataset images by category:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dataset images by category';
    
    if (errorMessage.includes('not found')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dataset images by category'
      });
    }
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

// Get labeling statistics (comprehensive for all datasets or specific dataset)
export const getLabelingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;
    const result = await getLabelingStatsService(datasetId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching labeling statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch labeling statistics'
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

// Export images by labels to CSV
export const exportImagesByLabels = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;
    const { labels } = req.query as any;

    if (!labels) {
      res.status(400).json({
        success: false,
        message: 'Labels parameter is required'
      });
      return;
    }

    let labelsParam: any;
    if (typeof labels === 'string') {
      labelsParam = labels;
    } else if (Array.isArray(labels)) {
      labelsParam = labels.join(',');
    } else {
      labelsParam = '';
    }

    const { images, labelsArray } = await (exportImagesByLabelsService as any)(datasetId, labelsParam);

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="images_${labelsArray.join('_')}_${Date.now()}.csv"`);

    // CSV header
    let csv = 'ID,Filename,Original Name,Category Name,Labels,Tags,Size,Width,Height,Created At\n';

    // Add data rows
    images.forEach((image: any) => {
      const labelsStr = image.labels.join(';');
      const tagsStr = image.tags.join(';');
      const categoryName = image.categoryId?.name || 'Unknown';
      csv += `"${image._id}","${image.filename}","${image.originalName}","${categoryName}","${labelsStr}","${tagsStr}",${image.size},${image.width || ''},${image.height || ''},"${image.createdAt}"\n`;
    });

    res.send(csv);
  } catch (error) {
    console.error('Error exporting images to CSV:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to export images to CSV';
    
    if (errorMessage.includes('not found')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to export images to CSV'
      });
    }
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

// Get upload signed URL for direct client upload
export const getUploadSignedUrlRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename, mimetype, datasetId, categoryId } = req.body;
    const userId = (req as any).user?.id || 'anonymous';

    console.info('Getting upload signed URL', { filename, mimetype, datasetId, categoryId, userId });

    if (!filename || !mimetype || !datasetId) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: filename, mimetype, datasetId'
      });
      return;
    }

    const result = await getUploadSignedUrlRequestService({
      filename,
      mimetype,
      datasetId,
      categoryId,
      userId
    });

    console.info('Generated upload URL successfully');

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting upload signed URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get upload signed URL';
    
    if (errorMessage === 'Invalid categoryId. Category does not exist.') {
      res.status(400).json({ success: false, message: errorMessage });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to get upload signed URL'
      });
    }
  }
};

// Export image names as CSV
export const exportImageNames = async (req: Request, res: Response): Promise<void> => {
  try {
    const { datasetId } = req.params;
    const { tag } = req.query as any;

    if (!datasetId) {
      res.status(400).json({
        success: false,
        message: 'Dataset ID is required'
      });
      return;
    }

    let tagParam: any;
    if (typeof tag === 'string') {
      tagParam = tag;
    } else if (Array.isArray(tag)) {
      tagParam = tag[0];
    } else {
      tagParam = undefined;
    }

    const images = await (exportImageNamesService as any)(datasetId, tagParam);

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="images_${tag || 'all'}_${new Date().toISOString().split('T')[0]}.csv"`);

    // Generate CSV content - just image names, one per line
    let csv = '';
    images.forEach((image: any) => {
      const imageName = image.title || image.originalName || image.filename;
      csv += `${imageName}\n`;
    });

    res.send(csv);
  } catch (error) {
    console.error('Error exporting image names:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export image names'
    });
  }
};
