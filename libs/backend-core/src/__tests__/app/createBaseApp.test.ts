import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { createBaseApp } from '../../app/createBaseApp';
import { errorHandler } from '../../middleware/errorHandler';

async function withServer(
  allowedOrigins: string[],
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createBaseApp({ corsOrigins: allowedOrigins });
  app.get('/cookie-check', (req, res) => {
    res.json({ cookies: req.cookies });
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

  it('allows requests with no Origin header (e.g. server-to-server calls)', async () => {
    await withServer(['https://allowed.example'], async baseUrl => {
      const res = await fetch(`${baseUrl}/cookie-check`);
      expect(res.status).toBe(200);
    });
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
