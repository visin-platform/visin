import { Request, Response } from 'express';
import { reserveFileUpload } from '../services/uploadService';
import { resolvePath } from '../utils/paths';
import { signToken } from '../utils/hmac';
import { requireEnv, type z } from '@visin/backend-core';
import type { generateUploadUrlBodySchema, generateDownloadUrlBodySchema, generateDownloadUrlsBodySchema } from '../validation/fileSchemas';

// The address browsers are handed, so there is no production default: any
// fallback would send them to a host that is not this deployment.
const FILE_SERVICE_URL = (): string =>
  (
    process.env.FILE_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('FILE_SERVICE_URL') : 'http://localhost:5002')
  ).replace(/\/$/, '');

/**
 * POST /internal/upload-url
 * Body: { fileId, mimetype?, expiresInMinutes? }
 * Returns a signed PUT URL the browser can use to upload directly.
 */
export const generateUploadUrl = async (req: Request, res: Response): Promise<void> => {
  const { fileId, expiresInMinutes, mimetype, maxBytes } = req.body as z.infer<typeof generateUploadUrlBodySchema>;

  const expiresMs = Date.now() + expiresInMinutes * 60 * 1000;
  const reservation = await reserveFileUpload(fileId, mimetype, expiresMs, maxBytes);
  const token = signToken('upload', fileId, expiresMs, reservation);
  const uploadUrl = `${FILE_SERVICE_URL()}/files/upload/${fileId}?token=${token}&expires=${expiresMs}&reservation=${reservation}`;

  res.json({
    success: true,
    data: {
      uploadUrl,
      fileId,
      expiresMs,
      expiresInMinutes
    }
  });
};

/**
 * POST /internal/download-url
 * Body: { fileId, expiresInMinutes? }
 * Returns a signed GET URL the browser can use to download/display directly.
 */
const signedDownloadUrl = (fileId: string, expiresMs: number): string => {
  resolvePath(fileId);
  const token = signToken('download', fileId, expiresMs);
  return `${FILE_SERVICE_URL()}/files/download/${fileId}?token=${token}&expires=${expiresMs}`;
};

export const generateDownloadUrl = (req: Request, res: Response): void => {
  const { fileId, expiresInMinutes } = req.body as z.infer<typeof generateDownloadUrlBodySchema>;

  const expiresMs = Date.now() + expiresInMinutes * 60 * 1000;
  const downloadUrl = signedDownloadUrl(fileId, expiresMs);

  res.json({
    success: true,
    data: {
      downloadUrl,
      fileId,
      expiresMs,
      expiresInMinutes
    }
  });
};

/**
 * POST /internal/download-urls
 * Body: { fileIds, expiresInMinutes? }
 * Signed GET URLs for many files at once, keyed by fileId — a page of
 * thumbnails is dozens of files, and one round trip each was most of its latency.
 */
export const generateDownloadUrls = (req: Request, res: Response): void => {
  const { fileIds, expiresInMinutes } = req.body as z.infer<typeof generateDownloadUrlsBodySchema>;

  const expiresMs = Date.now() + expiresInMinutes * 60 * 1000;
  const urls = Object.fromEntries(fileIds.map((fileId) => [fileId, signedDownloadUrl(fileId, expiresMs)]));

  res.json({ success: true, data: { urls, expiresMs, expiresInMinutes } });
};
