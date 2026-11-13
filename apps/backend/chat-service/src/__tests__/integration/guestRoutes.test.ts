import { type Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { vi } from 'vitest';
import { createApp } from '../../app';
import { AdminPolicy } from '../../models/AdminPolicy';
import { Settings } from '../../models/Settings';
import { GuestRun } from '../../models/GuestRun';
import { ProviderUsage } from '../../models/ProviderUsage';
import { Pricing } from '../../models/Pricing';
import { saveProviderKey } from '../../services/keys';
import { ADAPTERS } from '../../services/providers';
import { resetAssistantSettingsCache } from '../../services/settings';
import { defaultPolicy } from '../../services/adminPolicy';
import { clearPublicCatalogue } from '../../services/guestCatalogue';
import { GUEST_REQUEST_BYTES } from '../../services/guestContext';
describe('anonymous public project questions', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  let cookie: string;
  const realFetch = globalThis.fetch;
  const project = '111111111111111111111111';
  let publicVisible = true;
  let visionDown = false;
  let turnstileBroken = false;
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      CORS_ORIGIN: 'https://app.example.test',
      API_KEY_ENCRYPTION_SECRET: 'guest-test-encryption-secret',
      GUEST_NETWORK_SECRET: 'guest-secret-with-at-least-thirty-two-characters',
      GUEST_TRUSTED_PROXY: 'loopback',
      TURNSTILE_SITE_KEY: 'test-site',
      TURNSTILE_SECRET_KEY: 'test-secret',
      VISION_SERVICE_URL: 'http://vision.invalid'
    });
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await GuestRun.init();
    const app = createApp();
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/chat/guest`;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    publicVisible = true;
    visionDown = false;
    turnstileBroken = false;
    clearPublicCatalogue();
    await Promise.all([
      AdminPolicy.deleteMany({}),
      GuestRun.deleteMany({}),
      ProviderUsage.deleteMany({}),
      Settings.deleteMany({}),
      Pricing.deleteMany({}),
      mongoose.connection.collection('chat_guest_budgets').deleteMany({})
    ]);
    await AdminPolicy.create({
      _id: 'global',
      settings: {
        ...defaultPolicy,
        guestEnabled: true,
        guestDailyBudgetMicros: 1000000,
        guestMonthlyBudgetMicros: 5000000
      }
    });
    await Settings.create({ _id: 'assistant', enabled: true, provider: 'anthropic', model: 'test-model' });
    await Pricing.create({
      _id: 'pricing',
      currency: 'USD',
      entries: [{ provider: 'anthropic', model: 'test-model', inputPerMillion: 1, outputPerMillion: 2 }]
    });
    resetAssistantSettingsCache();
    await saveProviderKey('anthropic', 'guest-test-provider-key', 'admin');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (visionDown && String(url).startsWith('http://vision.invalid/'))
          return new Response('<html>Bad gateway</html>', { status: 502 });
        if (turnstileBroken && String(url).startsWith('https://challenges.cloudflare.com/'))
          return new Response('<html>oops</html>', { status: 500 });
        if (String(url).startsWith('https://challenges.cloudflare.com/'))
          return new Response(JSON.stringify({ success: true, hostname: 'app.example.test', action: 'vivi-guest' }));
        if (String(url).startsWith('http://vision.invalid/api/public/projects')) {
          // Like vision's text search: whole words only.
          const search = new URL(String(url)).searchParams.get('search');
          const cards = [
            { id: project, name: 'Public research', slug: 'public-research', owner: { id: 'x' } },
            { name: 'no id' }
          ];
          return new Response(JSON.stringify({ data: { projects: search && search !== 'public' ? [] : cards } }));
        }
        if (String(url).startsWith('http://vision.invalid/')) {
          // Correlation headers only: no session cookie, bearer token or internal credential reaches vision.
          const headers = new Headers(init?.headers);
          expect([...headers.keys()].filter((name) => !['x-request-id', 'traceparent'].includes(name))).toEqual([]);
          return new Response(
            JSON.stringify({
              data: {
                _id: project,
                visibility: publicVisible ? 'public' : 'private',
                name: 'Public research',
                description: 'Recorded public project context'
              }
            })
          );
        }
        return realFetch(url, init);
      })
    );
    vi.spyOn(ADAPTERS.anthropic, 'send').mockResolvedValue({
      text: 'This is a public research project.',
      calls: [],
      inputTokens: 100,
      outputTokens: 20,
      stop: 'done',
      assistant: {}
    });
    cookie = '';
    // From its own address each time: the limit on starting sessions is per address and spans this whole file.
    const response = await request('/session', 'POST', {}, '', `198.51.100.${++sessions}`);
    cookie = response.headers.get('set-cookie')!.split(';')[0];
  });
  let sessions = 0;
  const request = (path: string, method = 'GET', body?: unknown, session = cookie, ip?: string) =>
    realFetch(base + path, {
      method,
      headers: {
        Origin: 'https://app.example.test',
        'Content-Type': 'application/json',
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
        ...(session ? { Cookie: session } : {})
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) })
    });
  const question = (key = 'idempotency-key-0001') => ({
    question: 'Describe this project',
    projectId: project,
    idempotencyKey: key,
    challengeToken: 'verified-test-token'
  });
  async function finished(id: string) {
    for (let i = 0; i < 100; i++) {
      const row = await GuestRun.findById(id);
      if (row?.state === 'completed' || row?.state === 'failed') return row;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Guest run did not finish');
  }
  it('answers without private credentials, meters the call, and deduplicates submission retries', async () => {
    const response = await request('/questions', 'POST', question());
    expect(response.status).toBe(202);
    const result = (await response.json()) as { data: { runId: string } };
    expect((await finished(result.data.runId))?.state).toBe('completed');
    expect((await request('/questions', 'POST', question())).status).toBe(202);
    expect(ADAPTERS.anthropic.send).toHaveBeenCalledTimes(1);
    expect(await ProviderUsage.countDocuments({ state: 'completed', kind: 'guest' })).toBe(1);
    expect((await request(`/runs/${result.data.runId}`, 'GET', undefined, 'visin_guest=tampered')).status).toBe(403);
  });
  it('allows development questions without a bot check even when keys are configured', async () => {
    process.env.NODE_ENV = 'development';
    try {
      const capabilities = (await (await request('/capabilities')).json()) as {
        data: { enabled: boolean; siteKey: string; botCheckRequired: boolean };
      };
      expect(capabilities.data).toMatchObject({ enabled: true, siteKey: '', botCheckRequired: false });
      const { challengeToken: _token, ...body } = question();
      const response = await request('/questions', 'POST', body, cookie, '192.0.2.1');
      expect(response.status).toBe(202);
      const result = (await response.json()) as { data: { runId: string } };
      expect((await finished(result.data.runId))?.state).toBe('completed');
      expect(
        vi.mocked(globalThis.fetch).mock.calls.some(([url]) => String(url).includes('challenges.cloudflare.com'))
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });
  it('requires a verification token outside development', async () => {
    const { challengeToken: _token, ...body } = question();
    expect((await request('/questions', 'POST', body, cookie, '192.0.2.2')).status).toBe(403);
  });
  it('refuses private project context before provider execution', async () => {
    publicVisible = false;
    expect((await request('/questions', 'POST', question())).status).toBe(403);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
  });
  it('stops new questions immediately when guest access is disabled', async () => {
    await AdminPolicy.updateOne({ _id: 'global' }, { $set: { 'settings.guestEnabled': false } });
    expect((await request('/questions', 'POST', question())).status).toBe(503);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
  });
  it('says which limit refused a question, and when the daily ones return', async () => {
    await AdminPolicy.updateOne({ _id: 'global' }, { $set: { 'settings.guestSessionRequests': 0 } });
    const response = await request('/questions', 'POST', question());
    const body = (await response.json()) as { reason?: string; resetAt?: string };
    expect(response.status).toBe(429);
    expect(body.reason).toBe('session');
    expect(new Date(body.resetAt!).getTime()).toBeGreaterThan(Date.now());
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThanOrEqual(60);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
  });
  it('finds a public project from part of its name, and asks vision once a minute for the same search', async () => {
    const calls = () =>
      vi.mocked(globalThis.fetch).mock.calls.filter(([url]) => String(url).includes('/api/public/projects')).length;
    const found = (await (await request('/projects?q=Pub')).json()) as { data: { projects: { name: string }[] } };
    expect(found.data.projects.map((p) => p.name)).toEqual(['Public research']);
    const asked = calls();
    await request('/projects?q=pub');
    expect(calls()).toBe(asked);
    expect(
      ((await (await request('/projects?q=zzz')).json()) as { data: { projects: unknown[] } }).data.projects
    ).toEqual([]);
  });
  it('reports vision being down as unavailable, never as the project being private', async () => {
    visionDown = true;
    const response = await request('/questions', 'POST', question());
    expect(response.status).toBe(503);
    expect(((await response.json()) as { message: string }).message).not.toMatch(/not publicly available/);
    expect((await request('/projects?q=other')).status).toBe(503);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
  });
  it('treats a broken verification service as unavailable, not as the visitor failing it', async () => {
    turnstileBroken = true;
    const response = await request('/questions', 'POST', question());
    expect(response.status).toBe(503);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
  });
  it('lists public projects by name for a visitor to pick, and only while guest Vivi is on', async () => {
    const found = (await (await request('/projects?q=public')).json()) as { data: { projects: unknown[] } };
    expect(found.data.projects).toEqual([{ id: project, name: 'Public research', slug: 'public-research' }]);
    const fetched = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url));
    expect(fetched.some((url) => url.includes('/api/public/projects?limit=8&search=public'))).toBe(true);
    expect((await request('/projects?q=' + 'x'.repeat(101))).status).toBe(400);
    await AdminPolicy.updateOne({ _id: 'global' }, { $set: { 'settings.guestEnabled': false } });
    expect((await request('/projects')).status).toBe(503);
  });
  it('keeps the shared request cap effective for a fresh session', async () => {
    await AdminPolicy.updateOne({ _id: 'global' }, { $set: { 'settings.guestGlobalRequests': 1 } });
    const result = (await (await request('/questions', 'POST', question())).json()) as { data: { runId: string } };
    await finished(result.data.runId);
    const fresh = await request('/session', 'POST', {}, '');
    const other = fresh.headers.get('set-cookie')!.split(';')[0];
    expect((await request('/questions', 'POST', question('idempotency-key-0002'), other)).status).toBe(429);
    expect(ADAPTERS.anthropic.send).toHaveBeenCalledTimes(1);
  });
  it('retains reservations and reports uncertain provider failures without replay', async () => {
    vi.mocked(ADAPTERS.anthropic.send).mockRejectedValueOnce(new Error('provider disconnected'));
    const response = await request('/questions', 'POST', question());
    const result = (await response.json()) as { data: { runId: string } };
    expect((await finished(result.data.runId))?.state).toBe('failed');
    expect(await ProviderUsage.countDocuments({ state: 'uncertain' })).toBe(1);
    const budget = await mongoose.connection
      .collection('chat_guest_budgets')
      .findOne({ _id: new Date().toISOString().slice(0, 7) as never });
    expect(budget?.reservedMicros).toBeGreaterThan(0);
    await request('/questions', 'POST', question());
    expect(ADAPTERS.anthropic.send).toHaveBeenCalledTimes(1);
  });
  it('does not publish a result if the project becomes private during analysis', async () => {
    vi.mocked(ADAPTERS.anthropic.send).mockImplementationOnce(async () => {
      publicVisible = false;
      return { text: 'Do not publish', calls: [], inputTokens: 100, outputTokens: 10, stop: 'done', assistant: {} };
    });
    const result = (await (await request('/questions', 'POST', question())).json()) as { data: { runId: string } };
    const run = await finished(result.data.runId);
    expect(run?.state).toBe('failed');
    expect(run?.answer).toBeUndefined();
  });
  it('refuses unpriced models and missing sessions before provider work', async () => {
    expect((await request('/questions', 'POST', question(), '')).status).toBe(403);
    await Pricing.deleteMany({});
    expect((await request('/questions', 'POST', question())).status).toBe(503);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
  });
  it('requires verification in an allowed origin and a public project identifier', async () => {
    expect((await request('/questions', 'POST', { ...question(), projectId: '../../private' })).status).toBe(400);
    const response = await realFetch(base + '/questions', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(question())
    });
    expect(response.status).toBe(403);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
  });

  it('fits the longest multi-byte question, and a follow-up to it, within the bytes it reserved', async () => {
    // Its own address: the route's per-address limiter counts across this whole file.
    const visitor = '203.0.113.77';
    const within = () => {
      const sent = vi.mocked(ADAPTERS.anthropic.send).mock.calls.at(-1)![0];
      expect(sent.maxRequestBytes).toBe(GUEST_REQUEST_BYTES);
      expect(
        Buffer.byteLength(JSON.stringify({ model: sent.model, system: sent.system, messages: sent.messages }))
      ).toBeLessThanOrEqual(GUEST_REQUEST_BYTES);
      return (sent.messages[0] as { content: string }).content;
    };
    const first = (await (
      await request('/questions', 'POST', { ...question(), question: '汉'.repeat(2000) }, cookie, visitor)
    ).json()) as { data: { runId: string } };
    await finished(first.data.runId);
    expect(within()).not.toContain('"previous"');
    // The stored question is for the next answer, never shown back.
    expect(await (await request(`/runs/${first.data.runId}`)).text()).not.toContain('"question"');
    const second = (await (
      await request(
        '/questions',
        'POST',
        { ...question('idempotency-key-0002'), question: 'Tell me more about the first one' },
        cookie,
        visitor
      )
    ).json()) as { data: { runId: string } };
    await finished(second.data.runId);
    const content = within();
    expect(content).toContain('"previous":{"question":"汉');
    expect(content).toContain('Question: Tell me more about the first one');
  });
  it('shows the answer as it is written, and only the finished answer once it is', async () => {
    let release!: () => void;
    vi.mocked(ADAPTERS.anthropic.send).mockImplementationOnce(async (request) => {
      request.onText?.('This is a public');
      await new Promise<void>((resolve) => (release = resolve));
      return {
        text: 'This is a public research project.',
        calls: [],
        inputTokens: 100,
        outputTokens: 20,
        stop: 'done',
        assistant: {}
      };
    });
    const visitor = '203.0.113.78';
    const asked = (await (await request('/questions', 'POST', question(), cookie, visitor)).json()) as {
      data: { runId: string };
    };
    const read = async () =>
      (
        (await (await request(`/runs/${asked.data.runId}`)).json()) as {
          data: { state: string; draft?: string; answer?: string };
        }
      ).data;
    await vi.waitFor(async () => expect((await read()).draft).toBe('This is a public'), { timeout: 3000 });
    expect((await read()).state).toBe('running');
    release();
    await finished(asked.data.runId);
    expect(await read()).toMatchObject({ state: 'completed', answer: 'This is a public research project.' });
    expect((await read()).draft).toBeUndefined();
  });

  it('rechecks public visibility when a completed answer is read later', async () => {
    const result = (await (await request('/questions', 'POST', question())).json()) as { data: { runId: string } };
    await finished(result.data.runId);
    expect((await request(`/runs/${result.data.runId}`)).status).toBe(200);
    publicVisible = false;
    expect((await request(`/runs/${result.data.runId}`)).status).toBe(403);
  });

  it('labels an answer that reaches the guest output limit', async () => {
    vi.mocked(ADAPTERS.anthropic.send).mockResolvedValueOnce({
      text: 'A bounded answer',
      calls: [],
      inputTokens: 100,
      outputTokens: 512,
      stop: 'length',
      assistant: {}
    });
    const result = (await (await request('/questions', 'POST', question())).json()) as { data: { runId: string } };
    expect((await finished(result.data.runId))?.answer).toContain('This answer was cut short');
  });
  it('fails visibly when a paid provider attempt returns no answer', async () => {
    vi.mocked(ADAPTERS.anthropic.send).mockResolvedValueOnce({
      text: '',
      calls: [],
      inputTokens: 100,
      outputTokens: 0,
      stop: 'done',
      assistant: {}
    });
    const result = (await (await request('/questions', 'POST', question())).json()) as { data: { runId: string } };
    expect((await finished(result.data.runId))?.state).toBe('failed');
  });
});
