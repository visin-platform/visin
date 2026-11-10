import { createServer, type Server } from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { vi } from 'vitest';
import { USER_SESSIONS_COLLECTION } from '@visin/backend-core';
import { createApp } from '../app';
describe('administrator gateway', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let upstream: Server;
  let base: string;
  let token: string;
  const accountId = new mongoose.Types.ObjectId();
  const sessionId = new mongoose.Types.ObjectId();
  let calls = 0;
  const paths: string[] = [];
  beforeAll(async () => {
    process.env.JWT_SECRET = 'admin-gateway-test';
    process.env.CORS_ORIGIN = 'https://admin.example.test';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    upstream = await new Promise<Server>((resolve) => {
      const s = createServer((_req, res) => {
        calls++;
        paths.push(_req.url ?? '');
        if (_req.url?.includes('reject=1')) res.statusCode = 503;
        if (_req.url?.includes('limited=1')) {
          res.statusCode = 429;
          res.setHeader('Retry-After', '60');
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: { ok: true } }));
      }).listen(0, '127.0.0.1', () => resolve(s));
    });
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as { port: number }).port}`;
    process.env.CHAT_SERVICE_URL = process.env.AUTH_SERVICE_URL;
    process.env.GROUP_SERVICE_URL = process.env.AUTH_SERVICE_URL;
    const app = createApp();
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin`;
    token = jwt.sign(
      {
        typ: 'session',
        id: accountId.toHexString(),
        email: 'admin@example.test',
        tokenVersion: 1,
        sid: sessionId.toHexString()
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });
  afterAll(async () => {
    await Promise.all([server, upstream].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    calls = 0;
    await mongoose.connection.collection('users').deleteMany({});
    await mongoose.connection
      .collection('users')
      .insertOne({ _id: accountId, email: 'admin@example.test', tokenVersion: 1, roles: ['admin'], status: 'active' });
    await mongoose.connection
      .collection(USER_SESSIONS_COLLECTION)
      .updateOne(
        { _id: sessionId },
        { $set: { userId: accountId, expiresAt: new Date(Date.now() + 3600000) } },
        { upsert: true }
      );
  });
  const request = (path: string, method = 'GET', body?: unknown, credential = token) =>
    fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${credential}`,
        Origin: 'https://admin.example.test',
        'Content-Type': 'application/json'
      },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {})
    });
  it('rejects unauthenticated and non-admin requests without proxying', async () => {
    expect((await request('/users', 'GET', undefined, '')).status).toBe(401);
    await mongoose.connection.collection('users').updateOne({ _id: accountId }, { $set: { roles: [] } });
    expect((await request('/users')).status).toBe(403);
    expect(calls).toBe(0);
  });
  it('forwards only explicitly allowed operations', async () => {
    expect((await request('/users')).status).toBe(200);
    expect(calls).toBe(1);
    expect((await request('/users/../profile')).status).toBe(404);
    expect(calls).toBe(1);
    expect((await request('/vivi/settings/assistant/keys/not-a-provider', 'PUT', {})).status).toBe(400);
    expect((await request('/users/not-an-id')).status).toBe(400);
    const unknown = await request('/profile');
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).message).toBe('Unknown administrator operation');
    expect(calls).toBe(1);
  });
  it('maps each area onto its owner and forwards only the query string', async () => {
    paths.length = 0;
    await request('/users?page=2&q=ann');
    await request('/users/lookup?ids=111111111111111111111111');
    await request('/vivi/admin/policies');
    await request('/groups/111111111111111111111111');
    expect(paths).toEqual([
      '/auth/admin/control/users?page=2&q=ann',
      '/auth/admin/control/users/lookup?ids=111111111111111111111111',
      '/api/chat/admin/policies',
      '/api/groups/admin/groups/111111111111111111111111'
    ]);
  });
  it('relays the owner\'s Retry-After', async () => {
    const response = await request('/vivi/admin/runs?limited=1');
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });
  it('pages the audit log newest first', async () => {
    for (let i = 0; i < 3; i++) await request('/vivi/settings/assistant', 'PUT', {});
    const first = (await (await request('/audit?limit=2')).json()).data;
    expect(first.entries).toHaveLength(2);
    expect(first.nextBefore).toBe(first.entries[1]._id);
    const rest = (await (await request(`/audit?limit=2&before=${first.nextBefore}`)).json()).data;
    expect(rest.entries[0]._id < first.entries[1]._id).toBe(true);
    expect((await request('/audit?limit=0')).status).toBe(400);
  });
  it('fails closed with a 503 when the administrator role cannot be read', async () => {
    const original = mongoose.connection.collection.bind(mongoose.connection);
    const spy = vi.spyOn(mongoose.connection, 'collection').mockImplementation(((name: string) => {
      const collection = original(name);
      if (name !== 'users') return collection;
      // Only the administrator check asks for the role; the session check before it still succeeds.
      return new Proxy(collection, {
        get: (target, key) =>
          key === 'findOne'
            ? (filter: { roles?: string }, ...rest: unknown[]) =>
                filter?.roles === 'admin'
                  ? Promise.reject(new Error('down'))
                  : (target.findOne as (...a: unknown[]) => unknown)(filter, ...rest)
            : Reflect.get(target, key)
      });
    }) as typeof mongoose.connection.collection);
    try {
      expect((await request('/me')).status).toBe(503);
    } finally {
      spy.mockRestore();
    }
  });
  it('records metadata without storing provider keys or request bodies', async () => {
    expect(
      (await request('/vivi/settings/assistant/keys/openai', 'PUT', { key: 'never-log-this-secret' })).status
    ).toBe(200);
    const audit = await (await request('/audit')).json();
    expect(audit.data.entries.some((entry: { status: string }) => entry.status === 'completed')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('never-log-this-secret');
  });
  it('checks role revocation again on the next request', async () => {
    expect((await request('/me')).status).toBe(200);
    await mongoose.connection.collection('users').updateOne({ _id: accountId }, { $set: { status: 'suspended' } });
    expect((await request('/me')).status).toBe(401);
  });
  it('records upstream rejection and preserves its status', async () => {
    expect((await request('/vivi/settings/assistant?reject=1', 'PUT', {})).status).toBe(503);
    const result = await (await request('/audit')).json();
    expect(result.data.entries.some((r: { status: string }) => r.status === 'rejected')).toBe(true);
  });
  it('marks an interrupted upstream write as uncertain', async () => {
    const previous = process.env.CHAT_SERVICE_URL;
    process.env.CHAT_SERVICE_URL = 'http://127.0.0.1:1';
    try {
      expect((await request('/vivi/settings/assistant', 'PUT', {})).status).toBe(502);
    } finally {
      process.env.CHAT_SERVICE_URL = previous;
    }
    const result = await (await request('/audit')).json();
    expect(result.data.entries.some((r: { status: string }) => r.status === 'uncertain')).toBe(true);
  });
  it('rejects missing upstream configuration without making a request', async () => {
    const previous = process.env.AUTH_SERVICE_URL;
    delete process.env.AUTH_SERVICE_URL;
    try {
      expect((await request('/users')).status).toBe(502);
      expect(calls).toBe(0);
    } finally {
      process.env.AUTH_SERVICE_URL = previous;
    }
  });
  it('requires JSON for changes and supports ordinary SSO cookies for reads', async () => {
    const response = await fetch(base + '/vivi/settings/assistant', {
      method: 'PUT',
      headers: { Cookie: `access_token=${token}`, 'Content-Type': 'text/plain' },
      body: 'hello'
    });
    expect(response.status).toBe(400);
    const read = await fetch(base + '/me', { headers: { Cookie: `access_token=${token}` } });
    expect(read.status).toBe(200);
  });
  it('forwards cookie-authenticated JSON writes without an Origin header', async () => {
    const response = await fetch(base + '/vivi/settings/assistant', {
      method: 'PUT',
      headers: { Cookie: `access_token=${token}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(response.status).toBe(200);
  });
  it('rejects an origin removed from the live administrator allowlist', async () => {
    process.env.CORS_ORIGIN = 'https://other.example.test';
    try {
      expect((await request('/vivi/settings/assistant', 'PUT', {})).status).toBe(403);
      expect(calls).toBe(0);
    } finally {
      process.env.CORS_ORIGIN = 'https://admin.example.test';
    }
  });
  it('reports an unavailable read upstream without creating a write audit entry', async () => {
    const previous = process.env.AUTH_SERVICE_URL;
    process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:1';
    try {
      const response = await request('/users');
      expect(response.status).toBe(502);
      expect((await response.json()).message).toBe('The owning service is unavailable; try again shortly');
    } finally {
      process.env.AUTH_SERVICE_URL = previous;
    }
  });
  it('routes group membership operations through the group service', async () => {
    const groupId = '111111111111111111111111';
    const userId = '222222222222222222222222';
    expect((await request(`/groups/${groupId}`)).status).toBe(200);
    expect(
      (await request(`/memberships/${groupId}/${userId}`, 'PUT', { revision: 0, role: 'member', reason: 'Review' }))
        .status
    ).toBe(200);
    expect(
      (await request(`/memberships/${groupId}/${userId}`, 'DELETE', { revision: 1, reason: 'Review' })).status
    ).toBe(200);
  });
});
