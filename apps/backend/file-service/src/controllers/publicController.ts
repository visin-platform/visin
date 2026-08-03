import { Request, Response } from 'express';
import { BadRequestError, NotFoundError, logger } from '@visin/backend-core';
import {
  createWriteStream,
  createWriteStreamAt,
  createReadStream,
  fileExists,
  getMetadata,
  truncateFile
} from '../utils/storage';

interface ChunkRange {
  start: number;
  end: number;
  total: number;
}

/**
 * Parse a `Content-Range: bytes <start>-<end>/<total>` upload header.
 *
 * Deliberately strict: a header we half-understand would place bytes at the
 * wrong offset and silently corrupt the file, which is far worse than a 400.
 */
const parseContentRange = (header: string): ChunkRange => {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim());
  if (!match) {
    throw new BadRequestError('Malformed Content-Range header, expected "bytes <start>-<end>/<total>"');
  }
  const [, startText, endText, totalText] = match;
  const range = { start: Number(startText), end: Number(endText), total: Number(totalText) };
  if (range.end < range.start || range.end >= range.total) {
    throw new BadRequestError('Content-Range is not a valid slice of the total size');
  }
  return range;
};

/**
 * PUT /files/upload/:fileId?token=...&expires=...
 * Browser-direct upload. Token validated by requireSignedToken middleware.
 * Accepts raw binary body (Content-Type set by browser / client).
 *
 * Two shapes, distinguished by the presence of a `Content-Range` header:
 *
 *  - no header — the whole file in one request, replacing whatever was there.
 *  - `bytes <start>-<end>/<total>` — one chunk of a resumable upload. Needed
 *    because Cloudflare caps a proxied request body at 100 MB, so multi-GB
 *    dataset zips cannot reach us in a single PUT once traffic goes through the
 *    tunnel. Chunks must arrive in order (`start` has to equal what is already
 *    stored); a mismatch answers 409 with the offset to resume from, which also
 *    serializes two clients racing on one fileId. Every response reports the
 *    stored size, so an interrupted upload resumes by re-sending the last chunk
 *    rather than the whole file.
 *
 * Stream errors surface via event callbacks, not thrown exceptions/rejected
 * promises, so Express's automatic error forwarding doesn't reach them —
 * these still need to respond manually.
 */
export const uploadPublic = (req: Request, res: Response): void => {
  const fileId = [req.params.fileId].flat().join('/');
  const rangeHeader = req.headers['content-range'];
  const range = typeof rangeHeader === 'string' ? parseContentRange(rangeHeader) : null;

  if (range) {
    // Only the chunked path stats the file: whole-body uploads replace it
    // wholesale, so what is already there tells them nothing.
    const storedBytes = fileExists(fileId) ? getMetadata(fileId).size : 0;
    if (range.start !== storedBytes) {
      // Not an error the client can't recover from: it just holds a stale idea
      // of how much landed (a chunk died mid-flight, or it retried out of order).
      res.status(409).json({
        success: false,
        message: 'Chunk start does not match the stored size',
        fileId,
        size: storedBytes
      });
      return;
    }
  }

  // start === 0 goes through the plain 'w' stream so a re-upload truncates any
  // leftover bytes from an abandoned attempt instead of writing over its prefix.
  const output = range && range.start > 0 ? createWriteStreamAt(fileId, range.start) : createWriteStream(fileId);
  let uploadedBytes = 0;
  let responded = false;

  const fail = (message: string, err: unknown): void => {
    if (responded) return;
    responded = true;
    logger.error(message, { fileId, error: err instanceof Error ? err.message : String(err) });
    // `pipe` does not tear the destination down when the source fails, so an
    // aborted upload would otherwise leak the file descriptor until GC. Chunked
    // uploads make that routine rather than rare: every retried chunk aborts one.
    output.destroy();
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

    if (!range) {
      res.status(200).json({ success: true, message: 'File uploaded', fileId, size: uploadedBytes });
      return;
    }

    const declaredBytes = range.end - range.start + 1;
    if (uploadedBytes !== declaredBytes) {
      // A body longer than declared has already overwritten bytes past `end`,
      // and one shorter leaves a hole in the middle of the chunk. Either way the
      // last agreed offset is `start`, so cut back to it and let the client
      // re-send that chunk.
      truncateFile(fileId, range.start);
      logger.warn('Chunk length did not match Content-Range', { fileId, declaredBytes, uploadedBytes });
      res.status(400).json({
        success: false,
        message: 'Chunk length does not match Content-Range',
        fileId,
        size: range.start
      });
      return;
    }

    const size = range.start + uploadedBytes;
    const complete = size === range.total;
    res.status(200).json({
      success: true,
      message: complete ? 'File uploaded' : 'Chunk stored',
      fileId,
      size,
      complete
    });
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
    throw new NotFoundError('File not found');
  }

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
