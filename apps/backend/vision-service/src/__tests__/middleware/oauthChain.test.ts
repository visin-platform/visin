import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';

/**
 * The chain, not the parts.
 *
 * vision-service stacks three credential middlewares: apiTokenMiddleware
 * globally, then apiKeyAuth per route group, then each route's own
 * optionalAuth/authenticateToken. An OAuth access token has to survive all
 * three and arrive as a user with an `id` — the bug was that it reached
 * optionalAuth instead, verified fine, and left `req.user.id` undefined so
 * every private project vanished from the caller's own listing.
 */
import { apiKeyAuth, mintAccessToken, optionalAuth } from '@visin/backend-core';
import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';

jest.mock('../../models/ApiToken', () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockResolvedValue(null), updateOne: jest.fn() },
}));

const SECRET = 'test-secret';
const RESOURCE = 'https://mcp.visin.eu';

const app = express();
app.use(apiTokenMiddleware);
app.use('/api/projects', apiKeyAuth('vision'), optionalAuth, (req, res) => {
  res.json({ userId: req.user?.id ?? null, scopes: req.apiKey?.scopes ?? null });
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

const get = async (auth?: string) => {
  const response = await fetch(`${baseUrl}/api/projects`, {
    headers: auth ? { Authorization: auth } : {},
  });
  return { status: response.status, body: await response.json() as { userId: string | null; scopes: string[] | null } };
};

const token = (scopes: Parameters<typeof mintAccessToken>[0]['scopes']) =>
  mintAccessToken({
    userId: '68987cf71078a6d4d52ba430',
    email: 'a@b.com',
    name: 'A B',
    resource: RESOURCE,
    issuer: 'https://auth-api.visin.eu',
    scopes,
    clientId: 'vsn-client-abc',
    clientName: 'Claude',
  }).accessToken;

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  process.env.MCP_PUBLIC_URL = RESOURCE;
});

describe('an OAuth access token through the whole chain', () => {
  it('arrives as a user with an id, so owner-scoped queries are scoped', async () => {
    const res = await get(`Bearer ${token(['vision:read'])}`);

    expect(res.status).toBe(200);
    // The bug: this was null, and listProjects then returned public projects only.
    expect(res.body.userId).toBe('68987cf71078a6d4d52ba430');
    expect(res.body.scopes).toEqual(['vision:read']);
  });

  it('is not mistaken for a project token on the way past apiTokenMiddleware', async () => {
    // That middleware types a credential by "contains no dot"; a JWT has two.
    const res = await get(`Bearer ${token(['vision:read'])}`);

    expect(res.body.userId).not.toBeNull();
  });

  it('still lets an anonymous request through as anonymous', async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });
});
