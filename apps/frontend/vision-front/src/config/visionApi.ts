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

const client = createApiClient({
  baseUrl: () => `${getVisionApiUrl()}/api`
});

function buildQueryString(params?: Record<string, any>): string {
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
    return new Error(error.message);
  }
  return error instanceof Error ? error : new Error('API Error');
}

export const visionApi = {
  async get(endpoint: string, options?: { params?: Record<string, any> }): Promise<{ data: any }> {
    try {
      const data = await client.get(endpoint + buildQueryString(options?.params));
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  },

  async post(endpoint: string, body?: any): Promise<{ data: any }> {
    try {
      const data = await client.post(endpoint, body);
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  },

  async put(endpoint: string, body?: any): Promise<{ data: any }> {
    try {
      const data = await client.put(endpoint, body);
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  },

  async delete(endpoint: string): Promise<{ data: any }> {
    try {
      const data = await client.delete(endpoint);
      return { data };
    } catch (error) {
      throw toLegacyError(error);
    }
  }
};

export default visionApi;
