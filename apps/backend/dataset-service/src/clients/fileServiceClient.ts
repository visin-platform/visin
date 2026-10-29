import { Readable } from 'stream';
import {
  fetchWithTimeout,
  BadGatewayError,
  TRANSFER_FETCH_TIMEOUT_MS,
  createFileServiceClient,
  fileServiceUrl,
  fileServiceAuthHeaders
} from '@visin/backend-core';

/** Storing, signing and deleting go through the shared client; reads and sizes below are this service's own. */
export const { getDownloadUrls, putFile, deleteFile, deleteFiles, deleteFolder } = createFileServiceClient();

const jsonHeaders = (): Record<string, string> => ({ ...fileServiceAuthHeaders(), 'Content-Type': 'application/json' });

/**
 * Signed browser-direct PUT URL for a dataset zip. Long-lived because a
 * multi-GB archive goes up in chunks over a slow link, and every chunk
 * re-presents the same signature.
 */
export const getUploadUrl = async (
  fileId: string,
  maxBytes: number,
  expiresInMinutes = 240,
  mimetype = 'application/zip'
): Promise<{ url: string; expiresMs: number }> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/upload-url`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ fileId, expiresInMinutes, mimetype, maxBytes }),
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new BadGatewayError(`file-service upload-url failed (${response.status})`);
  }
  const body = (await response.json()) as { data: { uploadUrl: string; expiresMs: number } };
  return { url: body.data.uploadUrl, expiresMs: body.data.expiresMs };
};

/** Server-to-server streaming read (import reads the uploaded zip). */
export const getFileStream = async (fileId: string): Promise<Readable> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
    headers: fileServiceAuthHeaders(),
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    // Import consumes this zip over many minutes — far longer than any transfer
    // budget — so the deadline covers getting the response, not reading it. A
    // read that then stalls is caught by the import's heartbeat going stale.
    streamBody: true,
    serviceName: 'file-service'
  });
  if (!response.ok || !response.body) {
    throw new Error(`file-service get failed for ${fileId} (${response.status})`);
  }
  return Readable.fromWeb(response.body as import('stream/web').ReadableStream);
};

/**
 * Stored size in bytes. Uses the metadata endpoint, not HEAD: `HEAD
 * /internal/files/*` is an existence probe with no `Content-Length`.
 */
export const getFileSize = async (fileId: string): Promise<number | null> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/meta/${fileId}`, {
    headers: fileServiceAuthHeaders(),
    serviceName: 'file-service'
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new BadGatewayError(`file-service could not report the size of ${fileId} (${response.status})`);
  }
  const body = (await response.json()) as { data?: { size?: unknown } };
  const size = Number(body.data?.size);
  // A missing size would coerce to 0/NaN and send the zip reader chasing
  // offsets in an "empty" file, so treat it as an error rather than a size.
  if (!Number.isFinite(size) || size <= 0) {
    throw new BadGatewayError(`file-service returned no size for ${fileId}`);
  }
  return size;
};

/**
 * Byte-range read, for walking a zip's central directory without pulling the
 * whole archive. A server that ignores `Range` would silently stream gigabytes,
 * so a non-206 response is an error rather than a fallback.
 */
export const getFileRange = async (fileId: string, start: number, end: number): Promise<Readable> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
    headers: { ...fileServiceAuthHeaders(), Range: `bytes=${start}-${end}` },
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    streamBody: true,
    serviceName: 'file-service'
  });
  if (response.status !== 206 || !response.body) {
    throw new BadGatewayError(`file-service ignored a Range request for ${fileId} (${response.status})`);
  }
  return Readable.fromWeb(response.body as import('stream/web').ReadableStream);
};
