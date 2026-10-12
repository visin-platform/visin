import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { Request, Response } from 'express';
import { HttpError } from '../errors/HttpError';
import { logger } from '../logging/logger';

/** A file kept in storage that a caller takes as one response: what a dataspace connector's data plane pulls. */
export interface StoredFile {
  /** the name it is saved as */
  filename: string;
  contentType: string;
  /** in bytes; absent, the file is only ever sent whole, chunked, and never as a range */
  size?: number;
  /** when these bytes were stored: a replaced file has a new one, which is what stops a resume from splicing two files */
  version?: Date;
  /**
   * The bytes, all of them or the inclusive `range`. Called once, before any header is written, so a storage failure
   * is still a clean error response. Not called for HEAD.
   */
  open(range?: { start: number; end: number }): Promise<Readable>;
  /** more response headers, such as `Repr-Digest` */
  headers?: Record<string, string>;
  /** names it in the log line written when the body ends early */
  logContext?: Record<string, unknown>;
}

/** Names one version of a file, so a resume never joins the start of one to the end of another. */
export const storedFileTag = (version: Date): string => `"${version.getTime().toString(36)}"`;

/**
 * The one byte range to send, when a resuming client asked for one. A resume against a replaced file (`If-Range` no
 * longer matching), several ranges at once, or a header that does not parse get the whole file, as RFC 9110 allows;
 * a range that starts past the end is refused.
 */
const requestedRange = (req: Request, res: Response, size: number, validators: string[]) => {
  if (!req.headers.range) return undefined;
  const ifRange = req.get('If-Range');
  if (ifRange && !validators.includes(ifRange)) return undefined;
  const ranges = req.range(size);
  if (ranges === -1) {
    res.setHeader('Content-Range', `bytes */${size}`);
    throw new HttpError(416, 'The requested range starts past the end of the file');
  }
  if (ranges === -2 || !ranges || ranges.type !== 'bytes' || ranges.length !== 1) return undefined;
  return ranges[0];
};

/**
 * Send a stored file's bytes in the response, all of them or the range a resuming client asks for (`Range`, guarded
 * by `If-Range`), or only the headers for HEAD.
 *
 * Once the bytes start, the status is spent: a read that fails part way can only cut the response short, which a
 * client sees as a body shorter than `Content-Length` (or an unterminated chunked one), never as a smaller file that
 * looks whole.
 */
export async function sendStoredFile(req: Request, res: Response, file: StoredFile): Promise<void> {
  const tag = file.version ? storedFileTag(file.version) : undefined;
  const lastModified = file.version?.toUTCString();
  const { size } = file;
  const validators = [tag, lastModified].filter((value): value is string => value !== undefined);
  const range = size !== undefined ? requestedRange(req, res, size, validators) : undefined;
  const stream = req.method === 'HEAD' ? undefined : await file.open(range);

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/["\\\r\n]/g, '_')}"`);
  if (lastModified) res.setHeader('Last-Modified', lastModified);
  if (tag) res.setHeader('ETag', tag);
  for (const [name, value] of Object.entries(file.headers ?? {})) res.setHeader(name, value);
  if (size !== undefined) res.setHeader('Accept-Ranges', 'bytes');
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
  } else if (size !== undefined) {
    res.setHeader('Content-Length', String(size));
  }
  if (!stream) {
    res.end();
    return;
  }
  try {
    await pipeline(stream, res);
  } catch (err) {
    logger.warn('A stored file ended early in its response', { ...file.logContext, error: (err as Error).message });
    res.destroy();
  }
}
