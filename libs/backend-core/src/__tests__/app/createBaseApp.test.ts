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
  // Stand-ins for the public OAuth surface, for the publicCorsPaths tests.
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({ issuer: 'https://auth-api.example' });
  });
  app.post('/oauth/token', (_req, res) => {
    res.json({ access_token: 'x' });
  });
  app.post('/oauth/authorize', (_req, res) => {
    res.json({ ok: true });
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

describe('createBaseApp rate limiting', () => {
  const hammer = async (baseUrl: string, path: string, times: number): Promise<number[]> => {
    const statuses: number[] = [];
    for (let i = 0; i < times; i++) {
      statuses.push((await fetch(`${baseUrl}${path}`)).status);
    }
    return statuses;
  };

  it('gives internal service traffic its own, far larger bucket', async () => {
    // A bundle import PUTs tens of thousands of files; the browser bucket
    // (500/min) cut one off partway through with a 429.
    process.env.RATE_LIMIT_PER_MINUTE = '3';
    process.env.INTERNAL_RATE_LIMIT_PER_MINUTE = '50';

    await withServer({}, async baseUrl => {
      const internal = await hammer(baseUrl, '/internal/files/a.bin', 10);
      expect(internal.every(status => status !== 429)).toBe(true);
    });

    delete process.env.RATE_LIMIT_PER_MINUTE;
    delete process.env.INTERNAL_RATE_LIMIT_PER_MINUTE;
  });

  it('still limits public traffic, and internal requests do not consume that bucket', async () => {
    process.env.RATE_LIMIT_PER_MINUTE = '3';
    process.env.INTERNAL_RATE_LIMIT_PER_MINUTE = '50';

    await withServer({}, async baseUrl => {
      await hammer(baseUrl, '/internal/files/a.bin', 10); // must not count against /cookie-check
      const publicStatuses = await hammer(baseUrl, '/cookie-check', 5);

      expect(publicStatuses.slice(0, 3).every(status => status === 200)).toBe(true);
      expect(publicStatuses.at(-1)).toBe(429);
    });

    delete process.env.RATE_LIMIT_PER_MINUTE;
    delete process.env.INTERNAL_RATE_LIMIT_PER_MINUTE;
  });
});

/**
 * The origin allowlist assumes you know who calls you. OAuth discovery,
 * dynamic client registration and token exchange break that assumption by
 * design — the connecting client is one nobody enumerated — so those paths
 * have to sit outside it.
 */
describe('createBaseApp publicCorsPaths', () => {
  const withOauth = {
    corsOrigins: ['https://allowed.example'],
    publicCorsPaths: [
      '/.well-known/oauth-authorization-server',
      '/oauth/register',
      '/oauth/token'
    ]
  };

  it('lets an origin nobody allowlisted read OAuth discovery', async () => {
    await withServer(withOauth, async baseUrl => {
      const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`, {
        headers: { Origin: 'https://claude.ai' }
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  it('never pairs the wildcard with credentials, which the spec forbids', async () => {
    await withServer(withOauth, async baseUrl => {
      const res = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { Origin: 'https://claude.ai', 'Content-Type': 'application/json' },
        body: '{}'
      });

      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    });
  });

  it('answers the preflight an unknown client sends before registering', async () => {
    // This is the request that actually failed in production: a 403 here and
    // the real POST is never even attempted.
    await withServer(withOauth, async baseUrl => {
      const res = await fetch(`${baseUrl}/oauth/register`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://claude.ai',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type'
        }
      });

      expect(res.status).toBeLessThan(300);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  it('still refuses an unknown origin everywhere else', async () => {
    // The exemption is per-path, not a global loosening.
    await withServer(withOauth, async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`, {
        headers: { Origin: 'https://claude.ai' }
      });

      expect(res.status).toBe(403);
    });
  });

  it('keeps the cookie-authenticated consent POST on the allowlist', async () => {
    // /oauth/authorize is the one OAuth path that must NOT be public: its POST
    // carries the session cookie and is CSRF-protected by the consent token.
    await withServer(withOauth, async baseUrl => {
      const res = await fetch(`${baseUrl}/oauth/authorize`, {
        method: 'POST',
        headers: { Origin: 'https://claude.ai', 'Content-Type': 'application/json' },
        body: '{}'
      });

      expect(res.status).toBe(403);
    });
  });

  it('still serves an allowlisted origin with credentials on ordinary routes', async () => {
    await withServer(withOauth, async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`, {
        headers: { Origin: 'https://allowed.example' }
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });
  });

  it('matches a path prefix, so sub-paths of a public endpoint are public too', async () => {
    await withServer(
      { corsOrigins: ['https://allowed.example'], publicCorsPaths: ['/oauth'] },
      async baseUrl => {
        const res = await fetch(`${baseUrl}/oauth/token`, {
          method: 'POST',
          headers: { Origin: 'https://anywhere.example', 'Content-Type': 'application/json' },
          body: '{}'
        });

        expect(res.headers.get('access-control-allow-origin')).toBe('*');
      }
    );
  });

  it('accepts a RegExp for a path that cannot be expressed as a prefix', async () => {
    await withServer(
      { corsOrigins: ['https://allowed.example'], publicCorsPaths: [/^\/\.well-known\//] },
      async baseUrl => {
        const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`, {
          headers: { Origin: 'https://anywhere.example' }
        });

        expect(res.headers.get('access-control-allow-origin')).toBe('*');
      }
    );
  });

  it('behaves exactly as before when no public paths are given', async () => {
    await withServer(['https://allowed.example'], async baseUrl => {
      const blocked = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { Origin: 'https://claude.ai', 'Content-Type': 'application/json' },
        body: '{}'
      });

      expect(blocked.status).toBe(403);
    });
  });
});
