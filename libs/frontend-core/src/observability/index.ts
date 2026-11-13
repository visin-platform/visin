import {
  initializeFaro,
  ErrorsInstrumentation,
  SessionInstrumentation,
  WebVitalsInstrumentation,
  type Faro,
  type TransportItem,
  type ExceptionEvent,
  type MeasurementEvent,
  type EventEvent
} from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

export interface FrontendObservabilityOptions {
  collectorUrl?: string;
  app: string;
  environment?: string;
  version?: string;
  /** Explicit API base URLs, keyed by stable service names. */
  apiUrls: Record<string, string | undefined>;
  /** Session sampling applies to all signals. Default 1 for a limited pilot. */
  samplingRate?: number;
  /**
   * Static path segments (route words such as `archive` or `trainings`) reported verbatim, in
   * addition to the built-in ones. Every other segment becomes `:id`, so this list is what keeps
   * `/projects/:id/archive` and `/projects/:id/restore` apart. Generate it from route definitions.
   */
  routeSegments?: Iterable<string>;
}

interface ObservabilityState {
  faro?: Faro;
  pending?: Promise<void>;
  lastNavigation?: string;
  /** The latest navigation seen before Faro was ready, sent once it is. */
  pendingView?: { path: string; key: string };
  segments?: ReadonlySet<string>;
}

declare global {
  interface Window {
    __visinObservabilityV1?: ObservabilityState;
  }
}

// Unknown segments are always placeholders, including human-readable slugs.
// This intentionally sacrifices detail rather than exporting private names.
const builtInSegments: ReadonlySet<string> = new Set(
  (
    'api auth public projects datasets trainings epochs configs comparisons visualizations ' +
    'benchmarks models evaluations suites leaderboards papers jobs work account invite chat explore search people groups ' +
    'u g login logout register verify profile users sessions images files upload download results settings members ' +
    'messages conversations notifications home health status licenses me'
  ).split(' ')
);

export function normalizeTelemetryPath(path: string, segments: ReadonlySet<string> = builtInSegments): string {
  try {
    return new URL(path, 'https://redacted.invalid').pathname
      .split('/')
      .map((segment) => (segment && !segments.has(segment) ? ':id' : segment))
      .join('/');
  } catch {
    return '/other';
  }
}

const MAX_MESSAGE_LENGTH = 300;
const SCRIPT_PATH = /\.(?:m?js|cjs|jsx|tsx?)$/;

/**
 * Keeps an error message readable while removing what tends to carry private data: URLs (signed
 * links, slugs), email addresses, tokens, long ids and numbers, and quoted text other than a plain
 * identifier. `Cannot read properties of undefined (reading 'name')` survives intact, so does
 * `Project <str> not found` once a quoted slug is removed. Words outside quotes are kept: a
 * message that interpolates a name without quotes can still carry it.
 */
export function scrubErrorMessage(message: string): string {
  return (
    message
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`<>)]+/gi, '<url>')
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>')
      // JWTs and other long opaque tokens.
      .replace(/\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?/g, '<token>')
      .replace(/(['"`])([^'"`\n]*)\1/g, (quoted, mark: string, inner: string) =>
        /^[A-Za-z_$][\w$]{0,39}$/.test(inner) ? quoted : `${mark}<str>${mark}`
      )
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
      .replace(/\b(?=[0-9a-z_-]*\d)[0-9a-z_-]{20,}\b/gi, '<id>')
      .replace(/\b\d{4,}\b/g, '<n>')
      .slice(0, MAX_MESSAGE_LENGTH)
  );
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Only permit http(s) URLs without credentials. A path (`/collect/faro`) resolves against `base`;
 * anything else must be absolute, so a mistyped value disables rather than guesses.
 */
