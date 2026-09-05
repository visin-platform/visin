jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  verifyApiKey: jest.fn(),
  verifyAccessToken: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { verifyAccessToken, verifyApiKey } from '@visin/backend-core';
import { createApp } from '../app';

const verify = verifyApiKey as unknown as jest.Mock;
const verifyToken = verifyAccessToken as unknown as jest.Mock;

const KEY = 'vsn_live_0123456789ab_a-secret-value-long-enough';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.MCP_PUBLIC_URL = 'https://mcp.visin.eu';
  process.env.AUTH_SERVICE_URL = 'https://auth-api.visin.eu';
  verify.mockResolvedValue({
    ok: true,
    userId: 'u1',
    keyId: 'doc-1',
    label: 'Claude Code',
    scopes: ['vision:read']
  });
  verifyToken.mockReturnValue({
    ok: true,
    userId: 'u1',
    scopes: ['vision:read'],
    clientId: 'vsn-client-abc',
    clientName: 'Claude'
  });
});

/**
 * One JSON-RPC call over the streamable-HTTP transport.
 *
 * The transport may answer as SSE, so the body is unwrapped either way — this
 * is what a real MCP client does, and testing against the actual transport
 * rather than a stub is the only way the empty-listings handlers get exercised.
 */
async function rpc(method: string, params: unknown = {}, token: string | null = KEY) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });

  const text = await response.text();
  if (!text) return { response, body: undefined };

  const payload = text.startsWith('event:') || text.startsWith('data:')
    ? text
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim()
    : text;

  return { response, body: payload ? JSON.parse(payload) : undefined };
}

describe('the pages that are not the protocol', () => {
  it('answers the root with what this server is and where its endpoint is', async () => {
    // The first thing anyone types when checking the service is up; Express's
    // default HTML error page answers that badly.
    const body = await (await fetch(baseUrl)).json();

    expect(body).toMatchObject({
      name: 'visin',
      endpoint: 'https://mcp.visin.eu/mcp',
      transport: 'streamable-http'
    });
  });

  it('answers a liveness probe', async () => {
    expect(await (await fetch(`${baseUrl}/health/live`)).json()).toEqual({
      status: 'ok',
      service: 'mcp-service'
    });
  });

  it('advertises only the scopes some module can actually serve', async () => {
    // A consent screen offering `label:read` when no label tools exist asks
    // someone to grant access that buys them nothing.
    const body = (await (
      await fetch(`${baseUrl}/.well-known/oauth-protected-resource`)
    ).json()) as { scopes_supported: string[] };

    expect(body).toMatchObject({
      resource: 'https://mcp.visin.eu',
      authorization_servers: ['https://auth-api.visin.eu'],
      bearer_methods_supported: ['header']
    });
    expect([...body.scopes_supported].sort()).toEqual([
      'dataset:read',
      'vision:read',
      'vision:write'
    ]);
  });

  it('answers a wrong path with JSON, not an HTML error page', async () => {
    const response = await fetch(`${baseUrl}/nope`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'not_found' });
  });
});

