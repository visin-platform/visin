import { Request, Response } from 'express';
import { logger } from '@visin/backend-core';
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
import type { GetAllImagesQuery, GetImagesByDatasetQuery } from '../validation/datasetImageSchemas';

// Get all images
export const getAllImages = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, search, tags, random, weatherCondition } = req.query as unknown as GetAllImagesQuery;

  const result = await getImages({
    page,
    limit,
    search,
    tags: tags ? tags.split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0) : undefined,
    weatherCondition,
    random: random === 'true'
  });

  res.json({
    success: true,
    data: result
  });
};

export const createDatasetImage = async (req: Request, res: Response): Promise<void> => {
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
    tags,
    labels,
    weatherCondition,
    metadata
  } = req.body;

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

  logger.info('Dataset image created', {
    id: savedImage._id,
    datasetId,
    categoryId,
    minioFileId
  });

  res.status(201).json({
    success: true,
    message: 'Dataset image created successfully',
    data: savedImage
  });
};

// Get images by dataset
export const getImagesByDataset = async (req: Request, res: Response): Promise<void> => {
  const datasetId = req.params.datasetId as string;
  const { page, limit, search, categoryId, tags, weatherCondition, sortBy, sortOrder } =
    req.query as unknown as GetImagesByDatasetQuery;

  const result = await getImages({
    datasetId,
    page,
    limit,
    search,
    categoryId,
    tags: tags ? tags.split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0) : undefined,
    weatherCondition,
    sortBy,
    sortOrder
  });

  res.json({
    success: true,
    data: result
  });
};

// Get comprehensive image statistics across all datasets
export const getAllImageStats = async (req: Request, res: Response): Promise<void> => {
  const result = await getAllImageStatsService();

  res.json({
    success: true,
    data: result
  });
};

// Get simple labeling statistics for a specific dataset (total, good, bad counts only)
export const getSimpleLabelingStats = async (req: Request, res: Response): Promise<void> => {
  const datasetId = req.params.datasetId as string;
  const result = await getSimpleLabelingStatsService(datasetId);

  res.json({
    success: true,
    data: result
  });
};

export const getImageById = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const result = await getImageByIdService(id);

  res.json({
    success: true,
    data: result
  });
};

// Update image
export const updateImage = async (req: Request, res: Response): Promise<void> => {
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
};

// Delete image
export const deleteImage = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const result = await deleteImageService(id);

  logger.info('Dataset image deleted', { id, ...result });

  res.json({
    success: true,
    message: 'Dataset image deleted successfully'
  });
};

// Export image names as CSV
export const exportImageNames = async (req: Request, res: Response): Promise<void> => {
  const datasetId = req.params.datasetId as string;
  const tag = (req.query as { tag?: string }).tag;

  const images = await exportImageNamesService(datasetId, tag);

  // Create CSV content
  const csvRows = images.map(img => `camera/${img.filename}`).join('\n');
  const csvContent = csvRows;

  // Set headers for CSV download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="images_${tag || 'all'}_${datasetId}.csv"`);

  res.send(csvContent);
};
