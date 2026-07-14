import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter } from 'mongoose';
import { NotFoundError } from '@visin/backend-core';
import Dataset, { IDataset } from '../models/Dataset';
import { getSignedUrl as getMinioSignedUrl } from './minioService';
import type { GetDatasetsQuery } from '../validation/datasetSchemas';

interface CreateDatasetData {
  uuid?: string;
  name: string;
  description?: string;
  timestamp?: Date;
  dataset_info?: unknown;
  annotations?: unknown;
  camera?: unknown;
  lidar?: unknown;
  metadata?: unknown;
  downloadUrl?: string;
}

const getDatasetByQuery = async (query: QueryFilter<IDataset>) => {
  const dataset = await Dataset.findOne({ ...query, deletedAt: null });

  if (!dataset) {
    throw new NotFoundError('Dataset not found');
  }

  return dataset;
};

export const getDatasets = async ({ page, limit, search, sortBy, order }: GetDatasetsQuery) => {
  const query: QueryFilter<IDataset> = { deletedAt: null };

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

  return {
    datasets,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

export const getDatasetById = async (id: string) => getDatasetByQuery({ _id: id });

export const getDatasetByUuid = async (uuid: string) => getDatasetByQuery({ uuid });

export const createDataset = async (data: CreateDatasetData) => {
  const dataset = new Dataset({
    uuid: data.uuid || uuidv4(),
    name: data.name,
    description: data.description,
    timestamp: data.timestamp || new Date(),
    dataset_info: data.dataset_info,
    annotations: data.annotations,
    camera: data.camera,
    lidar: data.lidar,
    metadata: data.metadata,
    downloadUrl: data.downloadUrl
  });

  return dataset.save();
};

export const getDatasetDownload = async (uuid: string) => {
  const dataset = await getDatasetByUuid(uuid);
  let downloadUrl: string;

  if (dataset.downloadUrl) {
    if (dataset.downloadUrl.startsWith('datasets/') || dataset.downloadUrl.startsWith('vision/')) {
      const signedUrlData = await getMinioSignedUrl(dataset.downloadUrl, 60);
      if (!signedUrlData) {
        throw new NotFoundError('Could not generate signed URL for the dataset');
      }
      downloadUrl = signedUrlData.signedUrl;
    } else {
      downloadUrl = dataset.downloadUrl;
    }
  } else {
    const minioKey = `datasets/${dataset.name}.zip`;
    const signedUrlData = await getMinioSignedUrl(minioKey, 60);
    if (!signedUrlData) {
      throw new NotFoundError('Could not generate signed URL for the dataset');
    }
    downloadUrl = signedUrlData.signedUrl;
  }

  return {
    downloadUrl,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  };
};

export const getSignedUrlForPath = async (path: string) => {
  const signedUrlData = await getMinioSignedUrl(path, 60);

  if (!signedUrlData) {
    throw new NotFoundError('Could not generate signed URL for the specified path');
  }

  return {
    signedUrl: signedUrlData.signedUrl,
    expiresAt: signedUrlData.expiresAt
  };
};
