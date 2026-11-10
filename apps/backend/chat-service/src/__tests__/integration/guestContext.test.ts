import { type Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { vi } from 'vitest';
import { createApp } from '../../app';
import { AdminPolicy } from '../../models/AdminPolicy';
import { Assistant } from '../../models/Assistant';
import { defaultPolicy } from '../../services/adminPolicy';
import { forgetPlatformAssistant } from '../../services/assistantProfiles';
import { clearPublicCatalogue } from '../../services/guestCatalogue';
import { GUEST_CONTEXT_BYTES, guestContext } from '../../services/guestContext';

/** What a guest question is answered from, and who the visitor is told they are talking to. */
describe('guest context', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const realFetch = globalThis.fetch;
  const project = '111111111111111111111111';
  let publicVisible = true;
  const signal = () => AbortSignal.timeout(5000);

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CORS_ORIGIN: 'https://app.example.test',
      GUEST_NETWORK_SECRET: 'guest-secret-with-at-least-thirty-two-characters',
      GUEST_TRUSTED_PROXY: 'loopback',
      TURNSTILE_SITE_KEY: 'test-site',
      TURNSTILE_SECRET_KEY: 'test-secret',
      VISION_SERVICE_URL: 'http://vision.invalid'
    });
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = createApp();
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/chat/guest`;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    publicVisible = true;
    clearPublicCatalogue();
    forgetPlatformAssistant();
    await Promise.all([
      AdminPolicy.deleteMany({}),
      Assistant.deleteMany({}),
      mongoose.connection.collection('users').deleteMany({})
    ]);
    await AdminPolicy.create({ _id: 'global', settings: { ...defaultPolicy, guestEnabled: true, guestDailyBudgetMicros: 1, guestMonthlyBudgetMicros: 1 } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.startsWith('http://vision.invalid/api/public/projects')) {
          // Like vision's text search: whole words only.
          const search = new URL(href).searchParams.get('search');
          const cards = [{ id: project, name: 'Public research' }];
          return new Response(JSON.stringify({ data: { projects: search && search !== 'public' ? [] : cards } }));
        }
        if (href.startsWith('http://vision.invalid/api/projects/'))
          return new Response(
            JSON.stringify({
              data: {
                _id: project,
                visibility: publicVisible ? 'public' : 'private',
                name: 'Public research',
                description: 'Recorded public project context. '.repeat(40)
              }
            })
          );
        return realFetch(url, init);
      })
    );
  });

  it('is the project the visitor is looking at, when there is one', async () => {
    const found = await guestContext({ question: 'What does it study?', projectId: project, signal: signal() });
    expect(found.projects.map((p) => p.id)).toEqual([project]);
    expect(JSON.parse(found.text)).toMatchObject({ found: 'page', projects: [{ name: 'Public research' }] });
  });

  it('is found by searching public projects for the question when there is none', async () => {
    const found = await guestContext({ question: 'public', signal: signal() });
    expect(JSON.parse(found.text)).toMatchObject({ found: 'search', projects: [{ id: project, name: 'Public research' }] });
  });

  it('is nothing, said plainly, when no public project matches; a private match is left out', async () => {
    expect(JSON.parse((await guestContext({ question: 'zebra crossings', signal: signal() })).text)).toEqual({
      found: 'search',
      projects: []
    });
    publicVisible = false;
    expect((await guestContext({ question: 'public', signal: signal() })).projects).toEqual([]);
  });

  it('refuses a private page project outright', async () => {
    publicVisible = false;
    await expect(guestContext({ question: 'Anything?', projectId: project, signal: signal() })).rejects.toThrow(
      'Only public projects'
    );
  });

  it('fits within the request budget, shortening descriptions rather than refusing', async () => {
    const question = 'x'.repeat(4000);
    const found = await guestContext({ question, projectId: project, signal: signal() });
    expect(Buffer.byteLength(found.text + question)).toBeLessThanOrEqual(GUEST_CONTEXT_BYTES);
    expect(found.projects[0].name).toBe('Public research');
    expect(found.projects[0].description.length).toBeLessThan(400);
  });

  it('refuses only a question so long that not even the project names fit', async () => {
    await expect(guestContext({ question: 'x'.repeat(4490), projectId: project, signal: signal() })).rejects.toThrow(
      'Ask a shorter question'
    );
  });

  it('tells visitors who they are talking to, and links her page only while it is public', async () => {
    const assistant = await Assistant.create({ name: 'Vivi', createdBy: 'admin', published: true, platformDefault: true });
    const identity = await mongoose.connection.collection('users').insertOne({
      kind: 'assistant',
      assistantId: assistant.id,
      handle: 'vivi',
      firstName: 'Vivi',
      profilePublic: true,
      picture: 'https://auth.example.test/auth/avatars/vivi'
    });
    const shown = (await (await realFetch(`${base}/capabilities`)).json()) as { data: { enabled: boolean; assistant?: unknown } };
    expect(shown.data.assistant).toEqual({ name: 'Vivi', picture: 'https://auth.example.test/auth/avatars/vivi', handle: 'vivi' });
    await mongoose.connection.collection('users').updateOne({ _id: identity.insertedId }, { $set: { profilePublic: false } });
    forgetPlatformAssistant();
    const hidden = (await (await realFetch(`${base}/capabilities`)).json()) as { data: { assistant?: unknown } };
    expect(hidden.data.assistant).toEqual({ name: 'Vivi', picture: 'https://auth.example.test/auth/avatars/vivi' });
  });

  it('says nothing about an assistant that is paused or not published', async () => {
    await Assistant.create({ name: 'Vivi', createdBy: 'admin', published: true, paused: true, platformDefault: true });
    const shown = (await (await realFetch(`${base}/capabilities`)).json()) as { data: { assistant?: unknown } };
    expect(shown.data.assistant).toBeUndefined();
  });
});
