import { fetchWithTimeout, BadGatewayError, fileServiceUrl, fileServiceAuthHeaders } from '@visin/backend-core';

/**
 * Signed browser-direct GET URLs for a task's images, keyed by file id — one
 * call for the frame, its layers and its id map together.
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
