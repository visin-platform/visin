import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserConfig, TransportItem } from '@grafana/faro-web-sdk';
import type { TracingInstrumentationOptions } from '@grafana/faro-web-tracing';
import {
  initializeFrontendObservability,
  normalizeTelemetryPath,
  reportFrontendError,
  sanitizeTelemetry,
  scrubErrorMessage,
  trackFrontendPageView
} from './index';

const mock = vi.hoisted(() => ({
  initialize: vi.fn(),
  tracing: vi.fn(),
  pushEvent: vi.fn(),
  setView: vi.fn(),
  pushError: vi.fn()
}));
vi.mock('@grafana/faro-web-sdk', () => ({
  initializeFaro: mock.initialize,
  ErrorsInstrumentation: class {},
  SessionInstrumentation: class {},
  WebVitalsInstrumentation: class {}
}));
vi.mock('@grafana/faro-web-tracing', () => ({
  TracingInstrumentation: class {
    constructor(options: unknown) {
      mock.tracing(options);
    }
  }
}));
const options = {
  app: 'shell-front',
  collectorUrl: 'https://telemetry.example.test/collect',
  apiUrls: { vision: 'https://api.example.test', absent: undefined, bad: 'not a URL' }
};
beforeEach(() => {
  delete window.__visinObservabilityV1;
  vi.clearAllMocks();
  mock.initialize.mockReturnValue({
    api: { pushEvent: mock.pushEvent, setView: mock.setView, pushError: mock.pushError }
  });
});
const item = (type: string, payload: unknown): TransportItem =>
  ({
    type,
    payload,
    meta: {
      user: { email: 'private@example.test' },
      page: { url: 'https://app.example.test/projects/private?token=secret#private' }
    }
  }) as TransportItem;

