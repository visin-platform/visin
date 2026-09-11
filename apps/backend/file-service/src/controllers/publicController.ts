import { Request, Response } from 'express';
import { NotFoundError, logger } from '@visin/backend-core';
import { openRead, fileExists } from '../utils/storage';

import { uploadFile, parseContentRange, parseContentLength } from '../services/uploadService';

/** Controllers only translate the streaming service's result into the existing protocol. */
export const uploadPublic = async (req: Request, res: Response): Promise<void> => {
  const fileId = [req.params.fileId].flat().join('/');
  res.setHeader('Connection', 'close');
  res.once('finish', () => req.destroy());
  const result = await uploadFile(fileId, req, {
    reservationId: String(req.query.reservation),
    range: parseContentRange(req.headers['content-range'] as string | undefined),
    contentLength: parseContentLength(req.headers['content-length'])
  });
  res.status(result.conflict ? 409 : 200).json({
    success: !result.conflict, fileId, size: result.size, complete: result.complete,
    message: result.conflict ? 'Chunk start does not match the committed size' : result.complete ? 'File uploaded' : 'Chunk stored'
  });
};

/**
 * GET /files/download/:fileId?token=...&expires=...
 * Browser-direct download/display. Token validated by requireSignedToken middleware.
 */
export const downloadPublic = async (req: Request, res: Response): Promise<void> => {
  const fileId = [req.params.fileId].flat().join('/');

  if (!await fileExists(fileId)) {
    throw new NotFoundError('File not found');
  }

  const { stream, ...meta } = await openRead(fileId);

  // Attempt a basic content-type guess from extension
  const ext = fileId.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    pdf: 'application/pdf'
  };
  const contentType = mimeMap[ext] ?? 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', meta.size);
  res.setHeader('Cache-Control', 'private, max-age=3600');

  // Stream errors are event-driven, not thrown — Express can't forward these automatically.
  stream.on('error', (err) => {
    logger.error('Public download stream failed', { fileId, error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Download failed' });
    } else {
      res.destroy(err);
    }
  });

  stream.pipe(res);
};