function safeUrl(value: string, base?: string): URL | undefined {
  try {
    const url = new URL(value, value.startsWith('/') ? base : undefined);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/**
 * Strip free-form span data, URLs, and error messages before browser export. Fails closed: an
 * item that cannot be sanitized is dropped, never sent as it was, and never throws into Faro's
 * batch (where one bad item would discard the whole batch).
 */
export function sanitizeTelemetry(item: TransportItem): TransportItem | null {
  try {
    return sanitize(item);
  } catch {
    return null;
  }
}

function sanitize(item: TransportItem): TransportItem | null {
  // Faro mirrors every client span as a `faro.tracing.*` event carrying all span attributes (raw
  // URLs included). After redaction it would be an empty duplicate of `api_request`.
  if (item.type === 'event' && (item.payload as EventEvent).name?.startsWith('faro.tracing.')) return null;
  const clone = structuredClone(item);
  delete clone.meta.user;
  if (clone.meta.page) clone.meta.page = { url: normalizeTelemetryPath(clone.meta.page.url ?? '/') };
  if (clone.type === 'log') return null;
  if (clone.type === 'exception') {
    const error = clone.payload as ExceptionEvent<true>;
    error.value = scrubErrorMessage(error.value ?? '');
    delete error.context;
    delete error.originalError;
    if (error.stacktrace) {
      // A frame without a line is the stack's header line misread as a frame (Chrome's
      // `Error: <message>`): its "function" is the raw message and its "filename" whatever
      // URL the message held. Real frames always have a line.
      error.stacktrace.frames = error.stacktrace.frames.filter((frame) => frame.lineno);
      for (const frame of error.stacktrace.frames) {
        // Keep hashed bundle names for source-map lookup, but no signed query strings. A frame in
        // inline or eval'd code is named after the page, whose path can hold a private slug.
        const url = safeUrl(frame.filename);
        frame.filename = !url
          ? ''
          : SCRIPT_PATH.test(url.pathname)
            ? `${url.origin}${url.pathname}`
            : `${url.origin}/<page>`;
      }
    }
  }
  if (clone.type === 'measurement') delete (clone.payload as MeasurementEvent).context;
  if (clone.type === 'event') {
    const event = clone.payload as EventEvent;
    event.attributes = Object.fromEntries(
      Object.entries(event.attributes ?? {}).filter(([key]) =>
        ['route', 'service', 'operation', 'method', 'status', 'outcome', 'duration_seconds'].includes(key)
      )
    );
  }
  if (clone.type === 'trace') {
    // OTLP includes raw request URLs and network-event attributes by default.
    // Retain only bounded HTTP attributes; trace/span identifiers remain intact.
    const payload = clone.payload as {
      resourceSpans?: Array<{
        scopeSpans?: Array<{
          spans?: Array<{
            name: string;
            attributes?: Array<{ key: string; value?: { stringValue?: string } }>;
            events?: unknown[];
            status?: { message?: string };
          }>;
        }>;
      }>;
    };
    for (const resource of payload.resourceSpans ?? []) {
      for (const scope of resource.scopeSpans ?? []) {
        for (const span of scope.spans ?? []) {
          const operation = span.attributes?.find((attr) => attr.key === 'visin.operation')?.value?.stringValue;
          const method = span.attributes?.find((attr) => ['http.method', 'http.request.method'].includes(attr.key))
            ?.value?.stringValue;
          span.name = `${method ?? 'HTTP'} ${operation ?? '/other'}`;
          span.attributes = span.attributes?.filter((attr) =>
            [
              'http.method',
              'http.request.method',
              'http.status_code',
              'http.response.status_code',
              'visin.operation',
              'visin.service'
            ].includes(attr.key)
          );
          delete span.events;
          if (span.status) delete span.status.message;
        }
      }
    }
  }
  return clone;
}

/** Shared across independently bundled remotes; never patches fetch more than once. */
export async function initializeFrontendObservability(options: FrontendObservabilityOptions): Promise<void> {
  if (typeof window === 'undefined' || !options.collectorUrl) return;
  // Relative (`/collect/faro`) keeps delivery same-origin on every hostname serving the app.
  const collector = safeUrl(options.collectorUrl, window.location.href);
  if (!collector) return;
  const state = (window.__visinObservabilityV1 ??= {});
  if (state.faro) return;
  if (state.pending) return state.pending;
  state.pending = Promise.resolve()
    .then(() => {
      const segments = new Set([...builtInSegments, ...(options.routeSegments ?? [])]);
      const apis = Object.entries(options.apiUrls).flatMap(([service, value]) => {
        const url = value && safeUrl(value, window.location.href);
        return url
          ? [
              {
                service,
                url,
                pattern: new RegExp(`^${escapeRegex(url.origin + url.pathname.replace(/\/$/, ''))}(?:/|\\?|$)`)
              }
            ]
          : [];
      });
      const rate = options.samplingRate ?? 1;
      const recordApiRequest = (
        span: {
          spanContext: () => { traceId: string; spanId: string };
          setAttribute: (key: string, value: string) => unknown;
        },
        response: { status?: number; name?: string }
      ) => {
        // The callback runs after body transfer for ordinary fetch responses.
        const readable = span as unknown as {
          startTime?: [number, number];
          attributes?: Record<string, unknown>;
        };
        const raw = readable.attributes?.['http.url'] ?? readable.attributes?.['url.full'];
        if (typeof raw !== 'string') return;
        const url = new URL(raw, window.location.href);
        const api = apis.find((api) => api.pattern.test(url.href));
        if (!api) return;
        const operation = normalizeTelemetryPath(url.pathname, segments);
        span.setAttribute('visin.operation', operation);
        span.setAttribute('visin.service', api.service);
        const start = readable.startTime;
        if (!start) return;
        const duration = Math.max(0, (Date.now() - (start[0] * 1000 + start[1] / 1e6)) / 1000);
        const status = 'status' in response ? (response.status ?? 0) : 0;
        const method = readable.attributes?.['http.request.method'] ?? readable.attributes?.['http.method'];
        const outcome =
          'name' in response && response.name === 'AbortError'
            ? 'cancelled'
            : 'name' in response && response.name === 'TimeoutError'
              ? 'timeout'
              : status === 0
                ? 'network_error'
                : status >= 400
                  ? 'http_error'
                  : 'success';
        state.faro?.api.pushEvent(
          'api_request',
          {
            service: api.service,
            operation,
            method: typeof method === 'string' ? method : 'HTTP',
            status: String(status),
            outcome,
            duration_seconds: String(duration)
          },
          'visin',
          { skipDedupe: true, spanContext: span.spanContext() }
        );
      };
      const faro = initializeFaro({
        url: collector.href,
        app: {
          name: options.app,
          // Runtime config renders an unset variable as '', which must not become an empty label.
          environment: options.environment || 'unknown',
          version: options.version || 'unknown'
        },
        sessionTracking: {
          enabled: true,
          persistent: false,
          samplingRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 1
        },
        batching: { enabled: true, itemLimit: 50, sendTimeout: 2000 },
        beforeSend: sanitizeTelemetry,
        ignoreUrls: [
          new RegExp(`^${escapeRegex(collector.origin + collector.pathname)}(?:\\?|$)`),
          // Chat's event streams last as long as a page; they are not request latency.
          /\/events(?:\?|$)/
        ],
        instrumentations: [
          new ErrorsInstrumentation(),
          new SessionInstrumentation(),
          new WebVitalsInstrumentation(),
          new TracingInstrumentation({
            // Do not suppress independent backend sampling for sessions Faro drops.
            omitTraceContextForUnsampledSessions: true,
            instrumentationOptions: {
              propagateTraceHeaderCorsUrls: apis.map((api) => api.pattern),
              xhrInstrumentationOptions: {
                ignoreNetworkEvents: true,
                applyCustomAttributesOnSpan: (span, xhr) => recordApiRequest(span, xhr)
              },
              fetchInstrumentationOptions: {
                ignoreNetworkEvents: true,
                applyCustomAttributesOnSpan: (span, _request, response) => recordApiRequest(span, response)
              }
            }
          })
        ]
      });
      state.segments = segments;
      state.faro = faro;
      const view = state.pendingView;
      state.pendingView = undefined;
      if (view) trackFrontendPageView(view.path, view.key);
    })
    .catch(() => {
      // Monitoring must not stop application startup. A later initialization may retry.
    })
    .finally(() => {
      state.pending = undefined;
    });
  return state.pending;
}

/** Call from the owning router; navigation keys preserve legitimate repeat visits. */
export function trackFrontendPageView(path: string, navigationKey: string): void {
  if (typeof window === 'undefined') return;
  const state = (window.__visinObservabilityV1 ??= {});
  if (!state.faro) {
    // Initialization still running (or past the app's startup wait): send the page view later.
    state.pendingView = { path, key: navigationKey };
    return;
  }
  if (state.lastNavigation === navigationKey) return;
  state.lastNavigation = navigationKey;
  const route = normalizeTelemetryPath(path, state.segments);
  state.faro.api.setView({ name: route });
  state.faro.api.pushEvent('page_view', { route }, 'visin', { skipDedupe: true });
}

export function reportFrontendError(error: Error): void {
  if (typeof window !== 'undefined') window.__visinObservabilityV1?.faro?.api.pushError(error);
}
