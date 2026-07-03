import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./ConfigProvider', () => ({
  getGlobalConfig: () => ({ VISION_API_URL: 'http://vision-api.test' })
}));

import { visionApi } from './visionApi';

// Node's own experimental global `localStorage` shadows jsdom's polyfill in
// this test environment (unrelated to app code, which always runs in a real
// browser) — stub it explicitly rather than relying on jsdom to provide it.
function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); }
  };
}

describe('visionApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', makeLocalStorageStub());
  });

  it('GET wraps the response in { data } and appends the /api prefix + query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [1, 2] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await visionApi.get('/datasets', { params: { page: 1, search: 'x' } });

    expect(result).toEqual({ data: { items: [1, 2] } });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://vision-api.test/api/datasets?page=1&search=x');
  });

  it('attaches the localStorage authToken as a Bearer header', async () => {
    localStorage.setItem('authToken', 'tok123');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await visionApi.get('/projects');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok123');
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
});
