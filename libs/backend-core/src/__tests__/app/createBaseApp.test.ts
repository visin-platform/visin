import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { createBaseApp } from '../../app/createBaseApp';
import { errorHandler } from '../../middleware/errorHandler';

import type { CreateBaseAppOptions } from '../../app/createBaseApp';

async function withServer(
  options: string[] | CreateBaseAppOptions,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createBaseApp(Array.isArray(options) ? { corsOrigins: options } : options);
  app.get('/cookie-check', (req, res) => {
    res.json({ cookies: req.cookies });
  });
  app.post('/echo', (req, res) => {
    res.json({ body: req.body ?? null });
  });
  app.use(errorHandler);

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://localhost:${port}`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe('createBaseApp CORS', () => {
  it('returns a classified 403 (not an unhandled 500) for a disallowed origin', async () => {
    await withServer(['https://allowed.example'], async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`, {
        headers: { Origin: 'https://evil.example' }
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toMatchObject({ success: false, error: 'ForbiddenError' });
    });
  });

  it('allows a request from an allowlisted origin, with CORS headers set', async () => {
    await withServer(['https://allowed.example'], async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`, {
        headers: { Origin: 'https://allowed.example' }
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
    });
  });

  it('answers a preflight OPTIONS without corsMethods configured (regression: explicit undefined methods crashed the cors package)', async () => {
    await withServer(['https://allowed.example'], async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://allowed.example',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'content-type'
        }
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
      expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    });
  });

  it('allows requests with no Origin header (e.g. server-to-server calls)', async () => {
    await withServer(['https://allowed.example'], async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`);
      expect(res.status).toBe(200);
    });
  });

  it('falls back to the comma-separated CORS_ORIGIN env var when corsOrigins is not passed', async () => {
    const original = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'https://a.example, https://b.example';
    try {
      await withServer({}, async baseUrl => {
        const allowed = await fetch(`${baseUrl}/cookie-check`, {
          headers: { Origin: 'https://b.example' }
        });
        expect(allowed.status).toBe(200);
        expect(allowed.headers.get('access-control-allow-origin')).toBe('https://b.example');

        const denied = await fetch(`${baseUrl}/cookie-check`, {
          headers: { Origin: 'https://evil.example' }
        });
        expect(denied.status).toBe(403);
      });
    } finally {
      if (original === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = original;
    }
  });

  it('reflects configured corsMethods/corsAllowedHeaders/corsExposedHeaders on preflight', async () => {
    await withServer(
      {
        corsOrigins: ['https://allowed.example'],
        corsMethods: ['GET', 'DELETE'],
        corsAllowedHeaders: ['Content-Type', 'X-Custom'],
        corsExposedHeaders: ['X-Total-Count']
      },
      async baseUrl => {
        const preflight = await fetch(`${baseUrl}/cookie-check`, {
          method: 'OPTIONS',
          headers: {
            Origin: 'https://allowed.example',
            'Access-Control-Request-Method': 'DELETE',
            'Access-Control-Request-Headers': 'x-custom'
          }
        });

        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-methods')).toBe('GET,DELETE');
        expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type,X-Custom');

        const res = await fetch(`${baseUrl}/cookie-check`, {
          headers: { Origin: 'https://allowed.example' }
        });
        expect(res.headers.get('access-control-expose-headers')).toBe('X-Total-Count');
      }
    );
  });

  it('parses cookies onto req.cookies via the mounted cookie-parser', async () => {
    await withServer(['https://allowed.example'], async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`, {
        headers: { Cookie: 'access_token=tok123' }
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { cookies: Record<string, string> };
      expect(body.cookies).toEqual({ access_token: 'tok123' });
    });
  });
});

describe('createBaseApp JSON body parsing', () => {
  const origins = { corsOrigins: ['https://allowed.example'] };

  it('parses JSON bodies by default', async () => {
    await withServer(origins, async baseUrl => {
      const res = await fetch(`${baseUrl}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' })
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ body: { hello: 'world' } });
    });
  });

  it('passes custom options through to express.json()', async () => {
    // strict: false accepts a bare JSON primitive that the default parser rejects,
    // proving the options object reaches express.json().
    await withServer({ ...origins, json: { strict: false } }, async baseUrl => {
      const res = await fetch(`${baseUrl}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '"just a string"'
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ body: 'just a string' });
    });
  });

  it('skips the global JSON parser when json: false', async () => {
    await withServer({ ...origins, json: false }, async baseUrl => {
      const res = await fetch(`${baseUrl}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' })
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ body: null });
    });
  });
});
