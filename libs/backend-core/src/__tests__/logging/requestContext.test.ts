import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import { currentRequestId, resolveRequestId, runWithRequestId } from '../../logging/requestContext';
import { requestLogger } from '../../middleware/requestLogger';
import { fetchWithTimeout } from '../../http/fetchWithTimeout';

describe('resolveRequestId', () => {
  it('keeps an id-shaped value from the caller', () => {
    expect(resolveRequestId('abc-123_DEF.4:5')).toBe('abc-123_DEF.4:5');
  });

  it.each([undefined, '', 'has space', 'line\nbreak', 'x'.repeat(129), ['a', 'b']])(
    'replaces %p with a fresh id, so free text never reaches a log line',
    (incoming) => {
      expect(resolveRequestId(incoming)).toMatch(/^[0-9a-f-]{36}$/);
    }
  );
});

describe('requestLogger request ids', () => {
  const run = (headers: Record<string, string>) => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200, setHeader: jest.fn() });
    let seen: string | undefined;
    requestLogger({ originalUrl: '/x', method: 'GET', headers } as unknown as Request, res as unknown as Response, () => {
      seen = currentRequestId();
    });
    return { seen, res };
  };

  it('adopts the caller id, exposes it to the handler and echoes it back', () => {
    const { seen, res } = run({ 'x-request-id': 'trace-1' });
    expect(seen).toBe('trace-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-1');
  });

  it('mints one when the caller sent none', () => {
    const { seen } = run({});
    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('leaves no id outside a request', () => {
    expect(currentRequestId()).toBeUndefined();
  });
});

describe('fetchWithTimeout request id forwarding', () => {
  const realFetch = global.fetch;
  const mockFetch = jest.fn().mockResolvedValue({ ok: true });
  beforeEach(() => {
    mockFetch.mockClear();
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });
  const sentHeaders = () => new Headers(mockFetch.mock.calls[0][1].headers);

  it('forwards the current request id to the peer', async () => {
    await runWithRequestId('trace-2', () => fetchWithTimeout('http://peer.example.test', { headers: { a: 'b' } }));
    expect(sentHeaders().get('x-request-id')).toBe('trace-2');
    expect(sentHeaders().get('a')).toBe('b');
  });

  it('keeps an id the caller set itself', async () => {
    await runWithRequestId('trace-3', () =>
      fetchWithTimeout('http://peer.example.test', { headers: { 'X-Request-Id': 'explicit' } })
    );
    expect(sentHeaders().get('x-request-id')).toBe('explicit');
  });

  it('adds nothing outside a request', async () => {
    await fetchWithTimeout('http://peer.example.test');
    expect(mockFetch.mock.calls[0][1].headers).toBeUndefined();
  });
});
