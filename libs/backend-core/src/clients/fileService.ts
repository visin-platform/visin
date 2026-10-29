import { requireEnv } from '../config/env';
import { BadGatewayError } from '../errors/HttpError';
import { fetchWithTimeout, TRANSFER_FETCH_TIMEOUT_MS } from '../http/fetchWithTimeout';

/**
 * Where a service reaches file-service: `FILE_SERVICE_INTERNAL_URL` (the
 * container network) when set, else `FILE_SERVICE_URL`, else the host-side dev
 * port outside production. The two settings differ in production, where the
 * public address runs through a CDN that answered Range requests with the whole
 * file and would carry every multi-GB transfer out through the edge and back.
 * Links handed to browsers are built by file-service from its own public URL,
 * so they are unaffected.
 */
export const fileServiceUrl = (): string =>
  (
    process.env.FILE_SERVICE_INTERNAL_URL ||
    process.env.FILE_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('FILE_SERVICE_URL') : 'http://localhost:5002')
  ).replace(/\/$/, '');

/** The credential file-service's `/internal/*` routes take. */
export const fileServiceAuthHeaders = (): Record<string, string> => ({
  'x-internal-api-key': requireEnv('FILE_SERVICE_API_KEY')
});

/** Most files one `delete-files` call takes. */
const DELETE_BATCH = 1000;

const jsonHeaders = (): Record<string, string> => ({ ...fileServiceAuthHeaders(), 'Content-Type': 'application/json' });

export interface FileServiceClient {
  /** Signed browser-direct GET URLs for many files in one call; each file is asked for once. */
  getDownloadUrls(fileIds: string[], expiresInMinutes?: number): Promise<{ urls: Record<string, string>; expiresMs: number }>;
  /** Server-to-server store of one file. */
  putFile(fileId: string, data: Buffer): Promise<void>;
  /** Server-to-server read of one whole file. */
  getFile(fileId: string): Promise<Buffer>;
  /** Removes one file; one that is already gone is not an error. */
  deleteFile(fileId: string): Promise<void>;
  /** Removes named files, in batches of file-service's limit; a failed batch throws. */
  deleteFiles(fileIds: string[]): Promise<void>;
  /** Removes every file under a prefix. */
  deleteFolder(prefix: string): Promise<void>;
}

/**
 * The file-service calls every service makes the same way. A refusal or an unreachable file-service is a
 * `BadGatewayError` (a stalled one a 504), never a bare `Error`, so it reaches the caller as an upstream failure
 * and not as a 500. Calls that move bytes get the transfer deadline.
 */
export function createFileServiceClient(): FileServiceClient {
  return {
    async getDownloadUrls(fileIds, expiresInMinutes = 60) {
      const unique = [...new Set(fileIds)];
      if (unique.length === 0) return { urls: {}, expiresMs: Date.now() + expiresInMinutes * 60 * 1000 };
      const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/download-urls`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ fileIds: unique, expiresInMinutes }),
        serviceName: 'file-service'
      });
      if (!response.ok) throw new BadGatewayError(`file-service download-urls failed (${response.status})`);
      const body = (await response.json()) as { data: { urls: Record<string, string>; expiresMs: number } };
      return body.data;
    },

    async putFile(fileId, data) {
      const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
        method: 'PUT',
        headers: { ...fileServiceAuthHeaders(), 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(data),
        timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
        serviceName: 'file-service'
      });
      if (!response.ok) throw new BadGatewayError(`file-service put failed for ${fileId} (${response.status})`);
    },

    async getFile(fileId) {
      const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
        headers: fileServiceAuthHeaders(),
        timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
        serviceName: 'file-service'
      });
      if (!response.ok) throw new BadGatewayError(`file-service get failed for ${fileId} (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    },

    async deleteFile(fileId) {
      const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
        method: 'DELETE',
        headers: fileServiceAuthHeaders(),
        serviceName: 'file-service'
      });
      if (!response.ok && response.status !== 404) {
        throw new BadGatewayError(`file-service delete failed for ${fileId} (${response.status})`);
      }
    },

    async deleteFiles(fileIds) {
      for (let start = 0; start < fileIds.length; start += DELETE_BATCH) {
        const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/delete-files`, {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ fileIds: fileIds.slice(start, start + DELETE_BATCH) }),
          timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
          serviceName: 'file-service'
        });
        if (!response.ok) throw new BadGatewayError(`file-service delete-files failed (${response.status})`);
      }
    },

    async deleteFolder(prefix) {
      const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/folder`, {
        method: 'DELETE',
        headers: jsonHeaders(),
        body: JSON.stringify({ prefix }),
        // A folder can hold tens of thousands of files.
        timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
        serviceName: 'file-service'
      });
      if (!response.ok) throw new BadGatewayError(`file-service folder delete failed for ${prefix} (${response.status})`);
    }
  };
}
