import { context, propagation, trace, SpanKind, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import {
  NodeTracerProvider,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { routeLabel } from '../metrics';
import { safeRequestPath } from '../logging/requestDiagnostics';

// Share of requests that are traced and exported. A tenth is the default; set
// OTEL_TRACES_SAMPLER_ARG (0 to 1) to change it. A request that arrives already
// sampled by another service stays sampled, so a trace is whole or absent, never half.
const DEFAULT_SAMPLE_RATIO = 0.1;

export const sampleRatio = (env: NodeJS.ProcessEnv = process.env): number => {
  const raw = env.OTEL_TRACES_SAMPLER_ARG;
  const ratio = raw !== undefined && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : DEFAULT_SAMPLE_RATIO;
};

/**
 * Builds the tracer provider and registers it globally. Spans go over OTLP/HTTP
 * to OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.
 *
 * With it unset there is no exporter at all: spans are still made and passed
 * along in a trace context (so a trace id reaches the log lines), they just have
 * nowhere to be sent. There is deliberately no default host, since a service
 * resending to a name that does not exist ties up Node's few shared DNS threads.
 */
export const initTracer = (serviceName: string): Tracer => {
  const url = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

  const provider = new NodeTracerProvider({
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(sampleRatio()) }),
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development'
    }),
    spanProcessors: url ? [new BatchSpanProcessor(new OTLPTraceExporter({ url }))] : []
  });
  provider.register();

  return provider.getTracer(serviceName);
};

let tracer: Tracer | null = null;

/** The service's tracer, created on first use from SERVICE_NAME. */
export const getTracer = (): Tracer => {
  tracer ??= initTracer(process.env.SERVICE_NAME || 'unknown-service');
  return tracer;
};

/** Makes one SERVER span per request, a child of the caller's when it sent a `traceparent`. */
export const tracingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const parentContext = propagation.extract(context.active(), req.headers);
  const span = getTracer().startSpan(
    `${req.method} ${safeRequestPath(req.originalUrl)}`,
    { kind: SpanKind.SERVER },
    parentContext
  );
  span.setAttribute('http.method', req.method);
  // Without the query: a signed file link carries its token there.
  span.setAttribute('http.url', safeRequestPath(req.originalUrl));

  // Ended on whichever comes first: 'finish' for a response sent in full,
  // 'close' for one the client gave up on. A span that is never ended is never exported.
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    // Named for the route, not the URL: "GET /api/datasets/:id" is one operation
    // in the trace list, where the raw path would be one per id.
    const route = routeLabel(req);
    span.updateName(`${req.method} ${route}`);
    span.setAttribute('http.route', route);
    span.setAttribute('http.status_code', res.statusCode);
    if (!res.writableFinished) span.setAttribute('http.aborted', true);
    if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  };
  res.once('finish', end);
  res.once('close', end);

  // Run the rest of the request with this span active, so the spans made below it
  // (database queries) become its children and the logger can read the trace id.
  context.with(trace.setSpan(parentContext, span), next);
};

/** The W3C `traceparent` header for a call made now, if a trace is active. */
export const traceHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  return headers;
};
