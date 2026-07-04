import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient, ApiError } from './apiClient';

describe('createApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends credentials: include by default, so the shared auth cookie rides along', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: () => 'http://api.test' });
    await client.get('/things');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('lets a caller override credentials for a single request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: () => 'http://api.test' });
    await client.get('/things', { credentials: 'omit' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('omit');
  });

  it('calls onUnauthorized on a 401 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'nope' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const onUnauthorized = vi.fn();

    const client = createApiClient({ baseUrl: () => 'http://api.test', onUnauthorized });
    await expect(client.get('/things')).rejects.toThrow(ApiError);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('skips onUnauthorized when skipAuthRedirect is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'nope' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const onUnauthorized = vi.fn();

    const client = createApiClient({ baseUrl: () => 'http://api.test', onUnauthorized });
    await expect(client.get('/things', { skipAuthRedirect: true })).rejects.toThrow(ApiError);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('throws ApiError with the server message on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Project not found' }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: () => 'http://api.test' });

    await expect(client.get('/projects/x')).rejects.toMatchObject({
      status: 404,
      message: 'Project not found'
    });
  });

  it('returns undefined for a 204 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: () => 'http://api.test' });
    const result = await client.delete('/things/1');

    expect(result).toBeUndefined();
  });

  it('JSON-encodes the body for post/put/patch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: () => 'http://api.test' });
    await client.post('/things', { name: 'x' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'x' }));
  });
});
