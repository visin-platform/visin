import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./ConfigProvider', () => ({
  getGlobalConfig: () => ({ VISION_API_URL: 'http://vision-api.test' })
}));

import { visionApi } from './visionApi';

describe('visionApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET wraps the response in { data } and appends the /api prefix + query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [1, 2] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await visionApi.get('/datasets', { params: { page: 1, search: 'x' } });

    expect(result).toEqual({ data: { items: [1, 2] } });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://vision-api.test/api/datasets?page=1&search=x');
  });

  it('sends the shared auth cookie along with every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await visionApi.get('/projects');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('POST/PUT send a JSON body and return { data }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await visionApi.post('/projects', { name: 'x' });

    expect(result).toEqual({ data: { id: '1' } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'x' }));
  });

  it('DELETE returns { data }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await visionApi.delete('/projects/1');

    expect(result).toEqual({ data: { success: true } });
  });

  it('throws a plain Error with the server message on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Project not found' }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(visionApi.get('/projects/x')).rejects.toThrow('Project not found');
  });

  it('POST surfaces a server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Cannot create' }), { status: 400 }))
    );

    await expect(visionApi.post('/projects', { name: 'x' })).rejects.toThrow('Cannot create');
  });

  it('PUT sends a JSON body and returns { data }, and surfaces a server error message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await visionApi.put('/projects/1', { name: 'y' });

    expect(result).toEqual({ data: { id: '1' } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Invalid update' }), { status: 400 }));
    await expect(visionApi.put('/projects/1', {})).rejects.toThrow('Invalid update');
  });

  it('DELETE surfaces a server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Cannot delete' }), { status: 400 }))
    );

    await expect(visionApi.delete('/projects/1')).rejects.toThrow('Cannot delete');
  });

  it('wraps a thrown non-Error value in a generic Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('a plain string rejection'));

    await expect(visionApi.get('/projects')).rejects.toThrow('API Error');
  });

  it('falls back to import.meta.env when getGlobalConfig throws (init/HMR)', async () => {
    vi.resetModules();
    vi.doMock('./ConfigProvider', () => ({
      getGlobalConfig: () => {
        throw new Error('not initialized');
      },
    }));
    const { visionApi: freshVisionApi } = await import('./visionApi');

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await freshVisionApi.get('/projects');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/projects');
    vi.doUnmock('./ConfigProvider');
  });
});
