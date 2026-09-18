import { Readable } from 'stream';
import { requireEnv, fetchWithTimeout, BadGatewayError, TRANSFER_FETCH_TIMEOUT_MS } from '@visin/backend-core';

/**
 * Where this service reaches file-service: `FILE_SERVICE_INTERNAL_URL` (the
 * container network) when set, else `FILE_SERVICE_URL`. They differ in
 * production, where the public address runs through Cloudflare — which answered
 * Range requests with the whole file and would carry every multi-GB transfer
 * out through the edge and back. Links handed to browsers are built by
 * file-service from its own public URL, so they are unaffected.
 */
const baseUrl = (): string =>
  (process.env.FILE_SERVICE_INTERNAL_URL || process.env.FILE_SERVICE_URL || 'http://localhost:5002').replace(/\/$/, '');

const apiKeyHeaders = (): Record<string, string> => ({
  'x-internal-api-key': requireEnv('FILE_SERVICE_API_KEY')
});

const jsonHeaders = (): Record<string, string> => ({ ...apiKeyHeaders(), 'Content-Type': 'application/json' });

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
  const response = await fetchWithTimeout(`${baseUrl()}/internal/upload-url`, {
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

/**
 * Signed download URLs for many files in one call — a page of thumbnails is
 * dozens of files, and one request per file was most of the page's latency.
 */
export const getDownloadUrls = async (
  fileIds: string[],
  expiresInMinutes = 60
): Promise<{ urls: Record<string, string>; expiresMs: number }> => {
  const unique = [...new Set(fileIds)];
  if (unique.length === 0) {
    return { urls: {}, expiresMs: Date.now() + expiresInMinutes * 60 * 1000 };
  }
  const response = await fetchWithTimeout(`${baseUrl()}/internal/download-urls`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ fileIds: unique, expiresInMinutes }),
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new BadGatewayError(`file-service download-urls failed (${response.status})`);
  }
  const body = (await response.json()) as { data: { urls: Record<string, string>; expiresMs: number } };
  return body.data;
};

/** Server-to-server store of one file (import). */
export const putFile = async (fileId: string, data: Buffer): Promise<void> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/${fileId}`, {
    method: 'PUT',
    headers: { ...apiKeyHeaders(), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(data),
    // Moves file bytes — sized for the payload, not the control-plane default.
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new Error(`file-service put failed for ${fileId} (${response.status})`);
  }
};

/** Server-to-server streaming read (import reads the uploaded zip). */
export const getFileStream = async (fileId: string): Promise<Readable> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/${fileId}`, {
    headers: apiKeyHeaders(),
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
  const response = await fetchWithTimeout(`${baseUrl()}/internal/meta/${fileId}`, {
    headers: apiKeyHeaders(),
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
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/${fileId}`, {
    headers: { ...apiKeyHeaders(), Range: `bytes=${start}-${end}` },
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    streamBody: true,
    serviceName: 'file-service'
  });
  if (response.status !== 206 || !response.body) {
    throw new BadGatewayError(`file-service ignored a Range request for ${fileId} (${response.status})`);
  }
  return Readable.fromWeb(response.body as import('stream/web').ReadableStream);
};

export const deleteFile = async (fileId: string): Promise<void> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/${fileId}`, {
    method: 'DELETE',
    headers: apiKeyHeaders(),
    serviceName: 'file-service'
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`file-service delete failed for ${fileId} (${response.status})`);
  }
};

/** Delete every stored file under a prefix. */
export const deleteFolder = async (prefix: string): Promise<void> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/folder`, {
    method: 'DELETE',
    headers: jsonHeaders(),
    body: JSON.stringify({ prefix }),
    // A dataset folder can hold tens of thousands of files.
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new Error(`file-service folder delete failed for ${prefix} (${response.status})`);
  }
};
