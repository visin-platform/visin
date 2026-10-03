import { createApiClient, ApiError } from '@visin/frontend-core';
import { getGlobalConfig } from './ConfigProvider';

function getVisionApiUrl(): string {
  try {
    const config = getGlobalConfig();
    return config.VISION_API_URL || 'http://localhost:4010';
  } catch {
    // Fallback during initialization or HMR
    return import.meta.env.VITE_VISION_API_URL || 'http://localhost:4010';
  }
}

/** Where this deployment's vision API answers: the `VISIN_URL` a training script is given. */
export const visionApiOrigin = (): string => getVisionApiUrl();

const client = createApiClient({
  baseUrl: () => `${getVisionApiUrl()}/api`
});

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Preserves the pre-existing `{ data }`-wrapping, plain-Error-throwing
 * interface every caller in this app already expects (11 call sites across
 * services/*.ts), while delegating the actual fetch/auth/error-parsing logic
 * to the shared @visin/frontend-core client.
 */
function toLegacyError(error: unknown): Error {
  if (error instanceof ApiError) {
    console.error('API Error:', error.status, error.message);
    // Still a plain Error for every existing caller; the status rides along for
    // the few that must tell one refusal from another (a 409 "already stored").
    return Object.assign(new Error(error.message), { status: error.status });
  }
  return error instanceof Error ? error : new Error('API Error');
}

export const visionApi = {
  async get(endpoint: string, options?: { params?: Record<string, unknown> }): Promise<{ data: unknown }> {
    try {
      const data = await client.get(endpoint + buildQueryString(options?.params));
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  },

  async post(endpoint: string, body?: unknown): Promise<{ data: unknown }> {
    try {
      const data = await client.post(endpoint, body);
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  },

  async put(endpoint: string, body?: unknown): Promise<{ data: unknown }> {
    try {
      const data = await client.put(endpoint, body);
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  },

  /**
   * A file the API answers with, fetched with the shared cookie. Throws the server's message on
   * a refusal, which for these endpoints is JSON, not the file.
   */
  async download(endpoint: string): Promise<{ blob: Blob; filename: string | null }> {
    const response = await fetch(`${getVisionApiUrl()}/api${endpoint}`, { credentials: 'include' });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || `Download failed (${response.status})`);
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    return { blob: await response.blob(), filename: /filename="([^"]+)"/.exec(disposition)?.[1] ?? null };
  },

  async patch(endpoint: string, body?: unknown): Promise<{ data: unknown }> {
    try {
      const data = await client.patch(endpoint, body);
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  },

  async delete(endpoint: string): Promise<{ data: unknown }> {
    try {
      const data = await client.delete(endpoint);
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  }
};

export default visionApi;
