import { Request, Response } from 'express';
import { createWriteStream, createReadStream, fileExists, getMetadata } from '../utils/storage';

/**
 * PUT /files/upload/:fileId?token=...&expires=...
 * Browser-direct upload. Token validated by requireSignedToken middleware.
 * Accepts raw binary body (Content-Type set by browser / client).
 */
export const uploadPublic = (req: Request, res: Response): void => {
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

  req.on('error', (err) => fail('Public request stream error', err));
  req.on('aborted', () => fail('Public upload aborted', new Error('Client aborted request')));

  output.on('error', (err) => fail('Public file write stream error', err));
  output.on('finish', () => {
    if (responded) return;
    responded = true;
    res.status(200).json({ success: true, message: 'File uploaded', fileId, size: uploadedBytes });
  });

  req.pipe(output);
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
    const meta = getMetadata(fileId);
    const stream = createReadStream(fileId);

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

    stream.on('error', (err) => {
      console.error(`Public download stream failed for ${fileId}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed' });
      } else {
        res.destroy(err);
      }
    });

    stream.pipe(res);
  } catch (err) {
    console.error(`Public download failed for ${fileId}:`, err);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
};
