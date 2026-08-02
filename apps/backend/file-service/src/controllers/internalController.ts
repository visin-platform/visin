import { Request, Response } from 'express';
import { NotFoundError, logger } from '@visin/backend-core';
import {
  createWriteStream,
  createReadStream,
  deleteFile,
  deleteByPrefix,
  fileExists,
  getMetadata,
  listFiles
} from '../utils/storage';

/**
 * PUT /internal/files/:fileId
 * Server-to-server raw buffer upload.
 * Accepts raw binary body.
 *
 * Stream errors surface via event callbacks, not thrown exceptions/rejected
 * promises, so Express's automatic error forwarding doesn't reach them —
 * these still need to respond manually.
 */
export const internalUpload = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');
  const output = createWriteStream(fileId);
  let uploadedBytes = 0;
  let responded = false;

  const fail = (message: string, err: unknown): void => {
    if (responded) return;
    responded = true;
    logger.error(message, { fileId, error: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Upload failed' });
    } else {
      res.destroy();
    }
  };

  req.on('data', (chunk: Buffer) => {
    uploadedBytes += chunk.length;
  });

  req.on('error', (err) => fail('Internal upload request stream error', err));
  req.on('aborted', () => fail('Internal upload aborted', new Error('Client aborted request')));

  output.on('error', (err) => fail('Internal upload file write stream error', err));
  output.on('finish', () => {
    if (responded) return;
    responded = true;
    res.status(200).json({ success: true, fileId, size: uploadedBytes });
  });

  req.pipe(output);
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
export const internalDownload = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');

  if (!fileExists(fileId)) {
    throw new NotFoundError('File not found');
  }

  const meta = getMetadata(fileId);
  const range = parseRange(req.headers.range, meta.size);
  const stream = createReadStream(fileId, range ?? undefined);

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
export const internalExists = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');
  if (fileExists(fileId)) {
    res.status(200).end();
  } else {
    res.status(404).end();
  }
};

/**
 * GET /internal/meta/:fileId
 * Returns size and lastModified.
 */
export const internalMetadata = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');

  if (!fileExists(fileId)) {
    throw new NotFoundError('File not found');
  }

  const meta = getMetadata(fileId);
  res.json({ success: true, data: meta });
};

/**
 * DELETE /internal/files/:fileId
 * Delete a single file.
 */
export const internalDelete = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');
  deleteFile(fileId);
  res.json({ success: true, message: 'File deleted' });
};

/**
 * DELETE /internal/files/folder
 * Body: { prefix: string }
 * Delete all files matching a path prefix (folder delete).
 */
export const internalDeleteFolder = (req: Request, res: Response): void => {
  const { prefix } = req.body as { prefix: string };
  const count = deleteByPrefix(prefix);
  res.json({ success: true, message: `Deleted ${count} file(s)`, count });
};

/**
 * GET /internal/files?prefix=...&maxKeys=...
 * List files.
 */
export const internalList = (req: Request, res: Response): void => {
  const { prefix, maxKeys } = req.query as unknown as { prefix?: string; maxKeys: number };
  const files = listFiles(prefix, maxKeys);
  res.json({ success: true, data: files });
};
