/**
 * The real OpenTelemetry SDK, with the OTLP exporter swapped for one that keeps
 * the spans, so what a request and a query leave in a trace can be read back.
 */
import type { ReadableSpan } from '@opentelemetry/sdk-trace-node';

const exported: ReadableSpan[] = [];

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: class {
    export(spans: ReadableSpan[], done: (result: { code: number }) => void) {
      exported.push(...spans);
      done({ code: 0 });
    }
    shutdown() {
      return Promise.resolve();
    }
    forceFlush() {
      return Promise.resolve();
    }
  }
}));

process.env.SERVICE_NAME = 'trace-test-service';
process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://jaeger.invalid:4318/v1/traces';
process.env.OTEL_TRACES_SAMPLER_ARG = '1';
// The logger picks its format when it is loaded; only the production one is JSON with a trace id.
process.env.NODE_ENV = 'production';

import express from 'express';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { EventEmitter } from 'events';
import { context, trace } from '@opentelemetry/api';
import { tracingMiddleware, traceHeaders, getTracer } from '../../tracing';
import { observeCommands } from '../../db/commandMonitoring';
import { databaseQueriesTotal, databaseQueryDuration, register } from '../../metrics';
import { fetchWithTimeout } from '../../http/fetchWithTimeout';
import { logger } from '../../logging/logger';

async function flush(): Promise<void> {
  const provider = trace.getTracerProvider() as unknown as { getDelegate(): { forceFlush(): Promise<void> } };
  await provider.getDelegate().forceFlush();
}

