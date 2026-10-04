import { createServer } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { LARGE_PAYLOAD_PREFIXES, bodyLimitFor, jsonBody } from '../../middleware/bodyLimit';
import { evaluationBodySchema } from '../../validation/evaluationSchemas';

describe('bodyLimitFor', () => {
  it('lets every ingestion route, evaluations included, carry the payloads its schema allows', () => {
    for (const path of ['/api/epochs/upload', '/api/benchmarks', '/api/trainings/t1', '/api/evaluations', '/api/evaluations/check', '/api/evaluations/promote']) {
      expect(bodyLimitFor(path)).toBe('50mb');
    }
    expect(LARGE_PAYLOAD_PREFIXES).toContain('/api/evaluations');
  });

  it('keeps the smaller default for everything else', () => {
    for (const path of ['/api/projects', '/api/suites', '/api/comparisons', '/api/public/leaderboards', '/api/configs']) {
      expect(bodyLimitFor(path)).toBe('1mb');
    }
  });

  it('is large enough for a result at the schema\'s own size limit', () => {
    // about 1.4 MB of numbers: over the old 1 MB default, under what the schema accepts. A few hundred thousand
    // entries in one array is also what once overflowed the stack in the depth check.
    const results = { curve: Array.from({ length: 700_000 }, () => 1) };
    const text = JSON.stringify({ projectId: 'p', results });
    expect(text.length).toBeGreaterThan(1024 * 1024);
    expect(evaluationBodySchema.safeParse(JSON.parse(text)).success).toBe(true);
  });

  it('applies the limit to a real request: a 1.5 MB body reaches an ingestion route and is refused elsewhere', async () => {
    const app = express();
    app.use(jsonBody);
    app.post('/api/evaluations', (req, res) => res.json({ bytes: JSON.stringify(req.body).length }));
    app.post('/api/projects', (req, res) => res.json({ ok: true }));
    app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({}));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const body = JSON.stringify({ results: { curve: Array.from({ length: 750_000 }, () => 1) } });
      expect(body.length).toBeGreaterThan(1024 * 1024);
      const post = (path: string) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      expect((await post('/api/evaluations')).status).toBe(200);
      expect((await post('/api/projects')).status).toBe(413);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
