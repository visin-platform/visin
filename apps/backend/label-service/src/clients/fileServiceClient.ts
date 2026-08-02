import { Readable } from 'stream';
import { requireEnv, fetchWithTimeout, BadGatewayError, TRANSFER_FETCH_TIMEOUT_MS } from '@visin/backend-core';

export interface SignedUrl {
  url: string;
  fileId: string;
  expiresMs: number;
}

const baseUrl = (): string => (process.env.FILE_SERVICE_URL || 'http://localhost:5002').replace(/\/$/, '');

const apiKeyHeaders = (): Record<string, string> => ({
  'x-internal-api-key': requireEnv('FILE_SERVICE_API_KEY')
});

const signedUrl = async (
  kind: 'upload' | 'download',
  fileId: string,
  expiresInMinutes: number,
  mimetype?: string
): Promise<SignedUrl> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/${kind}-url`, {
    method: 'POST',
    headers: { ...apiKeyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, expiresInMinutes, ...(mimetype ? { mimetype } : {}) }),
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new Error(`file-service ${kind}-url failed (${response.status})`);
  }
  const body = (await response.json()) as { data: { uploadUrl?: string; downloadUrl?: string; expiresMs: number } };
  return { url: (body.data.uploadUrl || body.data.downloadUrl)!, fileId, expiresMs: body.data.expiresMs };
};

/** Signed browser-direct PUT URL (bundle zip upload). */
export const getUploadUrl = (fileId: string, expiresInMinutes = 240, mimetype = 'application/zip'): Promise<SignedUrl> =>
  signedUrl('upload', fileId, expiresInMinutes, mimetype);

/** Signed browser-direct GET URL (workbench image display). */
export const getDownloadUrl = (fileId: string, expiresInMinutes = 60): Promise<SignedUrl> =>
  signedUrl('download', fileId, expiresInMinutes);

/** Server-to-server store of one file (ingest). */
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

/** Server-to-server streaming read (ingest reads the uploaded zip). */
export const getFileStream = async (fileId: string): Promise<Readable> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/${fileId}`, {
    headers: apiKeyHeaders(),
    // The deadline covers reading the body too, so a multi-hundred-MB bundle
    // zip needs the transfer budget rather than the control-plane one.
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });
  if (!response.ok || !response.body) {
    throw new Error(`file-service get failed for ${fileId} (${response.status})`);
  }
  return Readable.fromWeb(response.body as import('stream/web').ReadableStream);
};

/**
 * Stored size in bytes — the first thing a ranged zip reader needs. Uses the
 * metadata endpoint, not HEAD: `HEAD /internal/files/*` is an existence probe
 * that answers `200` with no body and no `Content-Length`.
 */
export const getFileSize = async (fileId: string): Promise<number> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/meta/${fileId}`, {
    headers: apiKeyHeaders(),
    serviceName: 'file-service'
  });
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
 * Byte-range read. Used to walk a zip's central directory without pulling the
 * whole archive; a server that ignores `Range` would silently stream gigabytes,
 * so a non-206 response is an error rather than a fallback.
 */
export const getFileRange = async (fileId: string, start: number, end: number): Promise<Readable> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/${fileId}`, {
    headers: { ...apiKeyHeaders(), Range: `bytes=${start}-${end}` },
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });
  if (response.status !== 206 || !response.body) {
    // Almost always a file-service that predates Range support — a version
    // skew, not a bug in the zip. Say so rather than 500ing.
    throw new BadGatewayError(
      `file-service ignored a Range request for ${fileId} (${response.status}) — it may need redeploying`
    );
  }
  return Readable.fromWeb(response.body as import('stream/web').ReadableStream);
};

/** Whether a file already exists (idempotent re-import checks). */
export const fileExists = async (fileId: string): Promise<boolean> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/${fileId}`, {
    method: 'HEAD',
    headers: apiKeyHeaders(),
    serviceName: 'file-service'
  });
  return response.ok;
};

/** Delete every stored file under a prefix (bundle deletion). */
export const deleteFolder = async (prefix: string): Promise<void> => {
  const response = await fetchWithTimeout(`${baseUrl()}/internal/files/folder`, {
    method: 'DELETE',
    headers: { ...apiKeyHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix }),
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new Error(`file-service folder delete failed for ${prefix} (${response.status})`);
  }
};
