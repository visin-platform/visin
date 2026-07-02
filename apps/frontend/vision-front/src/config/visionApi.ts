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

// Base fetch wrapper
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('authToken');
  const VISION_API_URL = getVisionApiUrl();

  const requestConfig: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token && { Authorization: `Bearer ${token}` })
    }
  };

  const response = await fetch(`${VISION_API_URL}/api${endpoint}`, requestConfig);

  if (!response.ok) {
    console.error('API Error:', response.status, response.statusText);
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API Error: ${response.status}`);
  }

  return response;
}

// Helper methods for common HTTP verbs
export const visionApi = {
  async get(endpoint: string, options?: { params?: Record<string, any> }): Promise<{ data: any }> {
    let url = endpoint;
    if (options?.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const paramString = searchParams.toString();
      if (paramString) {
        url += `?${paramString}`;
      }
    }

    const response = await apiFetch(url);
    const data = await response.json();
    return { data };
  },

  async post(endpoint: string, body?: any): Promise<{ data: any }> {
    const response = await apiFetch(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    return { data };
  },

  async put(endpoint: string, body?: any): Promise<{ data: any }> {
    const response = await apiFetch(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json();
    return { data };
  },

  async delete(endpoint: string): Promise<{ data: any }> {
    const response = await apiFetch(endpoint, {
      method: 'DELETE'
    });
    const data = await response.json();
    return { data };
  }
};

export default visionApi;
