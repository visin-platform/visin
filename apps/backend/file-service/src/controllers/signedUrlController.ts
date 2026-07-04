import { Request, Response } from 'express';
import { signToken } from '../utils/hmac';
import type { z } from '@visin/backend-core';
import type { generateUploadUrlBodySchema, generateDownloadUrlBodySchema } from '../validation/fileSchemas';

const FILE_SERVICE_URL = (): string =>
  (process.env.FILE_SERVICE_URL || 'http://localhost:5002').replace(/\/$/, '');

/**
 * POST /internal/upload-url
 * Body: { fileId, mimetype?, expiresInMinutes? }
 * Returns a signed PUT URL the browser can use to upload directly.
 */
export const generateUploadUrl = (req: Request, res: Response): void => {
  const { fileId, expiresInMinutes } = req.body as z.infer<typeof generateUploadUrlBodySchema>;

  const expiresMs = Date.now() + expiresInMinutes * 60 * 1000;
  const token = signToken('upload', fileId, expiresMs);
  const uploadUrl = `${FILE_SERVICE_URL()}/files/upload/${fileId}?token=${token}&expires=${expiresMs}`;

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
export const generateDownloadUrl = (req: Request, res: Response): void => {
  const { fileId, expiresInMinutes } = req.body as z.infer<typeof generateDownloadUrlBodySchema>;

  const expiresMs = Date.now() + expiresInMinutes * 60 * 1000;
  const token = signToken('download', fileId, expiresMs);
  const downloadUrl = `${FILE_SERVICE_URL()}/files/download/${fileId}?token=${token}&expires=${expiresMs}`;

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
