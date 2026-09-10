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
  exportImageNames as exportImageNamesService,
  getUploadSignedUrlRequest
} from '../services/datasetImageService';
import type {
  ExportImageNamesQuery,
  GetAllImagesQuery,
  GetImagesByDatasetQuery,
  GetUploadUrlBody
} from '../validation/datasetImageSchemas';

// Signed URL for uploading a dataset image straight to file-service
export const getUploadUrl = async (req: Request, res: Response): Promise<void> => {
  const { filename, mimetype, datasetId, categoryId } = req.body as GetUploadUrlBody;

  const data = await getUploadSignedUrlRequest({
    filename,
    mimetype,
    datasetId,
    categoryId,
    userId: req.user?.id as string
  });

  res.json({
    success: true,
    data
  });
};

// Get all images
export const getAllImages = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, search, tags, random, condition } = req.query as unknown as GetAllImagesQuery;

  const result = await getImages({
    page,
    limit,
    search,
    tags: tags ? tags.split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0) : undefined,
    condition,
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
    fileId,
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
    condition,
    metadata
  } = req.body;

  const savedImage = await createDatasetImageService({
    filename,
    originalName,
    fileId,
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
    condition,
    metadata
  }, req.user?.id);

  logger.info('Dataset image created', {
    id: savedImage._id,
    datasetId,
    categoryId,
    fileId
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
  const { page, limit, search, categoryId, tags, condition, sortBy, sortOrder } =
    req.query as unknown as GetImagesByDatasetQuery;

  const result = await getImages({
    datasetId,
    page,
    limit,
    search,
    categoryId,
    tags: tags ? tags.split(' ').map(tag => tag.trim()).filter(tag => tag.length > 0) : undefined,
    condition,
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
  const { title, description, tags, labels, categoryId, condition, metadata } = req.body;

  const image = await updateImageService(id, {
    title,
    description,
    tags,
    labels,
    categoryId,
    condition,
    metadata
  }, req.user?.id);

  res.json({
    success: true,
    message: 'Dataset image updated successfully',
    data: image
  });
};

// Delete image
export const deleteImage = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const result = await deleteImageService(id, req.user?.id);

  logger.info('Dataset image deleted', { id, ...result });

  res.json({
    success: true,
    message: 'Dataset image deleted successfully'
  });
};

// Export image names as CSV
export const exportImageNames = async (req: Request, res: Response): Promise<void> => {
  const datasetId = req.params.datasetId as string;
  const { tag, pathPrefix } = req.query as unknown as ExportImageNamesQuery;

  const images = await exportImageNamesService(datasetId, tag);

  // Create CSV content
  const csvRows = images.map(img => `${pathPrefix ?? ''}${img.filename}`).join('\n');
  const csvContent = csvRows;

  // Set headers for CSV download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="images_${tag || 'all'}_${datasetId}.csv"`);

  res.send(csvContent);
};
