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
import { GUEST_TOOLS, guestRequestBytes } from '../../services/guestTools';
import { guestOutputTokens } from '../../services/guestTurn';
import { startWorker } from '../../services/worker';
describe('anonymous public project questions', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  let cookie: string;
  // The API only admits a question; the worker answers it, as a separate process does when deployed.
  let stopWorker: () => void;
  const realFetch = globalThis.fetch;
  const project = '111111111111111111111111';
  const paper = '222222222222222222222222';
  const training = '333333333333333333333333';
  let publicVisible = true;
  let paperPublic = true;
  let lookupsDown = false;
  let readme = '';
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
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/assistant/guest`;
    stopWorker = startWorker();
  });
  afterAll(async () => {
    stopWorker();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    publicVisible = true;
    paperPublic = true;
    lookupsDown = false;
    readme = '';
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
        // A visitor's lookups carry no credential of any kind, only correlation headers.
        const bare = () => {
          const headers = new Headers(init?.headers);
          expect([...headers.keys()].filter((name) => !['x-request-id', 'traceparent'].includes(name))).toEqual([]);
        };
        if (String(url).startsWith('http://vision.invalid/api/public/papers?')) {
          bare();
          if (lookupsDown) return new Response('<html>Bad gateway</html>', { status: 502 });
          return new Response(
            JSON.stringify({
              data: {
                papers: [
                  {
                    id: paper,
                    title: 'LiDAR fusion at night',
                    authors: [{ name: 'A. Author' }, { name: 'B. Author' }],
                    year: 2026,
                    abstract: 'Camera and LiDAR fusion for driving in the dark.',
                    visibility: 'public'
                  },
                  { id: 'a'.repeat(24), title: 'A private one', visibility: 'private' },
                  { title: 'No id', visibility: 'public' }
                ]
              }
            })
          );
        }
        if (/^http:\/\/vision\.invalid\/api\/public\/papers\/[a-f\d]{24}$/.test(String(url))) {
          bare();
          return new Response(JSON.stringify({ data: { visibility: paperPublic ? 'public' : 'private', title: 'LiDAR fusion', abstract: 'Research on fusion.' } }));
        }
        if (String(url).startsWith('http://vision.invalid/api/public/trainings?')) {
          bare();
          return new Response(JSON.stringify({ data: { trainings: [{ _id: training, projectId: project, name: 'Fusion run', status: 'completed' }] } }));
        }
        if (String(url).includes(`/api/public/trainings/${training}/summary`)) {
          bare();
          if (!publicVisible) return new Response('', { status: 404 });
          return new Response(JSON.stringify({ data: { training: { projectId: project, name: 'Fusion run' }, metrics: [] } }));
        }
        if (String(url).startsWith('http://vision.invalid/api/public/projects?')) {
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
                description: 'Recorded public project context',
                ...(readme ? { readme } : {})
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
  it("keeps the visitor's session cookie to the guest routes, httpOnly, so no other page of the site can send it", async () => {
    const response = await request('/session', 'POST', {}, '', `198.51.100.${++sessions}`);
    const header = response.headers.get('set-cookie')!;
    expect(header).toContain('visin_guest=');
    expect(header).toContain('Path=/api/assistant/guest');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
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
  it('refuses a private run supplied by the page before provider execution', async () => {
    publicVisible = false;
    const { projectId: _projectId, ...input } = question();
    expect((await request('/questions', 'POST', { ...input, trainingId: training })).status).toBe(403);
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
  it('answers visitors on the guest model, priced as that model, when one is set', async () => {
    await Settings.updateOne({ _id: 'assistant' }, { $set: { guestModel: 'small-model' } });
    resetAssistantSettingsCache();
    // The main model is priced; the guest model is not, so the visitor is refused before any provider work.
    const visitor = '203.0.113.79';
    expect((await request('/questions', 'POST', question(), cookie, visitor)).status).toBe(503);
    expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
    await Pricing.updateOne(
      { _id: 'pricing' },
      {
        $push: { entries: { provider: 'anthropic', model: 'small-model', inputPerMillion: 0.1, outputPerMillion: 0.2 } }
      }
    );
    const result = (await (await request('/questions', 'POST', question(), cookie, visitor)).json()) as {
      data: { runId: string };
    };
    await finished(result.data.runId);
    expect(vi.mocked(ADAPTERS.anthropic.send).mock.calls.at(-1)![0]).toMatchObject({ model: 'small-model' });
    expect((await ProviderUsage.findOne({ runId: result.data.runId }))?.model).toBe('small-model');
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
    await AdminPolicy.updateOne({ _id: 'global' }, { $set: { 'settings.guestToolRounds': 0 } });
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

  describe('lookups in the public catalogue', () => {
    // Its own address each time: the limit per address counts across this whole file.
    let visitors = 0;
    const ask = async (key = 'idempotency-key-0001', visitor = `203.0.114.${++visitors}`) => {
      const result = (await (await request('/questions', 'POST', question(key), cookie, visitor)).json()) as {
        data: { runId: string };
      };
      return finished(result.data.runId);
    };
    const lookups = (rounds: number, resultBytes = 3000) =>
      AdminPolicy.updateOne(
        { _id: 'global' },
        { $set: { 'settings.guestToolRounds': rounds, 'settings.guestToolResultBytes': resultBytes } }
      );
    const call = (id: string, name: string, input: Record<string, unknown>) => ({ id, name, input });
    const wants = (calls: ReturnType<typeof call>[]) => ({
      text: '',
      calls,
      inputTokens: 100,
      outputTokens: 20,
      stop: 'done' as const,
      assistant: {
        role: 'assistant',
        content: calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input }))
      }
    });
    const answered = (text: string) => ({
      text,
      calls: [],
      inputTokens: 100,
      outputTokens: 20,
      stop: 'done' as const,
      assistant: {}
    });
    /** What the model was told by the lookups of the first round: the content of each tool result sent back. */
    const told = () => {
      const second = vi.mocked(ADAPTERS.anthropic.send).mock.calls[1][0].messages as { content: unknown }[];
      return (second.at(-1)!.content as { content: string }[]).map((block) => block.content);
    };

    it('offers no lookups when disabled: one request, no tools, the usual ceiling', async () => {
      await lookups(0);
      await ask();
      expect(ADAPTERS.anthropic.send).toHaveBeenCalledTimes(1);
      expect(vi.mocked(ADAPTERS.anthropic.send).mock.calls[0][0]).toMatchObject({
        tools: [],
        maxRequestBytes: GUEST_REQUEST_BYTES
      });
    });

    it('lets the answer look things up, with no credential, and answers from what came back', async () => {
      await lookups(2);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(
          wants([
            call('t1', 'search_public_papers', { query: 'lidar' }),
            call('t2', 'read_public_project', { link: '/projects/public-research' })
          ])
        )
        .mockResolvedValueOnce(answered('There is a paper on LiDAR fusion.'));
      const run = await ask();

      expect(run).toMatchObject({ state: 'completed', answer: 'There is a paper on LiDAR fusion.' });
      expect(ADAPTERS.anthropic.send).toHaveBeenCalledTimes(2);
      const first = vi.mocked(ADAPTERS.anthropic.send).mock.calls[0][0];
      expect(first.tools?.map((tool) => tool.name)).toEqual(GUEST_TOOLS.map((tool) => tool.name));
      expect(first.maxRequestBytes).toBeGreaterThan(GUEST_REQUEST_BYTES);
      const results = told();
      expect(results[0]).toContain('LiDAR fusion at night');
      expect(results[0]).toContain(`/papers/${paper}`);
      // A private paper and one without an id are not offered; an author list is short.
      expect(results[0]).not.toContain('A private one');
      expect(results[1]).toContain('Public research');
      // Each request is metered, and what the answer drew on is kept to be rechecked.
      expect(await ProviderUsage.countDocuments({ state: 'completed', kind: 'guest' })).toBe(2);
      expect(run.paperIds).toEqual([paper]);
      expect(run.projectIds).toContain(project);
      expect(vi.mocked(globalThis.fetch).mock.calls.some(([url]) => String(url).includes('/api/public/papers?'))).toBe(
        true
      );
    });

    it('stops showing an answer once a paper it drew on is no longer public', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'search_public_papers', { query: 'lidar' })]))
        .mockResolvedValueOnce(answered('There is a paper on LiDAR fusion.'));
      const run = await ask();
      expect((await request(`/runs/${run.id}`)).status).toBe(200);
      paperPublic = false;
      expect((await request(`/runs/${run.id}`)).status).toBe(403);
    });

    it('does not reuse a previous answer after a cited paper becomes private', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'search_public_papers', { query: 'lidar' })]))
        .mockResolvedValueOnce(answered('Previous paper answer.'));
      expect((await ask())?.state).toBe('completed');
      paperPublic = false;
      await ask('idempotency-key-0002');
      const next = vi.mocked(ADAPTERS.anthropic.send).mock.calls.at(-1)![0];
      expect(JSON.stringify(next.messages)).not.toContain('Previous paper answer.');
    });

    it('does not publish an answer if a paper it looked up becomes private while it is written', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'search_public_papers', { query: 'lidar' })]))
        .mockImplementationOnce(async () => {
          paperPublic = false;
          return answered('Do not publish');
        });
      const run = await ask();
      expect(run.state).toBe('failed');
      expect(run.answer).toBeUndefined();
    });

    it('allows only the rounds it was given, and makes the last one an answer: no lookups are offered', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'search_public_papers', { query: 'lidar' })]))
        .mockResolvedValueOnce(answered('Answered after one round.'));
      await ask();
      const sent = vi.mocked(ADAPTERS.anthropic.send).mock.calls;
      expect(sent).toHaveLength(2);
      expect(sent[0][0].tools).toHaveLength(GUEST_TOOLS.length);
      expect(sent[1][0].tools).toEqual([]);
    });

    it('searches and reads public runs and papers without a credential', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([
          call('t1', 'search_public_runs', { query: 'fusion' }),
          call('t2', 'read_public_run', { link: `/trainings/${training}` }),
          call('t3', 'read_public_paper', { link: `/papers/${paper}` })
        ]))
        .mockResolvedValueOnce(answered('Public research.'));
      const run = await ask();
      expect(run.state).toBe('completed');
      expect(told()[0]).toContain(`/trainings/${training}`);
      expect(told()[1]).toContain('Fusion run');
      expect(told()[2]).toContain('Research on fusion.');
      expect(run.projectIds).toContain(project);
      expect(run.paperIds).toContain(paper);
    });

    it('finds public projects by topic and returns links', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'search_public_projects', { query: 'public' })]))
        .mockResolvedValueOnce(answered('Public research.'));
      const run = await ask();
      expect(told()[0]).toContain('/projects/public-research');
      expect(run?.projectIds).toContain(project);
    });

    it('rejects malformed run and paper links and empty run searches', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([
          call('t1', 'read_public_run', { link: '/trainings/not-an-id' }),
          call('t2', 'read_public_paper', { link: '/papers/not-an-id' }),
          call('t3', 'search_public_runs', { query: '' })
        ]))
        .mockResolvedValueOnce(answered('No results.'));
      await ask();
      expect(told()).toEqual(['Give a public run link.', 'Give a public paper link.', 'Give some words to search for.']);
    });

    it('runs at most three lookups in a round, and still answers the rest so the provider accepts the turn', async () => {
      await lookups(2);
      const many = ['a', 'b', 'c', 'd', 'e'].map((q, i) => call(`t${i}`, 'search_public_papers', { query: q }));
      vi.mocked(ADAPTERS.anthropic.send).mockResolvedValueOnce(wants(many)).mockResolvedValueOnce(answered('Done.'));
      await ask();
      const searched = vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(([url]) => String(url).includes('/api/public/papers?'));
      expect(searched).toHaveLength(3);
      const results = told();
      expect(results).toHaveLength(5);
      expect(results.slice(3).every((text) => text.includes('Too many lookups'))).toBe(true);
    });

    it('cuts a result to the size set, as the request carries it', async () => {
      await lookups(1, 500);
      readme = 'a long readme with "quotes" and\nnewlines '.repeat(200);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'read_public_project', { link: '/projects/public-research' })]))
        .mockResolvedValueOnce(answered('Read it.'));
      await ask();
      const [text] = told();
      expect(text).toContain('[CUT');
      expect(Buffer.byteLength(JSON.stringify(text)) - 2).toBeLessThanOrEqual(500);
    });

    it('reserves what the rounds can cost: more than a question with no lookups, from the same ceiling', async () => {
      const day = new Date().toISOString().slice(8, 10);
      const reserved = async () =>
        Number(
          (
            await mongoose.connection
              .collection('chat_guest_budgets')
              .findOne({ _id: new Date().toISOString().slice(0, 7) as never })
          )?.days?.[day]?.reservedMicros ?? 0
        );
      await lookups(0);
      await ask('idempotency-key-0001', '203.0.113.90');
      const plain = await reserved();
      await mongoose.connection.collection('chat_guest_budgets').deleteMany({});
      await lookups(3, 3000);
      await ask('idempotency-key-0002', '203.0.113.91');
      const withLookups = await reserved();
      // Four requests, each allowed to carry the tools, the earlier rounds' results and a full answer.
      expect(withLookups).toBeGreaterThan(plain * 4);
      expect(guestRequestBytes({ rounds: 3, resultBytes: 3000 }, 1140)).toBeGreaterThan(GUEST_REQUEST_BYTES * 2);
    });

    it('says only that a lookup is unavailable when vision is down, and never why', async () => {
      await lookups(1);
      lookupsDown = true;
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'search_public_papers', { query: 'lidar' })]))
        .mockResolvedValueOnce(answered('I could not look that up.'));
      const run = await ask();
      expect(run.state).toBe('completed');
      expect(told()).toEqual(['That lookup is unavailable right now.']);
    });

    it('treats a bad link, an unknown lookup and an empty search as the model\u2019s mistake, not a failure', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(
          wants([
            call('t1', 'read_public_project', { link: '/trainings/abc' }),
            call('t2', 'read_private_thing', {}),
            call('t3', 'search_public_papers', { query: '  ' })
          ])
        )
        .mockResolvedValueOnce(answered('Fine.'));
      expect((await ask()).state).toBe('completed');
      expect(told()).toEqual([
        'That is not a project link. Use a link a search returned.',
        'That lookup does not exist.',
        'Give some words to search for.'
      ]);
    });

    it('reads a project made private since as not found, without saying it was there', async () => {
      await lookups(1);
      vi.mocked(ADAPTERS.anthropic.send)
        .mockResolvedValueOnce(wants([call('t1', 'read_public_project', { link: '/projects/public-research' })]))
        .mockImplementationOnce(async () => answered('Nothing found.'));
      // The page's own project is public when the question starts, and private by the time the lookup reads it.
      let reads = 0;
      const inner = vi.mocked(globalThis.fetch).getMockImplementation()!;
      vi.mocked(globalThis.fetch).mockImplementation(async (url, init) => {
        if (String(url).includes('/api/public/projects/public-research') && ++reads > 0) publicVisible = false;
        return inner(url, init);
      });
      const run = await ask();
      expect(told()).toEqual(['Not among the public ones.']);
      // The answer drew on a project that is no longer public, so it is not published.
      expect(run.state).toBe('failed');
    });
  });

  // The API admits a question and leaves it for a worker, which may be another process, a moment later.
  describe('the question queue', () => {
    let addresses = 0;
    const queue = async (key: string) => {
      stopWorker();
      const response = await request('/questions', 'POST', question(key), cookie, `203.0.115.${++addresses}`);
      expect(response.status).toBe(202);
      return ((await response.json()) as { data: { runId: string } }).data.runId;
    };
    const turn = (text: string) => ({
      text,
      calls: [],
      inputTokens: 100,
      outputTokens: 20,
      stop: 'done' as const,
      assistant: {}
    });
    // Whatever a test did to the worker, the next one starts with a live one, as every other test in this file has.
    afterEach(() => {
      stopWorker();
      stopWorker = startWorker();
    });

    it('only admits a question: it waits, with what it was reserved for, until a worker takes it', async () => {
      const id = await queue('idempotency-key-queue-1');
      const row = await GuestRun.findById(id).lean();
      expect(row).toMatchObject({
        state: 'admitting',
        plan: { provider: 'anthropic', model: 'test-model' },
        page: { projectId: project }
      });
      expect(row?.queuedAt).toBeInstanceOf(Date);
      expect(row?.month).toMatch(/^\d{4}-\d{2}$/);
      expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
      // The visitor's page is told it is on its way, as it was while a request was being admitted.
      const status = (await (await request(`/runs/${id}`)).json()) as { data: { state: string } };
      expect(status.data.state).toBe('admitting');
      // A worker that is already running is woken by the question; this one is started afterwards, so it looks now.
      const worker = startWorker();
      stopWorker = worker;
      await worker.tick();
      expect((await finished(id)).state).toBe('completed');
      expect(ADAPTERS.anthropic.send).toHaveBeenCalledTimes(1);
    });

    it('answers with the shape it was admitted on, not the settings of the moment a worker takes it', async () => {
      const id = await queue('idempotency-key-queue-2');
      const admitted = (await GuestRun.findById(id).lean())!.plan!;
      await AdminPolicy.updateOne({ _id: 'global' }, { $set: { 'settings.guestAnswerWords': 300 } });
      const worker = startWorker();
      stopWorker = worker;
      await worker.tick();
      await finished(id);
      const sent = vi.mocked(ADAPTERS.anthropic.send).mock.calls.at(-1)![0];
      expect(sent.maxOutputTokens).toBe(guestOutputTokens(admitted.words!));
      expect(sent.maxOutputTokens).not.toBe(guestOutputTokens(300));
    });

    it('fails a question nobody took in time, and one whose worker went away, without calling the provider', async () => {
      stopWorker();
      const base = { sessionId: 'visitor', question: 'q', month: '2026-11', expiresAt: new Date(Date.now() + 86400000) };
      await GuestRun.create([
        { ...base, _id: 'untaken', state: 'admitting', queuedAt: new Date(Date.now() - 120000) },
        { ...base, _id: 'lost', state: 'running', leaseUntil: new Date(Date.now() - 1000) },
        { ...base, _id: 'held', state: 'running', leaseUntil: new Date(Date.now() + 60000) }
      ]);
      const worker = startWorker();
      stopWorker = worker;
      await worker.tick();
      for (const id of ['untaken', 'lost']) {
        const row = await GuestRun.findById(id).lean();
        expect(row?.state).toBe('failed');
        expect(row?.error).toContain('interrupted');
      }
      expect((await GuestRun.findById('held').lean())?.state).toBe('running');
      expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
    });

    it('leaves a question that is still being admitted alone', async () => {
      stopWorker();
      await GuestRun.create({
        _id: 'admitting',
        sessionId: 'visitor',
        question: 'q',
        expiresAt: new Date(Date.now() + 86400000)
      });
      const worker = startWorker();
      stopWorker = worker;
      await worker.tick();
      expect((await GuestRun.findById('admitting').lean())?.state).toBe('admitting');
      expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
    });

    it('lets a question being answered finish when its worker is stopped', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      vi.mocked(ADAPTERS.anthropic.send).mockImplementationOnce(async () => {
        await gate;
        return turn('Finished while stopping.');
      });
      const id = await queue('idempotency-key-queue-3');
      const worker = startWorker();
      stopWorker = worker;
      const ticking = worker.tick();
      await vi.waitFor(async () => expect((await GuestRun.findById(id))?.state).toBe('running'));
      const draining = worker.drain(5000);
      setTimeout(release, 100);
      await draining;
      await ticking;
      const row = await GuestRun.findById(id).lean();
      expect(row?.state).toBe('completed');
      expect(row?.answer).toBe('Finished while stopping.');
    });

    it('stops a question being answered as soon as guest Vivi is switched off', async () => {
      vi.mocked(ADAPTERS.anthropic.send).mockImplementationOnce(
        ({ signal }) =>
          new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))))
      );
      const id = await queue('idempotency-key-queue-5');
      const worker = startWorker();
      stopWorker = worker;
      const ticking = worker.tick();
      await vi.waitFor(async () => expect((await GuestRun.findById(id))?.state).toBe('running'));
      await AdminPolicy.updateOne({ _id: 'global' }, { $set: { 'settings.guestEnabled': false } });
      // The one-second watch notices, aborts the request to the provider and the question fails.
      await ticking;
      expect((await GuestRun.findById(id))?.state).toBe('failed');
    });

    it('fails a queued question that has no plan instead of guessing one', async () => {
      stopWorker();
      await GuestRun.create({
        _id: 'planless',
        sessionId: 'visitor',
        question: 'q',
        month: '2026-11',
        state: 'admitting',
        queuedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      });
      const worker = startWorker();
      stopWorker = worker;
      await worker.tick();
      expect((await GuestRun.findById('planless').lean())?.state).toBe('failed');
      expect(ADAPTERS.anthropic.send).not.toHaveBeenCalled();
    });

    it('aborts a question that outlasts the stop, and fails it instead of leaving it running', async () => {
      vi.mocked(ADAPTERS.anthropic.send).mockImplementationOnce(
        ({ signal }) =>
          new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))))
      );
      const id = await queue('idempotency-key-queue-4');
      const worker = startWorker();
      stopWorker = worker;
      const ticking = worker.tick();
      await vi.waitFor(async () => expect((await GuestRun.findById(id))?.state).toBe('running'));
      await worker.drain(50);
      await ticking;
      expect((await GuestRun.findById(id))?.state).toBe('failed');
    });
  });
});
