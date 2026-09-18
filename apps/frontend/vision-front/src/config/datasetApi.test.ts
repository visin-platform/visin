import { afterEach, describe, expect, it, vi } from 'vitest';

const getGlobalConfig = vi.hoisted(() => vi.fn());
vi.mock('./ConfigProvider', () => ({ getGlobalConfig }));

import { datasetApi } from './datasetApi';

describe('datasetApi', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('calls dataset-service at the configured address', async () => {
    getGlobalConfig.mockReturnValue({ DATASET_API_URL: 'https://dataset-api.example.com/' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await datasetApi.get('/x');
    expect(fetchMock.mock.calls[0][0]).toBe('https://dataset-api.example.com/api/datasets/x');
  });

  it('falls back to the build-time address, and refuses to guess one', async () => {
    getGlobalConfig.mockImplementation(() => {
      throw new Error('not loaded');
    });
    vi.stubEnv('VITE_DATASET_API_URL', 'http://localhost:5010');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await datasetApi.get('');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:5010/api/datasets');

    vi.stubEnv('VITE_DATASET_API_URL', '');
    await expect(datasetApi.get('')).rejects.toThrow('DATASET_API_URL is not configured');
  });
});
