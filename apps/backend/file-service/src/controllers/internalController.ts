import { Request, Response } from 'express';
import {
  writeFile,
  readFile,
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
  const chunks: Buffer[] = [];

  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      writeFile(fileId, buffer);
      res.status(200).json({ success: true, fileId, size: buffer.length });
    } catch (err) {
      console.error(`Internal upload failed for ${fileId}:`, err);
      res.status(500).json({ success: false, message: 'Upload failed' });
    }
  });
  req.on('error', (err) => {
    console.error(`Internal upload stream error for ${fileId}:`, err);
    res.status(500).json({ success: false, message: 'Upload stream error' });
  });
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
    const buffer = readFile(fileId);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
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
