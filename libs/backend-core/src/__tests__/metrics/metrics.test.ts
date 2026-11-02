import express from 'express';
import type { Request, Response } from 'express';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import {
  metricsHandler,
  metricsMiddleware,
  routeLabel,
  register,
  httpRequestsTotal,
  activeConnections
} from '../../metrics';

async function withApp(setup: (app: express.Express) => void, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(metricsMiddleware);
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

const scrape = async (): Promise<string> => register.metrics();

beforeEach(() => {
  httpRequestsTotal.reset();
});

describe('routeLabel', () => {
  const req = (route: unknown, baseUrl?: string) => ({ route, baseUrl }) as unknown as Request;

  it('is the pattern written in the code, with the router it is mounted on', () => {
    expect(routeLabel(req({ path: '/:id' }, '/api/datasets'))).toBe('/api/datasets/:id');
  });

  it('works without a mount path', () => {
    expect(routeLabel(req({ path: '/health' }))).toBe('/health');
  });

  it('uses the source of a regular expression route', () => {
    expect(routeLabel(req({ path: /^\/files\/\d+$/ }))).toBe('^\\/files\\/\\d+$');
  });

  it('shares one label between requests no route matched, and routes given as a list', () => {
    expect(routeLabel(req(undefined))).toBe('unmatched');
    expect(routeLabel(req({ path: ['/a', '/b'] }))).toBe('unmatched');
  });
});

describe('metricsMiddleware', () => {
  it('counts a request under its route, not its URL', async () => {
    await withApp(
      (app) => app.get('/api/items/:id', (_req, res) => void res.json({ ok: true })),
      async (baseUrl) => {
        await fetch(`${baseUrl}/api/items/1`);
        await fetch(`${baseUrl}/api/items/2?token=secret`);
      }
    );

    const text = await scrape();
    expect(text).toContain('http_requests_total{method="GET",route="/api/items/:id",status_code="200"');
    expect(text).not.toContain('secret');
    expect(text).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/api\/items\/:id"[^}]*\} 2/);
  });

  it('reports a request nothing matched as one unmatched series', async () => {
    await withApp(
      () => undefined,
      async (baseUrl) => {
        await fetch(`${baseUrl}/wp-login.php`);
        await fetch(`${baseUrl}/.env`);
      }
    );

    expect(await scrape()).toMatch(/http_requests_total\{[^}]*route="unmatched",status_code="404"[^}]*\} 2/);
  });

  it('counts an open event stream but does not time it', async () => {
    await withApp(
      (app) =>
        app.get('/events', (_req, res) => {
          res.setHeader('Content-Type', 'text/event-stream');
          res.end('data: hi\n\n');
        }),
      async (baseUrl) => {
        await (await fetch(`${baseUrl}/events`)).text();
      }
    );

    const text = await scrape();
    expect(text).toContain('route="/events",status_code="200"');
    expect(text).not.toMatch(/http_request_duration_seconds_count\{[^}]*route="\/events"/);
  });

  it('times a POST answered as an event stream', async () => {
    await withApp(
      (app) =>
        app.post('/mcp', (_req, res) => {
          res.setHeader('Content-Type', 'text/event-stream');
          res.end('data: hi\n\n');
        }),
      async (baseUrl) => {
        await (await fetch(`${baseUrl}/mcp`, { method: 'POST' })).text();
      }
    );

    expect(await scrape()).toMatch(/http_request_duration_seconds_count\{[^}]*route="\/mcp"[^}]*\} 1/);
  });

  it('counts a connection down once the response is closed, however it ended', async () => {
    const before = (await activeConnections.get()).values[0]?.value ?? 0;
    let during = -1;

    await withApp(
      (app) =>
        app.get('/slow', async (_req, res) => {
          during = (await activeConnections.get()).values[0]?.value ?? 0;
          res.json({});
        }),
      async (baseUrl) => {
        await fetch(`${baseUrl}/slow`);
      }
    );

    expect(during).toBe(before + 1);
    expect((await activeConnections.get()).values[0]?.value ?? 0).toBe(before);
  });

  it('labels every series with the service name', async () => {
    expect(await scrape()).toContain('app="unknown-service"');
  });
});

describe('metricsHandler', () => {
  const response = () => {
    const res = { set: jest.fn(), end: jest.fn(), status: jest.fn() };
    res.status.mockReturnValue(res);
    return res;
  };

  it('serves the registry in the Prometheus text format', async () => {
    const res = response();

    await metricsHandler({} as Request, res as unknown as Response);

    expect(res.set).toHaveBeenCalledWith('Content-Type', register.contentType);
    expect(String(res.end.mock.calls[0][0])).toContain('# TYPE http_requests_total counter');
  });

  it('answers 500 rather than throwing when the registry cannot be read', async () => {
    const res = response();
    jest.spyOn(register, 'metrics').mockRejectedValueOnce(new Error('boom'));

    await metricsHandler({} as Request, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith('Error generating metrics');
  });
});
