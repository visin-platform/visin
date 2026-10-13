import {
  fetchWithTimeout,
  BadGatewayError,
  TRANSFER_FETCH_TIMEOUT_MS,
  fileServiceUrl,
  fileServiceAuthHeaders
} from '@visin/backend-core';

/**
 * Signed browser-direct GET URLs for a task's images, keyed by file id — one
 * call for the frame, its sensors and its masks together.
 */
export const getDownloadUrls = async (fileIds: string[], expiresInMinutes = 60): Promise<Record<string, string>> => {
  const unique = [...new Set(fileIds)];
  if (unique.length === 0) return {};
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/download-urls`, {
    method: 'POST',
    headers: { ...fileServiceAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds: unique, expiresInMinutes }),
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new BadGatewayError(`file-service download-urls failed (${response.status})`);
  }
  const body = (await response.json()) as { data: { urls: Record<string, string> } };
  return body.data.urls;
};

/** Server-to-server store of one file: label masks are the first bytes this service writes. */
export const putFile = async (fileId: string, data: Buffer): Promise<void> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
    method: 'PUT',
    headers: { ...fileServiceAuthHeaders(), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(data),
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new BadGatewayError(`file-service put failed for ${fileId} (${response.status})`);
  }
};

/** Server-to-server read of one whole file — a mask going into an export. */
export const getFile = async (fileId: string): Promise<Buffer> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
    headers: fileServiceAuthHeaders(),
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new BadGatewayError(`file-service get failed for ${fileId} (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
};

/** Removes one file; a file that is already gone is not an error. */
export const deleteFile = async (fileId: string): Promise<void> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/${fileId}`, {
    method: 'DELETE',
    headers: fileServiceAuthHeaders(),
    serviceName: 'file-service'
  });
  if (!response.ok && response.status !== 404) {
    throw new BadGatewayError(`file-service delete failed for ${fileId} (${response.status})`);
  }
};

/** Removes every file under a prefix — all of a job's masks in one call. */
export const deleteFolder = async (prefix: string): Promise<void> => {
  const response = await fetchWithTimeout(`${fileServiceUrl()}/internal/files/folder`, {
    method: 'DELETE',
    headers: { ...fileServiceAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix }),
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new BadGatewayError(`file-service folder delete failed for ${prefix} (${response.status})`);
  }
};

/** Where one job's mask files live, so deleting the job is a single folder delete. */
export const jobFolder = (jobId: string): string => `label/${jobId}/`;
