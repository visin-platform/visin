import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { createResponseChecker, loadSpec } from '@visin/backend-core/openapi-testing';
import { API_ROUTE_GROUPS } from '../../routes/apiRoutes';

const { operationKey, responseProblems } = createResponseChecker(loadSpec(path.join(__dirname, '../../../docs')));

/**
 * auth-service's flows against the real routes and an in-memory MongoDB, with
 * every response checked against docs/openapi.yml: the first account, signing
 * in, sessions, API keys, and an assistant connecting over OAuth with PKCE.
 */
describe('auth-service responses match docs/openapi.yml', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const previous = { ...process.env };
  const seen = new Set<string>();
  /** Every mismatch in a test, reported together at its end rather than one at a time. */
  const problems: string[] = [];

  /** A request, its response checked against the spec before the test sees it. */
  const call = async (
    method: string,
    url: string,
    { auth, json, form }: { auth?: string; json?: unknown; form?: Record<string, string | string[]> } = {}
  ) => {
    const headers: Record<string, string> = auth ? { authorization: `Bearer ${auth}` } : {};
    let body: string | undefined;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(form)) for (const one of [value].flat()) params.append(key, one);
      body = params.toString();
    }
    const response = await fetch(`${base}${url}`, { method, headers, body, redirect: 'manual' });
    const text = await response.text();
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const parsed = isJson && text ? JSON.parse(text) : undefined;
    const key = operationKey(method, url);
    if (key) seen.add(key);
    problems.push(...responseProblems({ method, url, status: response.status, body: parsed }));
    return { status: response.status, body: parsed, text, location: response.headers.get('location') };
  };

  let session: string;
  let keyId: string;

  beforeAll(async () => {
    Object.assign(process.env, {
      JWT_SECRET: 'auth-contract-secret',
      INTERNAL_SERVICE_TOKEN: 'auth-contract-internal',
      API_KEY_ENCRYPTION_SECRET: 'auth-contract-key-secret',
      // Issuer, resource and sign-in page come from configuration, as a deployment's must.
      AUTH_SERVICE_PUBLIC_URL: 'https://auth-api.example.test',
      MCP_PUBLIC_URL: 'https://mcp.example.test',
      AUTH_FRONT_URL: 'https://auth.example.test'
    });
    delete process.env.GROUP_SERVICE_URL;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    const app = express();
    app.use(express.json(), cookieParser());
    for (const { path: mountPath, router } of API_ROUTE_GROUPS) app.use(mountPath, router);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  afterEach(() => {
    expect(problems.splice(0)).toEqual([]);
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo?.stop();
    process.env = previous;
  });

  it('sets up the first account and signs in', async () => {
    expect((await call('GET', '/auth/setup-status')).body.needsSetup).toBe(true);
    const created = await call('POST', '/auth/setup', {
      json: { email: 'owner@example.test', password: 'correct horse battery staple', firstName: 'Ada' }
    });
    expect(created.status).toBe(201);

    const signedIn = await call('POST', '/auth/login', {
      json: { email: 'owner@example.test', password: 'correct horse battery staple' }
    });
    expect(signedIn.status).toBe(200);
    session = signedIn.body.token;

    await call('GET', '/auth/verify', { auth: session });
    await call('POST', '/auth/refresh', { auth: session });
    await call('GET', '/auth/profile', { auth: session });
    await call('PUT', '/auth/profile', { auth: session, json: { lastName: 'Lovelace' } });
    const sessions = await call('GET', '/auth/sessions', { auth: session });
    expect(sessions.body.data[0].current).toBe(true);
    await call('POST', '/auth/sessions/revoke-others', { auth: session });
  });

  it('creates, lists, shows again, revokes and deletes an API key', async () => {
    const created = await call('POST', '/auth/api-keys', {
      auth: session,
      json: { name: 'nightly job', scopes: ['vision:read'], expiresInDays: 30 }
    });
    expect(created.status).toBe(201);
    expect(created.body.data.token).toMatch(/^vsn_live_/);
    keyId = created.body.data.key.id;

    await call('GET', '/auth/api-keys', { auth: session });
    expect((await call('POST', `/auth/api-keys/${keyId}/reveal`, { auth: session })).body.data.token).toBe(
      created.body.data.token
    );
    await call('POST', `/auth/api-keys/${keyId}/revoke`, { auth: session });
    await call('DELETE', `/auth/api-keys/${keyId}`, { auth: session });
    await call('GET', '/auth/tool-usage?days=7', { auth: session });
    await call('GET', '/auth/tool-calls?limit=10', { auth: session });
  });

  it('connects an assistant over OAuth: register, consent, code, token, refresh, disconnect', async () => {
    const metadata = await call('GET', '/.well-known/oauth-authorization-server');
    expect(metadata.body.token_endpoint).toBe('https://auth-api.example.test/oauth/token');

    const redirectUri = 'http://localhost:6274/oauth/callback';
    const client = await call('POST', '/oauth/register', {
      json: { client_name: 'Contract assistant', redirect_uris: [redirectUri] }
    });
    expect(client.status).toBe(201);
    const clientId = client.body.client_id;

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'vision:read analysis:write',
      state: 'xyz',
      resource: 'https://mcp.example.test'
    });
    const signedOut = await call('GET', `/oauth/authorize?${query}`);
    expect(signedOut.status).toBe(302);
    const consentPage = await call('GET', `/oauth/authorize?${query}`, { auth: session });
    expect(consentPage.status).toBe(200);
    const hidden = Object.fromEntries(
      [...consentPage.text.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(([, name, value]) => [
        name,
        value.replace(/&amp;/g, '&')
      ])
    );

    const approved = await call('POST', '/oauth/authorize', {
      auth: session,
      form: { ...hidden, decision: 'approve', scope: ['vision:read'] }
    });
    expect(approved.status).toBe(302);
    const code = new URL(approved.location!).searchParams.get('code')!;
    expect(code).toBeTruthy();

    const tokens = await call('POST', '/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier
      }
    });
    expect(tokens.body.scope).toBe('vision:read');
    const refreshed = await call('POST', '/oauth/token', {
      form: { grant_type: 'refresh_token', refresh_token: tokens.body.refresh_token, client_id: clientId }
    });
    expect(refreshed.status).toBe(200);

    expect((await call('GET', '/oauth/connections', { auth: session })).body.data).toHaveLength(1);
    await call('DELETE', `/oauth/connections/${clientId}`, { auth: session });
  });

  it('answers the mistakes a client makes as documented', async () => {
    expect(
      (await call('POST', '/auth/login', { json: { email: 'owner@example.test', password: 'wrong' } })).status
    ).toBe(401);
    expect((await call('POST', '/auth/login', { json: { email: 'not-an-email', password: 'x' } })).status).toBe(400);
    expect(
      (
        await call('POST', '/auth/setup', {
          json: { email: 'second@example.test', password: 'another long passphrase' }
        })
      ).status
    ).toBe(409);
    expect((await call('GET', '/auth/api-keys')).status).toBe(401);
    expect((await call('POST', '/auth/api-keys', { auth: session, json: { name: 'none', scopes: [] } })).status).toBe(
      400
    );
    expect((await call('POST', `/auth/api-keys/${keyId}/reveal`, { auth: session })).status).toBe(404);
    expect(
      (await call('POST', '/oauth/register', { json: { redirect_uris: ['http://evil.example.test/cb'] } })).status
    ).toBe(400);
    expect(
      (
        await call('POST', '/oauth/token', {
          form: {
            grant_type: 'authorization_code',
            client_id: 'x',
            code: 'nope',
            redirect_uri: 'http://localhost/cb',
            code_verifier: 'v'
          }
        })
      ).status
    ).toBe(400);
    expect((await call('DELETE', '/oauth/connections/none', { auth: session })).status).toBe(404);
    expect((await call('DELETE', '/auth/sessions/not-an-id', { auth: session })).status).toBe(400);
    expect((await call('POST', '/auth/logout', { auth: session })).status).toBe(200);
  });

  it('covered the public API', () => {
    const publicApi = [
      'GET /.well-known/oauth-authorization-server',
      'POST /oauth/register',
      'GET /oauth/authorize',
      'POST /oauth/authorize',
      'POST /oauth/token',
      'GET /oauth/connections',
      'DELETE /oauth/connections/{clientId}',
      'POST /auth/api-keys',
      'GET /auth/api-keys',
      'POST /auth/api-keys/{id}/reveal',
      'POST /auth/api-keys/{id}/revoke',
      'DELETE /auth/api-keys/{id}',
      'GET /auth/tool-usage',
      'GET /auth/tool-calls'
    ];
    expect(publicApi.filter((operation) => !seen.has(operation))).toEqual([]);
  });
});
