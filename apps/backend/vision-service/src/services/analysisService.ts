import { randomUUID } from 'crypto';
import { QueryFilter } from 'mongoose';
import { BadRequestError, NotFoundError, logger } from '@visin/backend-core';
import DatasetAnalysis, { IDatasetAnalysis } from '../models/DatasetAnalysis';
import {
  deleteFile,
  getFileMetadata,
  getSignedUrl,
  getUploadSignedUrl
} from './fileServiceClient';

// Every dataset archive lives under this prefix, one folder per upload.
const DATASET_FILE_PREFIX = 'datasets/';
const DATASET_FILE_ID_PATTERN = /^datasets\/[0-9a-f-]{36}\/[^/]+$/;
const UPLOAD_URL_EXPIRY_MINUTES = 15;
const DOWNLOAD_URL_EXPIRY_MINUTES = 60;

interface UploadAnalysisData {
  dataset: string;
  fileId?: string;
  data?: Record<string, unknown>;
}

interface GetAnalysesOptions {
  dataset?: string;
  limit: number;
  skip: number;
}

interface UpdateAnalysisData {
  dataset?: string;
  fileId?: string;
  data?: Record<string, unknown>;
}

/**
 * A client only ever posts back a `fileId` this service handed it, so anything
 * off that shape is a caller trying to attach an unrelated file-service path
 * (someone else's image, another dataset's archive) to their own analysis.
 */
const assertDatasetFileId = (fileId: string): void => {
  if (!DATASET_FILE_ID_PATTERN.test(fileId)) {
    throw new BadRequestError('Invalid fileId: expected an upload URL issued by this service');
  }
};

/** Strip path separators and other trouble out of a browser-supplied filename. */
const sanitizeFilename = (filename: string): string => {
  const base = filename.split(/[\\/]/).pop() || 'dataset.zip';
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  return safe.slice(0, 100) || 'dataset.zip';
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes read oddly as "1.0 B"; everything above gets one decimal.
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
};

/**
 * The stored file's own metadata is the only trustworthy source for size — a
 * browser-reported byte count is just another client-supplied field.
 */
const readSize = async (fileId: string): Promise<string | undefined> => {
  try {
    const metadata = await getFileMetadata(fileId);
    return formatBytes(metadata.size);
  } catch (error) {
    logger.warn('Could not read uploaded dataset size', { fileId, error: (error as Error).message });
    return undefined;
  }
};

/**
 * `downloadUrl` is exposed for backwards compatibility with clients (and with
 * records written before `fileId` existed, which kept the value inside `data`).
 */
const toAnalysisResponse = (analysis: IDatasetAnalysis) => {
  const plain = analysis.toObject();
  return {
    ...plain,
    downloadUrl: analysis.fileId || (analysis.data?.downloadUrl as string | undefined)
  };
};

/** The archive backing an analysis, whichever generation of record it is. */
const storedFileId = (analysis: IDatasetAnalysis): string | undefined =>
  analysis.fileId || (analysis.data?.downloadUrl as string | undefined);

/**
 * Mint a signed upload URL, and — when a `dataset` name is supplied — reserve
 * the record for it up front in `pending` state.
 *
 * Reserving first is what makes a rejected create fail in milliseconds: every
 * database-level objection (a duplicate key, a validation error, a stale index)
 * is raised here, before the browser sends a single byte. Writing the record
 * last meant a multi-GB archive had to finish uploading before the insert could
 * be attempted at all.
 *
 * `dataset` is omitted when replacing an existing analysis's archive: that
 * record already exists, so there is nothing to reserve.
 */
export const createUploadUrl = async ({
  filename,
  mimetype,
  dataset
}: {
  filename: string;
  mimetype: string;
  dataset?: string;
}) => {
  const fileId = `${DATASET_FILE_PREFIX}${randomUUID()}/${sanitizeFilename(filename)}`;

  // Before the signed URL: a failed reservation must not leave a live upload
  // URL pointing at a file nothing will ever claim.
  let analysisId: string | undefined;
  if (dataset) {
    const reserved = await DatasetAnalysis.create({ dataset, fileId, status: 'pending', data: {} });
    analysisId = String(reserved._id);
    logger.info('Dataset analysis reserved', { dataset, id: analysisId, fileId });
  }

  const uploadUrl = await getUploadSignedUrl(fileId, mimetype, UPLOAD_URL_EXPIRY_MINUTES);

  return { uploadUrl, fileId, expiresInMinutes: UPLOAD_URL_EXPIRY_MINUTES, analysisId };
};

/**
 * Mark a reserved analysis complete once its archive has finished uploading.
 *
 * Takes no `fileId`: the reservation already recorded the one this service
 * issued, so a client cannot swap in a different file at the finish line.
 * Idempotent — completing an already-ready record just returns it, so a
 * retried request after a dropped response is harmless.
 */