describe('privacy', () => {
  it('normalizes slugs, identifiers and query strings', () => {
    expect(normalizeTelemetryPath('/projects/private-name/trainings/123?secret=x#private')).toBe(
      '/projects/:id/trainings/:id'
    );
    expect(normalizeTelemetryPath('http://[')).toBe('/other');
    expect(normalizeTelemetryPath('/')).toBe('/');
  });
  it('drops logs and strips identity and raw page URLs without mutating input', () => {
    expect(sanitizeTelemetry(item('log', {}))).toBeNull();
    const input = item('event', { name: 'page_view', attributes: { route: '/projects/:id', secret: 'private' } });
    const output = sanitizeTelemetry(input)!;
    expect(output.meta.user).toBeUndefined();
    expect(output.meta.page).toEqual({ url: '/projects/:id' });
    expect(output.payload).toMatchObject({ attributes: { route: '/projects/:id' } });
    expect(input.meta.user?.email).toBe('private@example.test');
    expect(sanitizeTelemetry(item('event', { name: 'session_start' }))!.payload).toMatchObject({ attributes: {} });
    expect(sanitizeTelemetry({ ...item('event', {}), meta: {} })!.meta).toEqual({});
  });
  it('redacts error text, contexts and signed URLs but preserves bundle source-map coordinates', () => {
    const output = sanitizeTelemetry(
      item('exception', {
        value: 'Failed to load https://api.example.test/p?token=x for private@example.test',
        context: { body: 'secret' },
        originalError: 'secret',
        stacktrace: {
          frames: [
            { filename: 'https://private.example.test/secret', function: "Error: Project 'secret' failed" },
            { filename: 'https://app.example.test/assets/app-hash.js?token=x', lineno: 3 },
            { filename: 'https://app.example.test/projects/secret-slug', lineno: 9 },
            { filename: 'javascript:secret', lineno: 1 }
          ]
        }
      })
    )!;
    expect(output.payload).toEqual({
      value: 'Failed to load <url> for <email>',
      stacktrace: {
        frames: [
          { filename: 'https://app.example.test/assets/app-hash.js', lineno: 3 },
          { filename: 'https://app.example.test/<page>', lineno: 9 },
          { filename: '', lineno: 1 }
        ]
      }
    });
    expect(sanitizeTelemetry(item('exception', {}))!.payload).toEqual({ value: '' });
  });
  it.each([
    ["Cannot read properties of undefined (reading 'name')", "Cannot read properties of undefined (reading 'name')"],
    ["Project 'secret-plan' not found", "Project '<str>' not found"],
    ['Training 65f1c2a9b3e4d5f6a7b8c9d0 failed', 'Training <id> failed'],
    ['Session 0af76519-16cd-43dd-8448-eb211c80319c expired', 'Session <id> expired'],
    ['Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig rejected', 'Bearer <token> rejected'],
    ['Request failed with 500 after 12000 ms', 'Request failed with 500 after <n> ms'],
    ['Write to a@b.example.test, see http://x.test/a?b=c', 'Write to <email>, see <url>']
  ])('scrubs %j', (message, expected) => {
    expect(scrubErrorMessage(message)).toBe(expected);
  });
  it('caps message length', () => {
    expect(scrubErrorMessage('x '.repeat(400))).toHaveLength(300);
  });
  it("drops Faro's span-mirror events, which repeat raw span attributes", () => {
    const mirror = item('event', {
      name: 'faro.tracing.fetch',
      attributes: { 'http.url': 'https://x.test/p?token=1' }
    });
    expect(sanitizeTelemetry(mirror)).toBeNull();
  });
  it('fails closed on an item it cannot copy instead of throwing into the batch', () => {
    const uncloneable = item('event', { name: 'page_view', attributes: { route: '/' }, hook: () => undefined });
    expect(sanitizeTelemetry(uncloneable)).toBeNull();
  });
  it('keeps listed route words and replaces everything else', () => {
    const words = new Set(['api', 'projects', 'archive']);
    expect(normalizeTelemetryPath('/api/projects/private-name/archive', words)).toBe('/api/projects/:id/archive');
    expect(normalizeTelemetryPath('/api/projects/private-name/restore', words)).toBe('/api/projects/:id/:id');
  });
  it('removes Web Vitals DOM attribution context', () => {
    expect(
      sanitizeTelemetry(item('measurement', { values: { lcp: 30 }, context: { element: '#private-name' } }))!.payload
    ).toEqual({ values: { lcp: 30 } });
  });
  it('retains trace IDs and bounded operations while removing raw attributes, events and status text', () => {
    const span = {
      name: 'GET secret',
      traceId: 'abc',
      status: { message: 'secret' },
      events: ['private'],
      attributes: [
        { key: 'http.method', value: { stringValue: 'GET' } },
        { key: 'http.url', value: { stringValue: 'https://api.example.test/private?token=secret' } },
        { key: 'visin.operation', value: { stringValue: '/projects/:id' } }
      ]
    };
    const result = sanitizeTelemetry(
      item('trace', { resourceSpans: [{ scopeSpans: [{ spans: [span, { name: 'unknown' }] }, {}] }, {}] })
    )!;
    const json = JSON.stringify(result);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('http.url');
    expect(json).toContain('GET /projects/:id');
    expect(json).toContain('HTTP /other');
    expect(json).toContain('abc');
    expect(sanitizeTelemetry(item('trace', {}))!.payload).toEqual({});
  });
});

