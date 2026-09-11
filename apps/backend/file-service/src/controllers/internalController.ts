import { Request, Response } from 'express';
import { NotFoundError, logger } from '@visin/backend-core';
import {
  openRead,
  deleteFile,
  deleteByPrefix,
  fileExists,
  getMetadata,
  listFiles
} from '../utils/storage';

import { uploadFile, parseContentLength } from '../services/uploadService';

export const internalUpload = async (req: Request, res: Response): Promise<void> => {
  const fileId = [req.params.fileId].flat().join('/');
  res.setHeader('Connection', 'close');
  res.once('finish', () => req.destroy());
  const result = await uploadFile(fileId, req, { internal: true, contentLength: parseContentLength(req.headers['content-length']) });
  res.status(200).json({ success: true, fileId, size: result.size });
};

/** `bytes=<start>-<end>`, end optional. Anything else is ignored (full body). */
const parseRange = (header: string | undefined, size: number): { start: number; end: number } | null => {
  const match = /^bytes=(\d+)-(\d*)$/.exec((header || '').trim());
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  return start > end || start >= size ? null : { start, end };
};

/**
 * GET /internal/files/:fileId
 * Server-to-server download – returns raw binary.
 *
 * Honours `Range`, which is what lets label-service read a bundle zip's central
 * directory (a few hundred KB at the tail) instead of streaming the whole
 * multi-hundred-MB archive just to list its entries.
 */
export const internalDownload = async (req: Request, res: Response): Promise<void> => {
  const fileId = [req.params.fileId].flat().join('/');

  if (!await fileExists(fileId)) {
    throw new NotFoundError('File not found');
  }

  const { stream, range, ...meta } = await openRead(fileId, size => parseRange(req.headers.range, size));

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'application/octet-stream');
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${meta.size}`);
    res.setHeader('Content-Length', range.end - range.start + 1);
  } else {
    res.setHeader('Content-Length', meta.size);
  }

  // Stream errors are event-driven, not thrown — Express can't forward these automatically.
  stream.on('error', (err) => {
    logger.error('Internal download stream failed', { fileId, error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Download failed' });
    } else {
      res.destroy(err);
    }
  });

  stream.pipe(res);
};

/**
 * HEAD /internal/files/:fileId
 * Check file existence.
 */
export const internalExists = async (req: Request, res: Response): Promise<void> => {
  const fileId = [req.params.fileId].flat().join('/');
  if (await fileExists(fileId)) {
    res.status(200).end();
  } else {
    res.status(404).end();
  }
};

/**
 * GET /internal/meta/:fileId
 * Returns size and lastModified.
 */
export const internalMetadata = async (req: Request, res: Response): Promise<void> => {
  const fileId = [req.params.fileId].flat().join('/');

  if (!await fileExists(fileId)) {
    throw new NotFoundError('File not found');
  }

  const meta = await getMetadata(fileId);
  res.json({ success: true, data: meta });
};

/**
 * DELETE /internal/files/:fileId
 * Delete a single file.
 */
export const internalDelete = async (req: Request, res: Response): Promise<void> => {
  const fileId = [req.params.fileId].flat().join('/');
  await deleteFile(fileId);
  res.json({ success: true, message: 'File deleted' });
};

/**
 * DELETE /internal/files/folder
 * Body: { prefix: string }
 * Delete all files matching a path prefix (folder delete).
 */
export const internalDeleteFolder = async (req: Request, res: Response): Promise<void> => {
  const { prefix } = req.body as { prefix: string };
  const count = await deleteByPrefix(prefix);
  res.json({ success: true, message: `Deleted ${count} file(s)`, count });
};

/**
 * GET /internal/files?prefix=...&maxKeys=...
 * List files.
 */
export const internalList = async (req: Request, res: Response): Promise<void> => {
  const { prefix, maxKeys, recursive } = req.query as unknown as {
    prefix?: string;
    maxKeys: number;
    recursive: boolean;
  };
  const files = await listFiles(prefix, maxKeys, recursive);
  res.json({ success: true, data: files });
};
