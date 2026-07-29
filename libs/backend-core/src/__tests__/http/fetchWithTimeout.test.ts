import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from '../../http/fetchWithTimeout';
import { GatewayTimeoutError } from '../../errors/HttpError';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

/** Resolves only once its signal aborts, mimicking a peer that never answers. */
const stalledFetch = jest.fn((_input: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason));
  })
);

describe('fetchWithTimeout', () => {
  it('passes the request through and returns the response', async () => {
    const response = new Response('ok');
    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const result = await fetchWithTimeout('http://file-service/internal/files/x', { method: 'HEAD' });

    expect(result).toBe(response);
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('HEAD');
    // timeoutMs/serviceName are ours, not fetch's — they must not leak into init.
    expect(init).not.toHaveProperty('timeoutMs');
    expect(init).not.toHaveProperty('serviceName');
  });

  it('always supplies an abort signal, even when the caller gives none', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('ok')) as unknown as typeof fetch;

    await fetchWithTimeout('http://file-service/health');

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws GatewayTimeoutError naming the peer when the deadline expires', async () => {
    global.fetch = stalledFetch as unknown as typeof fetch;

    await expect(
      fetchWithTimeout('http://file-service/internal/download-url', { timeoutMs: 10, serviceName: 'file-service' })
    ).rejects.toThrow(GatewayTimeoutError);
  });

  it('falls back to the URL in the timeout message when no serviceName is given', async () => {
    global.fetch = stalledFetch as unknown as typeof fetch;

    await expect(fetchWithTimeout('http://file-service/x', { timeoutMs: 10 })).rejects.toThrow(
      'http://file-service/x did not respond within 10ms'
    );
  });

  it('leaves a caller-signal abort as-is rather than reporting it as a timeout', async () => {
    global.fetch = stalledFetch as unknown as typeof fetch;
    const controller = new AbortController();
    const pending = fetchWithTimeout('http://file-service/x', {
      signal: controller.signal,
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS
    });

    controller.abort(new Error('caller went away'));

    await expect(pending).rejects.toThrow('caller went away');
    await expect(pending).rejects.not.toBeInstanceOf(GatewayTimeoutError);
  });

  it('propagates a non-abort network failure unchanged', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(fetchWithTimeout('http://file-service/x')).rejects.toThrow('ECONNREFUSED');
  });
});