async function withApp(setup: (app: express.Express) => void, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(tracingMiddleware);
  setup(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    await run(`http://localhost:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  exported.length = 0;
});

describe('tracingMiddleware', () => {
  it('names the span for the route and records the status, without the query string', async () => {
    await withApp(
      (app) => app.get('/api/items/:id', (_req, res) => void res.json({})),
      async (baseUrl) => {
        await fetch(`${baseUrl}/api/items/42?token=secret`);
      }
    );
    await flush();

    expect(exported).toHaveLength(1);
    const span = exported[0];
    expect(span.name).toBe('GET /api/items/:id');
    expect(span.attributes).toMatchObject({
      'http.method': 'GET',
      'http.url': '/api/items/42',
      'http.route': '/api/items/:id',
      'http.status_code': 200
    });
    expect(JSON.stringify(span.attributes)).not.toContain('secret');
    expect(span.resource.attributes['service.name']).toBe('trace-test-service');
  });

  it("joins the caller's trace when it sends a traceparent", async () => {
    const traceId = '0af7651916cd43dd8448eb211c80319c';
    const parentId = 'b7ad6b7169203331';

    await withApp(
      (app) => app.get('/ping', (_req, res) => void res.json({})),
      async (baseUrl) => {
        await fetch(`${baseUrl}/ping`, { headers: { traceparent: `00-${traceId}-${parentId}-01` } });
      }
    );
    await flush();

    expect(exported[0].spanContext().traceId).toBe(traceId);
    expect(exported[0].parentSpanContext?.spanId).toBe(parentId);
  });

  it('marks a 5xx response as an error', async () => {
    await withApp(
      (app) => app.get('/boom', (_req, res) => void res.status(500).json({})),
      async (baseUrl) => {
        await fetch(`${baseUrl}/boom`);
      }
    );
    await flush();

    expect(exported[0].status.code).toBe(2);
  });

  it("leaves a 4xx response unmarked, since that is the caller's mistake", async () => {
    await withApp(
      () => undefined,
      async (baseUrl) => {
        await fetch(`${baseUrl}/nothing-here`);
      }
    );
    await flush();

    expect(exported[0].name).toBe('GET unmatched');
    expect(exported[0].status.code).toBe(0);
  });

  it('ends a span for a response the client gave up on, and says so', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));

    await withApp(
      (app) =>
        app.get('/stream', (_req, res) => {
          res.write('first');
          void held.then(() => res.end());
        }),
      async (baseUrl) => {
        const controller = new AbortController();
        const response = await fetch(`${baseUrl}/stream`, { signal: controller.signal });
        await response.body?.getReader().read();
        controller.abort();
        // The server notices the closed socket a moment later.
        await new Promise((resolve) => setTimeout(resolve, 50));
        release();
      }
    );
    await flush();

    expect(exported).toHaveLength(1);
    expect(exported[0].attributes['http.aborted']).toBe(true);
  });

  it('ends the span only once when a response both finishes and closes', async () => {
    await withApp(
      (app) => app.get('/once', (_req, res) => void res.json({})),
      async (baseUrl) => {
        await (await fetch(`${baseUrl}/once`)).text();
      }
    );
    await flush();

    expect(exported.filter((span) => span.name === 'GET /once')).toHaveLength(1);
  });

  it("makes the request's span the active one for the handler", async () => {
    let inHandler: string | undefined;

    await withApp(
      (app) =>
        app.get('/active', (_req, res) => {
          inHandler = trace.getSpan(context.active())?.spanContext().traceId;
          res.json({});
        }),
      async (baseUrl) => {
        await fetch(`${baseUrl}/active`);
      }
    );
    await flush();

    expect(inHandler).toBe(exported[0].spanContext().traceId);
  });
});

describe('traceHeaders', () => {
  it('is empty outside a trace', () => {
    expect(traceHeaders()).toEqual({});
  });

  it('carries the active span as a W3C traceparent', () => {
    const span = getTracer().startSpan('outgoing');

    const headers = context.with(trace.setSpan(context.active(), span), () => traceHeaders());
    span.end();

    const { traceId, spanId } = span.spanContext();
    expect(headers.traceparent).toBe(`00-${traceId}-${spanId}-01`);
  });
});

describe('fetchWithTimeout inside a trace', () => {
  it('sends the trace along, and leaves a traceparent the caller set alone', async () => {
    const seen: Array<string | undefined> = [];
    const peer = createServer((req, res) => {
      seen.push(req.headers.traceparent as string | undefined);
      res.end('ok');
    });
    await new Promise<void>((resolve) => peer.listen(0, resolve));
    const url = `http://localhost:${(peer.address() as AddressInfo).port}`;
    const span = getTracer().startSpan('caller');

    try {
      await context.with(trace.setSpan(context.active(), span), async () => {
        await fetchWithTimeout(url);
        await fetchWithTimeout(url, { headers: { traceparent: 'mine' } });
      });
    } finally {
      span.end();
      peer.closeAllConnections();
      await new Promise<void>((resolve) => peer.close(() => resolve()));
    }

    const { traceId, spanId } = span.spanContext();
    expect(seen[0]).toBe(`00-${traceId}-${spanId}-01`);
    expect(seen[1]).toBe('mine');
  });
});

describe('logger inside a trace', () => {
  it('puts the trace id on the line', () => {
    const span = getTracer().startSpan('logging');
    const lines: Array<Record<string, unknown>> = [];
    const sink = logger.transports[0];
    const write = jest.spyOn(sink, 'log').mockImplementation((info: Record<string, unknown>, next?: () => void) => {
      lines.push(info);
      next?.();
    });

    context.with(trace.setSpan(context.active(), span), () => logger.info('inside'));
    logger.info('outside');
    span.end();
    write.mockRestore();

    const { traceId, spanId } = span.spanContext();
    expect(lines[0]).toMatchObject({ message: 'inside', traceId, spanId });
    expect(lines[1]).not.toHaveProperty('traceId');
  });
});