describe('initialization and events', () => {
  it.each([undefined, '', 'bad', 'file:///tmp/collector', 'https://user:secret@example.test'])(
    'disables invalid collector %s',
    async (url) => {
      await initializeFrontendObservability({ ...options, collectorUrl: url });
      expect(mock.initialize).not.toHaveBeenCalled();
      trackFrontendPageView('/', 'initial');
      reportFrontendError(new Error('test'));
      expect(mock.pushEvent).not.toHaveBeenCalled();
    }
  );
  it('shares initialization across simultaneous calls and remounts', async () => {
    await Promise.all([initializeFrontendObservability(options), initializeFrontendObservability(options)]);
    await initializeFrontendObservability(options);
    expect(mock.initialize).toHaveBeenCalledTimes(1);
    const config = mock.initialize.mock.calls[0][0] as BrowserConfig;
    expect(config.sessionTracking).toMatchObject({ persistent: false, samplingRate: 1 });
    expect(config.beforeSend).toBe(sanitizeTelemetry);
    expect(config.ignoreUrls?.[0]).toEqual(expect.any(RegExp));
    expect((config.ignoreUrls![0] as RegExp).test('https://telemetry.example.test/collect?x=y')).toBe(true);
    const tracing = mock.tracing.mock.calls[0][0] as TracingInstrumentationOptions;
    const patterns = tracing.instrumentationOptions!.propagateTraceHeaderCorsUrls! as RegExp[];
    expect(patterns.some((p) => p.test('https://api.example.test/projects/123'))).toBe(true);
    expect(patterns.some((p) => p.test('https://api.example.test.evil.test/projects/123'))).toBe(false);
    expect(tracing.omitTraceContextForUnsampledSessions).toBe(true);
    expect(
      (config.ignoreUrls![1] as RegExp).test('https://api.example.test/conversations/private/events?cursor=secret')
    ).toBe(true);
  });
  it.each([NaN, -1, 2, 0.25, 0])('validates sampling %s', async (rate) => {
    await initializeFrontendObservability({ ...options, samplingRate: rate });
    expect(mock.initialize.mock.calls[0][0].sessionTracking.samplingRate).toBe(
      Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 1
    );
  });
  it('labels an empty environment or release as unknown', async () => {
    await initializeFrontendObservability({ ...options, environment: '', version: '' });
    expect(mock.initialize.mock.calls[0][0].app).toMatchObject({ environment: 'unknown', version: 'unknown' });
  });
  it('accepts a relative collector and relative API base, resolved against the page', async () => {
    await initializeFrontendObservability({ ...options, collectorUrl: '/collect/faro', apiUrls: { vision: '/api' } });
    const config = mock.initialize.mock.calls[0][0] as BrowserConfig;
    expect(config.url).toBe(`${window.location.origin}/collect/faro`);
    const tracing = mock.tracing.mock.calls[0][0] as TracingInstrumentationOptions;
    const patterns = tracing.instrumentationOptions!.propagateTraceHeaderCorsUrls! as RegExp[];
    expect(patterns[0].test(`${window.location.origin}/api/projects/1`)).toBe(true);
  });
  it('sends a page view that arrived before initialization finished, once', async () => {
    trackFrontendPageView('/projects/first', 'early');
    trackFrontendPageView('/projects/second', 'later');
    await initializeFrontendObservability({ ...options, routeSegments: ['projects'] });
    expect(mock.pushEvent).toHaveBeenCalledTimes(1);
    expect(mock.pushEvent).toHaveBeenCalledWith('page_view', { route: '/projects/:id' }, 'visin', { skipDedupe: true });
    trackFrontendPageView('/projects/second', 'later');
    expect(mock.pushEvent).toHaveBeenCalledTimes(1);
  });
  it('reports operations with the configured route words', async () => {
    await initializeFrontendObservability({ ...options, routeSegments: ['archive'] });
    const hook = (mock.tracing.mock.calls[0][0] as TracingInstrumentationOptions).instrumentationOptions!
      .fetchInstrumentationOptions!.applyCustomAttributesOnSpan!;
    const span = {
      startTime: [Math.floor(Date.now() / 1000), 0],
      attributes: { 'http.url': 'https://api.example.test/api/projects/secret-name/archive', 'http.method': 'POST' },
      setAttribute: vi.fn(),
      spanContext: () => ({ traceId: 'abc', spanId: 'def' })
    };
    hook(span as never, {}, { status: 200 } as never);
    expect(mock.pushEvent.mock.lastCall![1].operation).toBe('/api/projects/:id/archive');
  });
  it('allows retry after an SDK startup failure', async () => {
    mock.initialize.mockImplementationOnce(() => {
      throw new Error('SDK failed');
    });
    await expect(initializeFrontendObservability(options)).resolves.toBeUndefined();
    await initializeFrontendObservability(options);
    expect(mock.initialize).toHaveBeenCalledTimes(2);
  });
  it('deduplicates StrictMode visits but preserves new visits to the same route', async () => {
    await initializeFrontendObservability(options);
    trackFrontendPageView('/projects/private?token=secret', 'one');
    trackFrontendPageView('/projects/private?token=secret', 'one');
    trackFrontendPageView('/projects/private', 'two');
    expect(mock.pushEvent).toHaveBeenCalledTimes(2);
    expect(mock.pushEvent).toHaveBeenLastCalledWith('page_view', { route: '/projects/:id' }, 'visin', {
      skipDedupe: true
    });
    reportFrontendError(new Error('example'));
    expect(mock.pushError).toHaveBeenCalledTimes(1);
  });
  it('emits request measurements with the originating trace ID and normalized operation', async () => {
    await initializeFrontendObservability(options);
    const hook = (mock.tracing.mock.calls[0][0] as TracingInstrumentationOptions).instrumentationOptions!
      .fetchInstrumentationOptions!.applyCustomAttributesOnSpan!;
    const now = Date.now();
    const span = {
      startTime: [Math.floor(now / 1000) - 1, 0],
      attributes: { 'http.url': 'https://api.example.test/projects/private?token=secret', 'http.method': 'GET' },
      setAttribute: vi.fn(),
      spanContext: () => ({ traceId: 'abc', spanId: 'def' })
    };
    hook(span as never, {}, { status: 200, url: 'unused' } as never);
    expect(mock.pushEvent).toHaveBeenLastCalledWith(
      'api_request',
      expect.objectContaining({ operation: '/projects/:id', status: '200', outcome: 'success', method: 'GET' }),
      'visin',
      expect.objectContaining({ spanContext: { traceId: 'abc', spanId: 'def' } })
    );
    hook(span as never, {}, { status: 500 } as never);
    expect(mock.pushEvent.mock.lastCall![1].outcome).toBe('http_error');
    hook(span as never, {}, new Error('network') as never);
    expect(mock.pushEvent.mock.lastCall![1].outcome).toBe('network_error');
    hook(span as never, {}, new DOMException('cancelled', 'AbortError') as never);
    expect(mock.pushEvent.mock.lastCall![1].outcome).toBe('cancelled');
    hook(span as never, {}, new DOMException('expired', 'TimeoutError') as never);
    expect(mock.pushEvent.mock.lastCall![1].outcome).toBe('timeout');
    const xhrHook = (mock.tracing.mock.calls[0][0] as TracingInstrumentationOptions).instrumentationOptions!
      .xhrInstrumentationOptions!.applyCustomAttributesOnSpan!;
    xhrHook(
      {
        ...span,
        attributes: { 'url.full': 'https://api.example.test/datasets/private', 'http.request.method': 'POST' }
      } as never,
      { status: 201 } as never
    );
    expect(mock.pushEvent.mock.lastCall![1]).toMatchObject({
      method: 'POST',
      operation: '/datasets/:id',
      outcome: 'success'
    });
    const noMethod = { ...span, attributes: { 'url.full': 'https://api.example.test/projects/123' } };
    hook(noMethod as never, {}, { status: undefined } as never);
    expect(mock.pushEvent.mock.lastCall![1].method).toBe('HTTP');
    mock.pushEvent.mockClear();
    hook({ ...span, attributes: {} } as never, {}, {} as never);
    hook({ ...span, attributes: { 'http.url': 'https://third-party.example.test' } } as never, {}, {} as never);
    hook({ ...span, startTime: undefined } as never, {}, {} as never);
    expect(mock.pushEvent).not.toHaveBeenCalled();
  });
});
