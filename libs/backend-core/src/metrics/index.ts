import promClient from 'prom-client';
import type { NextFunction, Request, Response } from 'express';

const register = new promClient.Registry();

register.setDefaultLabels({ app: process.env.SERVICE_NAME || 'unknown-service' });
promClient.collectDefaultMetrics({ register });

// Each metric names `register` explicitly: left out, prom-client adds it to its
// global registry, which is not the one /metrics serves, and the metric is
// counted but never shown.
export const httpRequestDuration = new promClient.Histogram({
  registers: [register],
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  // Starts at 5 ms: with the database on the same machine most requests finish in
  // well under 100 ms, and a first bucket of 0.1 s would hold nearly all of them.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

export const httpRequestsTotal = new promClient.Counter({
  registers: [register],
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

export const activeConnections = new promClient.Gauge({
  registers: [register],
  name: 'active_connections',
  help: 'Number of requests being served'
});

export const databaseQueryDuration = new promClient.Histogram({
  registers: [register],
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

export const databaseQueriesTotal = new promClient.Counter({
  registers: [register],
  name: 'database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'collection', 'status']
});

/** The Prometheus scrape endpoint. */
export const metricsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch {
    res.status(500).end('Error generating metrics');
  }
};

/**
 * The route as it is written in the code ("/api/datasets/:id"), not the URL that
 * was asked for.
 *
 * A label per distinct URL is a time series per distinct URL: every id, every
 * query string and every scanner probing for /wp-login.php adds series that
 * Prometheus keeps in memory. A request no route matched (404s, probes) is one
 * `unmatched` series.
 */
export const routeLabel = (req: Request): string => {
  const path: unknown = req.route?.path;
  // A route can also be a regular expression or a list; the expression is still
  // one fixed label, and a list is rare enough to share the unmatched one.
  const pattern = typeof path === 'string' ? path : path instanceof RegExp ? path.source : undefined;
  if (pattern === undefined) return 'unmatched';
  return `${req.baseUrl ?? ''}${pattern}`;
};

/** A response the browser holds open to receive events, for as long as the page does. */
const isEventStream = (res: Response): boolean =>
  String(res.getHeader('Content-Type') ?? '').includes('text/event-stream');

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();

  activeConnections.inc();
  // 'close' comes for every response, also one the client gave up on before it
  // was sent; 'finish' only for one sent in full. Counting down on 'finish' left
  // every abandoned request, and every long download the client cancelled,
  // counted as open for good.
  res.once('close', () => activeConnections.dec());

  res.once('finish', () => {
    // Read now, not at the start: the router has not matched anything yet then.
    const route = routeLabel(req);
    const status = String(res.statusCode);
    httpRequestsTotal.labels(req.method, route, status).inc();

    // A stream opened with GET is counted but not timed: its "duration" is how
    // long the page stayed open, and a few of those would make every latency
    // percentile read in minutes.
    if (req.method === 'GET' && isEventStream(res)) return;
    httpRequestDuration.labels(req.method, route, status).observe(Number(process.hrtime.bigint() - start) / 1e9);
  });

  next();
};

export { register };
