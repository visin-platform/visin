import { requireEnv, fetchWithTimeout, BadGatewayError } from '@visin/backend-core';

const baseUrl = (): string => (process.env.FILE_SERVICE_URL || 'http://localhost:5002').replace(/\/$/, '');

/**
 * Signed browser-direct GET URLs for a task's images, keyed by file id — one
 * call for the frame, its layers and its id map together.
 */
export const getDownloadUrls = async (fileIds: string[], expiresInMinutes = 60): Promise<Record<string, string>> => {
  const unique = [...new Set(fileIds)];
  if (unique.length === 0) return {};
  const response = await fetchWithTimeout(`${baseUrl()}/internal/download-urls`, {
    method: 'POST',
    headers: { 'x-internal-api-key': requireEnv('FILE_SERVICE_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds: unique, expiresInMinutes }),
    serviceName: 'file-service'
  });
  if (!response.ok) {
    throw new BadGatewayError(`file-service download-urls failed (${response.status})`);
  }
  const body = (await response.json()) as { data: { urls: Record<string, string> } };
  return body.data.urls;
};
