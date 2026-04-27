import { Request, Response } from 'express';
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
 */
export const internalUpload = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');
  const output = createWriteStream(fileId);
  let uploadedBytes = 0;
  let responded = false;

  const fail = (message: string, err: unknown): void => {
    if (responded) return;
    responded = true;
    console.error(`${message} for ${fileId}:`, err);
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

/**
 * GET /internal/files/:fileId
 * Server-to-server download – returns raw binary.
 */
export const internalDownload = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');

  if (!fileExists(fileId)) {
    res.status(404).json({ success: false, message: 'File not found' });
    return;
  }

  try {
    const meta = getMetadata(fileId);
    const stream = createReadStream(fileId);

    res.setHeader('Content-Length', meta.size);
    res.setHeader('Content-Type', 'application/octet-stream');

    stream.on('error', (err) => {
      console.error(`Internal download stream failed for ${fileId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      } else {
        res.destroy(err);
      }
    });

    stream.pipe(res);
  } catch (err) {
    console.error(`Internal download failed for ${fileId}:`, err);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
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
    res.status(404).json({ success: false, message: 'File not found' });
    return;
  }

  try {
    const meta = getMetadata(fileId);
    res.json({ success: true, data: meta });
  } catch (err) {
    console.error(`Metadata failed for ${fileId}:`, err);
    res.status(500).json({ success: false, message: 'Failed to get metadata' });
  }
};

/**
 * DELETE /internal/files/:fileId
 * Delete a single file.
 */
export const internalDelete = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');
  try {
    deleteFile(fileId);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    console.error(`Delete failed for ${fileId}:`, err);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
};

/**
 * DELETE /internal/files/folder
 * Body: { prefix: string }
 * Delete all files matching a path prefix (folder delete).
 */
export const internalDeleteFolder = (req: Request, res: Response): void => {
  const { prefix } = req.body as { prefix?: string };

  if (!prefix) {
    res.status(400).json({ success: false, message: 'prefix is required' });
    return;
  }

  try {
    const count = deleteByPrefix(prefix);
    res.json({ success: true, message: `Deleted ${count} file(s)`, count });
  } catch (err) {
    console.error(`Folder delete failed for prefix ${prefix}:`, err);
    res.status(500).json({ success: false, message: 'Folder delete failed' });
  }
};

/**
 * GET /internal/files?prefix=...&maxKeys=...
 * List files.
 */
export const internalList = (req: Request, res: Response): void => {
  const { prefix, maxKeys } = req.query as { prefix?: string; maxKeys?: string };
  try {
    const files = listFiles(prefix, maxKeys ? parseInt(maxKeys, 10) : 1000);
    res.json({ success: true, data: files });
  } catch (err) {
    console.error('List files failed:', err);
    res.status(500).json({ success: false, message: 'List files failed' });
  }
};