export const completeAnalysis = async (id: string) => {
  const analysis = await findAnalysisOrThrow(id);

  if (analysis.status !== 'pending') {
    return toAnalysisResponse(analysis);
  }

  if (!analysis.fileId) {
    throw new BadRequestError('Analysis has no uploaded archive to complete');
  }

  analysis.size = await readSize(analysis.fileId);
  analysis.status = 'ready';
  await analysis.save();

  logger.info('Dataset analysis completed', { dataset: analysis.dataset, id: analysis._id });

  return toAnalysisResponse(analysis);
};

export const uploadAnalysis = async (analysisData: UploadAnalysisData) => {
  if (analysisData.fileId) {
    assertDatasetFileId(analysisData.fileId);
  }

  const analysis = new DatasetAnalysis({
    dataset: analysisData.dataset,
    fileId: analysisData.fileId,
    size: analysisData.fileId ? await readSize(analysisData.fileId) : undefined,
    data: analysisData.data || {}
  });

  await analysis.save();

  logger.info('Dataset analysis uploaded', { dataset: analysisData.dataset, id: analysis._id });

  return toAnalysisResponse(analysis);
};

export const getAllAnalyses = async ({ dataset, limit, skip }: GetAnalysesOptions) => {
  // `$ne: 'pending'` rather than `status: 'ready'`: records predating the field
  // carry no value and must still be listed.
  const query: QueryFilter<IDatasetAnalysis> = { status: { $ne: 'pending' } };
  if (dataset) {
    query.dataset = dataset;
  }

  const total = await DatasetAnalysis.countDocuments(query);
  const analyses = await DatasetAnalysis.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);

  return {
    analyses: analyses.map(toAnalysisResponse),
    pagination: {
      total,
      limit,
      skip
    }
  };
};

const findAnalysisOrThrow = async (id: string) => {
  const analysis = await DatasetAnalysis.findById(id);
  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }
  return analysis;
};

export const getAnalysisById = async (id: string) => toAnalysisResponse(await findAnalysisOrThrow(id));

export const updateAnalysis = async (id: string, updateData: UpdateAnalysisData) => {
  const analysis = await findAnalysisOrThrow(id);

  if (updateData.dataset !== undefined) {
    analysis.dataset = updateData.dataset;
  }

  if (updateData.data !== undefined) {
    analysis.data = updateData.data;
    analysis.markModified('data');
  }

  if (updateData.fileId !== undefined) {
    assertDatasetFileId(updateData.fileId);
    const replaced = analysis.fileId;
    analysis.fileId = updateData.fileId;
    analysis.size = await readSize(updateData.fileId);
    // Replacing the archive orphans the old one; nothing else references it.
    if (replaced && replaced !== updateData.fileId) {
      await deleteFile(replaced);
    }
  }

  await analysis.save();

  logger.info('Dataset analysis updated', { id: analysis._id, dataset: analysis.dataset });

  return toAnalysisResponse(analysis);
};

export const getAnalysisByDataset = async (dataset: string, { limit, skip }: Omit<GetAnalysesOptions, 'dataset'>) => {
  // Reserved-but-not-yet-uploaded records stay hidden — see getAllAnalyses.
  const query: QueryFilter<IDatasetAnalysis> = { dataset, status: { $ne: 'pending' } };
  const total = await DatasetAnalysis.countDocuments(query);
  const analyses = await DatasetAnalysis.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip);

  return {
    analyses: analyses.map(toAnalysisResponse),
    pagination: {
      total,
      limit,
      skip
    }
  };
};

/**
 * Resolves the archive to something the browser can fetch. Legacy records may
 * hold an external URL rather than a stored file, so those pass through as-is.
 */
export const getAnalysisDownload = async (id: string) => {
  const analysis = await findAnalysisOrThrow(id);
  const fileId = storedFileId(analysis);

  if (!fileId) {
    throw new NotFoundError('This dataset has no file to download');
  }

  if (/^https?:\/\//i.test(fileId)) {
    return { downloadUrl: fileId };
  }

  const signedUrlData = await getSignedUrl(fileId, DOWNLOAD_URL_EXPIRY_MINUTES);
  if (!signedUrlData) {
    throw new NotFoundError('Could not generate a download URL for this dataset');
  }

  return { downloadUrl: signedUrlData.signedUrl, expiresAt: signedUrlData.expiresAt };
};

export const deleteAnalysis = async (id: string) => {
  const analysis = await DatasetAnalysis.findByIdAndDelete(id);
  if (!analysis) {
    throw new NotFoundError('Analysis not found');
  }

  const fileId = storedFileId(analysis);
  if (fileId && fileId.startsWith(DATASET_FILE_PREFIX)) {
    await deleteFile(fileId);
  }

  logger.info('Dataset analysis deleted', { id: analysis._id });
};

export const compareAnalyses = async (analysisIds: string[]) => {
  const analyses = await DatasetAnalysis.find({ _id: { $in: analysisIds } })
    .sort({ timestamp: -1 });

  const comparison = analyses.map((analysis) => ({
    analysis: {
      _id: analysis._id,
      dataset: analysis.dataset,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt
    },
    data: analysis.data
  }));

  return {
    comparison,
    summary: {
      totalAnalyses: analyses.length,
      datasets: [...new Set(analyses.map((analysis) => analysis.dataset))]
    }
  };
};
