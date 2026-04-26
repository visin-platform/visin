import { Request, Response } from 'express';
import { writeFile, readFile, fileExists, getMetadata } from '../utils/storage';

/**
 * PUT /files/upload/:fileId?token=...&expires=...
 * Browser-direct upload. Token validated by requireSignedToken middleware.
 * Accepts raw binary body (Content-Type set by browser / client).
 */
export const uploadPublic = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      writeFile(fileId, buffer);
      res.status(200).json({ success: true, message: 'File uploaded', fileId });
    } catch (err) {
      console.error(`Public upload failed for ${fileId}:`, err);
      res.status(500).json({ success: false, message: 'Upload failed' });
    }
  });
  req.on('error', (err) => {
    console.error(`Request stream error for ${fileId}:`, err);
    res.status(500).json({ success: false, message: 'Upload stream error' });
  });
};

/**
 * GET /files/download/:fileId?token=...&expires=...
 * Browser-direct download/display. Token validated by requireSignedToken middleware.
 */
export const downloadPublic = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');

  if (!fileExists(fileId)) {
    res.status(404).json({ success: false, message: 'File not found' });
    return;
  }

  try {
    const buffer = readFile(fileId);
    const meta = getMetadata(fileId);

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
    res.setHeader('Content-Length', meta.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    console.error(`Public download failed for ${fileId}:`, err);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
};