describe('observeCommands', () => {
  const started = (client: EventEmitter, requestId: number, commandName: string, command: Record<string, unknown>) =>
    client.emit('commandStarted', { requestId, commandName, command });
  const labelled = async (name: string) =>
    (await register.getSingleMetric(name)!.get()).values.filter((v) => v.labels.collection === 'datasets');

  beforeEach(() => {
    databaseQueriesTotal.reset();
    databaseQueryDuration.reset();
  });

  it('times a query and counts it by operation, collection and outcome', async () => {
    const client = new EventEmitter();
    observeCommands(client);

    started(client, 1, 'find', { find: 'datasets', filter: { owner: 'private person' } });
    client.emit('commandSucceeded', { requestId: 1, duration: 25 });
    started(client, 2, 'insert', { insert: 'datasets' });
    client.emit('commandFailed', { requestId: 2, duration: 5 });

    const counts = await labelled('database_queries_total');
    expect(counts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labels: { operation: 'find', collection: 'datasets', status: 'success' }, value: 1 }),
        expect.objectContaining({ labels: { operation: 'insert', collection: 'datasets', status: 'error' }, value: 1 })
      ])
    );
    const sum = (await labelled('database_query_duration_seconds')).find(
      (v) => v.metricName === 'database_query_duration_seconds_sum' && v.labels.operation === 'find'
    );
    expect(sum?.value).toBeCloseTo(0.025);
    expect(JSON.stringify(await register.getMetricsAsJSON())).not.toContain('private person');
  });

  it('reads the collection of a getMore, and calls a database-level aggregate none', async () => {
    const client = new EventEmitter();
    observeCommands(client);

    started(client, 1, 'getMore', { getMore: 1234, collection: 'datasets' });
    client.emit('commandSucceeded', { requestId: 1, duration: 1 });
    started(client, 2, 'aggregate', { aggregate: 1 });
    client.emit('commandSucceeded', { requestId: 2, duration: 1 });

    const all = (await register.getSingleMetric('database_queries_total')!.get()).values;
    expect(all.map((v) => `${v.labels.operation}:${v.labels.collection}`).sort()).toEqual([
      'aggregate:none',
      'getMore:datasets'
    ]);
  });

  it('ignores commands that are not queries, and the end of one it never saw begin', async () => {
    const client = new EventEmitter();
    observeCommands(client);

    started(client, 1, 'ping', { ping: 1 });
    client.emit('commandSucceeded', { requestId: 1, duration: 1 });
    client.emit('commandSucceeded', { requestId: 99, duration: 1 });

    expect((await register.getSingleMetric('database_queries_total')!.get()).values).toEqual([]);
  });

  it('listens once per client however often it is asked', async () => {
    const client = new EventEmitter();
    observeCommands(client);
    observeCommands(client);

    started(client, 1, 'find', { find: 'datasets' });
    client.emit('commandSucceeded', { requestId: 1, duration: 1 });

    expect(client.listenerCount('commandStarted')).toBe(1);
    expect((await labelled('database_queries_total'))[0].value).toBe(1);
  });

  it('adds a child span inside a traced request and marks a failed query', async () => {
    const client = new EventEmitter();
    observeCommands(client);
    const request = getTracer().startSpan('GET /request');

    context.with(trace.setSpan(context.active(), request), () => {
      started(client, 1, 'find', { find: 'datasets' });
      started(client, 2, 'update', { update: 'datasets' });
    });
    client.emit('commandSucceeded', { requestId: 1, duration: 1 });
    client.emit('commandFailed', { requestId: 2, duration: 1 });
    request.end();
    await flush();

    const find = exported.find((span) => span.name === 'mongodb.find datasets')!;
    const update = exported.find((span) => span.name === 'mongodb.update datasets')!;
    expect(find.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
    expect(find.attributes).toMatchObject({ 'db.system': 'mongodb', 'db.collection.name': 'datasets' });
    expect(find.status.code).toBe(0);
    expect(update.status.code).toBe(2);
  });

  it('makes no span for a query outside any request', async () => {
    const client = new EventEmitter();
    observeCommands(client);

    started(client, 1, 'find', { find: 'datasets' });
    client.emit('commandSucceeded', { requestId: 1, duration: 1 });
    await flush();

    expect(exported.filter((span) => span.name.startsWith('mongodb.'))).toEqual([]);
  });
});