describe('authentication', () => {
  it('points an unauthenticated client at the metadata that says how to authenticate', async () => {
    // A bare 401 leaves a spec-compliant client with nowhere to go.
    const { response, body } = await rpc('tools/list', {}, null);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://mcp.visin.eu/.well-known/oauth-protected-resource"'
    );
    expect(body.error.message).toContain('API key');
  });

  it('refuses a key the database rejected, saying nothing about why', async () => {
    verify.mockResolvedValue({ ok: false, rejection: 'revoked' });

    const { response, body } = await rpc('tools/list');

    expect(response.status).toBe(401);
    expect(body.error.message).toBe('Invalid or expired credentials.');
    expect(JSON.stringify(body)).not.toContain('revoked');
  });

  it('accepts an OAuth access token, granted through the consent screen', async () => {
    const { response, body } = await rpc('tools/list', {}, 'header.payload.signature');

    expect(response.status).toBe(200);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toContain('list_projects');
    expect(verifyToken).toHaveBeenCalledWith('header.payload.signature', 'https://mcp.visin.eu');
  });

  it('routes by prefix, so a JWT never costs a database lookup', async () => {
    await rpc('tools/list', {}, 'header.payload.signature');
    expect(verify).not.toHaveBeenCalled();

    jest.clearAllMocks();
    verify.mockResolvedValue({ ok: true, userId: 'u1', scopes: ['vision:read'] });
    await rpc('tools/list');
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('refuses an expired access token the same way as a bad key', async () => {
    // The prefix decides the path, so an expired token is never reported as a
    // malformed API key — but the client is told the same thing either way.
    verifyToken.mockReturnValue({ ok: false, rejection: 'expired' });

    const { response, body } = await rpc('tools/list', {}, 'header.payload.signature');

    expect(response.status).toBe(401);
    // Exactly the generic message: the rejection reason stays in the log.
    expect(body.error.message).toBe('Invalid or expired credentials.');
  });

  it('refuses a token minted for a different resource, without saying so', async () => {
    // RFC 8707 audience binding, enforced in verifyAccessToken — a token
    // obtained for another MCP server must not be replayable here. Telling the
    // caller *which* check failed would help someone probing.
    verifyToken.mockReturnValue({ ok: false, rejection: 'wrong-audience' });

    const { response, body } = await rpc('tools/list', {}, 'header.payload.signature');

    expect(response.status).toBe(401);
    expect(JSON.stringify(body)).not.toContain('audience');
  });
});

describe('the protocol', () => {
  it('hands the model the server instructions on initialize', async () => {
    const { body } = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' }
    });

    expect(body.result.serverInfo.name).toBe('visin');
    // The limits are the part worth stating: a model that does not know one
    // will look for a way around it.
    expect(body.result.instructions).toContain('does not make them');
    expect(body.result.instructions).toContain('no way to look at an image');
  });

  it('builds the tool surface from the key, so a read-only key sees no write tool', async () => {
    const { body } = await rpc('tools/list');
    const names = body.result.tools.map((tool: { name: string }) => tool.name);

    expect(names).toContain('get_training_curve');
    expect(names).not.toContain('update_training');
    expect(names).not.toContain('list_datasets');
  });

  it('shows the write and dataset tools to a key that carries those scopes', async () => {
    verify.mockResolvedValue({
      ok: true,
      userId: 'u1',
      keyId: 'doc-1',
      scopes: ['vision:read', 'vision:write', 'dataset:read']
    });

    const { body } = await rpc('tools/list');
    const names = body.result.tools.map((tool: { name: string }) => tool.name);

    expect(names).toContain('update_training');
    expect(names).toContain('list_datasets');
  });

  it('shows no tools at all to a key with no scopes', async () => {
    verify.mockResolvedValue({ ok: true, userId: 'u1', keyId: 'doc-1', scopes: [] });

    const { body } = await rpc('tools/list');

    expect(body.result.tools).toEqual([]);
  });

  it.each([
    ['resources/list', 'resources'],
    ['resources/templates/list', 'resourceTemplates'],
    ['prompts/list', 'prompts']
  ])('answers %s with an empty list rather than "Method not found"', async (method, field) => {
    // Claude's connector calls these during discovery and reads an error as a
    // broken server — reporting no tools for one whose tools listed perfectly.
    const { body } = await rpc(method);

    expect(body.error).toBeUndefined();
    expect(body.result[field]).toEqual([]);
  });
});

/**
 * An MCP server is called by assistants nobody enumerated in advance, and a
 * browser-based one gets nowhere without these.
 */
describe('cross-origin access', () => {
  it('lets any origin call the MCP endpoint', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Origin: 'https://claude.ai',
        Authorization: `Bearer ${KEY}`
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('exposes WWW-Authenticate, without which OAuth discovery cannot start', async () => {
    // Browser JavaScript cannot read that header on the 401 unless it is
    // exposed — so the client never finds the protected-resource metadata it
    // points at, and has no way to learn where to authenticate.
    const { response } = await rpc('tools/list', {}, null);

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata');
    expect(response.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
  });

  it('answers a preflight rather than letting it fall through to the 404', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://claude.ai',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, authorization'
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    // The transport's own header, or a browser client cannot hold a session.
    expect(response.headers.get('access-control-allow-headers')).toContain('Mcp-Session-Id');
  });

  it('serves the protected-resource metadata cross-origin', async () => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`, {
      headers: { Origin: 'https://claude.ai' }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('never allows credentials, which is what keeps the wildcard legal', async () => {
    const response = await fetch(baseUrl, { headers: { Origin: 'https://claude.ai' } });

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
