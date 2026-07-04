import { Request, Response } from 'express';
import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter } from 'mongoose';
import { NotFoundError } from '@visin/backend-core';
import Dataset, { IDataset } from '../models/Dataset';
import { getLabelingStats as getLabelingStatsService } from '../services/datasetImageService';
import { getSignedUrl as getMinioSignedUrl } from '../services/minioService';
import type { GetDatasetsQuery } from '../validation/datasetSchemas';

// Get all datasets
export const getDatasets = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, search, sortBy, order } = req.query as unknown as GetDatasetsQuery;

  const query: QueryFilter<IDataset> = { deletedAt: null };

  // Search functionality
  if (search) {
    query.$text = { $search: search };
  }

  const skip = (page - 1) * limit;

  const [datasets, total] = await Promise.all([
    Dataset.find(query)
      .sort({ [sortBy]: order })
      .skip(skip)
      .limit(limit),
    Dataset.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: {
      datasets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
};

// Get dataset by ID
export const getDatasetById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const dataset = await Dataset.findOne({ _id: id, deletedAt: null });

  if (!dataset) {
    throw new NotFoundError('Dataset not found');
  }

  res.json({
    success: true,
    data: dataset
  });
};

// Get dataset by UUID
export const getDatasetByUuid = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  const dataset = await Dataset.findOne({ uuid, deletedAt: null });

  if (!dataset) {
    throw new NotFoundError('Dataset not found');
  }

  res.json({
    success: true,
    data: dataset
  });
};

// Create dataset
export const createDataset = async (req: Request, res: Response): Promise<void> => {
  const { name, description, timestamp, dataset_info, annotations, camera, lidar, metadata, downloadUrl } = req.body;

  // Generate UUID if not provided
  const uuid = req.body.uuid || uuidv4();

  const dataset = new Dataset({
    uuid,
    name,
    description,
    timestamp: timestamp || new Date(),
    dataset_info,
    annotations,
    camera,
    lidar,
    metadata,
    downloadUrl
  });

  const savedDataset = await dataset.save();

  res.status(201).json({
    success: true,
    message: 'Dataset created successfully',
    data: savedDataset
  });
};

// Get labeling statistics for all images
export const getLabelingStats = async (req: Request, res: Response): Promise<void> => {
  const result = await getLabelingStatsService();

  res.json({
    success: true,
    data: result
  });
};

// Download dataset zip file
export const downloadDataset = async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;

  // Find the dataset by UUID
  const dataset = await Dataset.findOne({ uuid, deletedAt: null });

  if (!dataset) {
    throw new NotFoundError('Dataset not found');
  }

  let downloadUrl: string;

  // Use the downloadUrl field if it exists, otherwise generate default path
  if (dataset.downloadUrl) {
    // If it's a MinIO path, generate signed URL
    if (dataset.downloadUrl.startsWith('datasets/') || dataset.downloadUrl.startsWith('vision/')) {
      const signedUrlData = await getMinioSignedUrl(dataset.downloadUrl, 60);
      if (!signedUrlData) {
        throw new NotFoundError('Could not generate signed URL for the dataset');
      }
      downloadUrl = signedUrlData.signedUrl;
    } else {
      // If it's already a full URL, use it directly
      downloadUrl = dataset.downloadUrl;
    }
  } else {
    // Fallback to default path
    const minioKey = `datasets/${dataset.name}.zip`;
    const signedUrlData = await getMinioSignedUrl(minioKey, 60);
    if (!signedUrlData) {
      throw new NotFoundError('Could not generate signed URL for the dataset');
    }
    downloadUrl = signedUrlData.signedUrl;
  }

  res.json({
    success: true,
    data: {
      downloadUrl,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    }
  });
};

// Get signed URL for arbitrary MinIO path
export const getSignedUrlForPath = async (req: Request, res: Response): Promise<void> => {
  const { path } = req.query as unknown as { path: string };

  // Generate signed URL with 1 hour expiration
  const signedUrlData = await getMinioSignedUrl(path, 60);

  if (!signedUrlData) {
    throw new NotFoundError('Could not generate signed URL for the specified path');
  }

  res.json({
    success: true,
    data: {
      signedUrl: signedUrlData.signedUrl,
      expiresAt: signedUrlData.expiresAt
    }
  });
};
