import type { UsageBody } from '../helpers/usageTypes';
import '../helpers/mocks';
import { AssistantRun } from '../../models/AssistantRun';
import { Pricing } from '../../models/Pricing';
import { ADMIN, getPricingForTest, makeAdmin } from '../helpers/analystFixtures';
import { base, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

describe('usage and spend', () => {
  const NOW = Date.now();
  const daysAgo = (days: number, hour = 12) => {
    const day = new Date(NOW);
    day.setUTCDate(day.getUTCDate() - days);
    day.setUTCHours(hour, 0, 0, 0);
    return day;
  };
  const asked = (inputPerMillion: number, outputPerMillion: number, currency = 'USD') => ({
    currency,
    inputPerMillion,
    outputPerMillion,
    source: 'manual',
    backfilled: false
  });
  const SONNET_PRICE = asked(3, 15);
  let sequence = 0;
  /** A question answered now, at no price unless one is given: what it cost is what was kept with it. */
  const answered = (over: Record<string, unknown> = {}) =>
    AssistantRun.create({
      conversationId: 'c1',
      messageId: `m${++sequence}`,
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      state: 'completed',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      inputTokens: 1000000,
      outputTokens: 100000,
      finishedAt: daysAgo(0),
      ...over
    });
  const usage = async (days?: number, user = ADMIN) =>
    request<UsageBody>(`/settings/assistant/usage${days ? `?days=${days}` : ''}`, user);
  const report = async (days?: number) => (await usage(days)).body.data;
  const putPrices = (user: string, body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/prices`, {
      method: 'PUT',
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const sonnet = { provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 3, outputPerMillion: 15 };
  /** As the service stores and returns it: typed by hand, so never overwritten by a refresh. */
  const stored = (entry: object) => ({ ...entry, source: 'manual', fetchedAt: null });

  beforeEach(async () => {
    await makeAdmin();
  });

  it('is for administrators only', async () => {
    expect((await usage(30, 'alice')).status).toBe(403);
    expect((await putPrices('alice', { currency: 'USD', entries: [sonnet] })).status).toBe(403);
    expect(await Pricing.countDocuments()).toBe(0);
  });

  it('is empty, with no money, before anything was asked', async () => {
    const empty = await report();
    expect(empty).toMatchObject({
      days: 30,
      currency: 'USD',
      failedQuestions: 0,
      backfilledQuestions: 0,
      totals: { questions: 0, inputTokens: 0, outputTokens: 0, cost: null, unpricedQuestions: 0, unpricedTokens: 0 },
      byDay: [],
      byModel: [],
      byPerson: []
    });
    expect(empty.prices).toEqual({ currency: 'USD', entries: [] });
  });

  it('counts tokens without inventing money for questions nobody priced', async () => {
    await answered();
    await answered({ inputTokens: 500000, outputTokens: 50000 });
    const data = await report();
    expect(data.totals).toEqual({
      questions: 2,
      inputTokens: 1500000,
      outputTokens: 150000,
      cost: null,
      unpricedQuestions: 2,
      unpricedTokens: 1650000
    });
    expect(data.byModel).toEqual([
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        questions: 2,
        cost: null,
        price: null
      })
    ]);
  });

  it('costs each question at the price kept with it, per million tokens', async () => {
    await answered({ price: SONNET_PRICE });
    // 1,000,000 in at 3 + 100,000 out at 15 per million.
    const data = await report();
    expect(data.totals).toMatchObject({ cost: 4.5, unpricedQuestions: 0, unpricedTokens: 0 });
    expect(data.currency).toBe('USD');
  });

  it('keeps what a question cost when the price changes afterwards, and prices later questions at the new one', async () => {
    await answered({ price: SONNET_PRICE, finishedAt: daysAgo(3) });
    // The price drops: only what is asked after it is affected.
    await putPrices(ADMIN, { currency: 'USD', entries: [{ ...sonnet, inputPerMillion: 1, outputPerMillion: 5 }] });
    await answered({ price: asked(1, 5) });
    const data = await report();
    expect(data.byDay.map((row) => row.cost)).toEqual([4.5, 1.5]);
    expect(data.totals.cost).toBe(6);
    // The table shows what a question asked now costs; the row says the price changed within the period.
    expect(data.byModel[0]).toMatchObject({
      cost: 6,
      pricesInPeriod: 2,
      price: stored({ ...sonnet, inputPerMillion: 1, outputPerMillion: 5 })
    });
  });

  it('stamps the price in effect on an answer when it is given, and nothing where there is none', async () => {
    // Done by the worker as a question completes, the same way for the first and any later one.
    const { priceSnapshot } = await import('../../services/usage.js');
    expect(await priceSnapshot('anthropic', 'claude-sonnet-5-5')).toBeNull();
    await putPrices(ADMIN, { currency: 'eur', entries: [sonnet] });
    expect(await priceSnapshot('anthropic', 'claude-sonnet-5-5')).toEqual({
      currency: 'EUR',
      inputPerMillion: 3,
      outputPerMillion: 15,
      source: 'manual',
      backfilled: false
    });
    expect(await priceSnapshot('openai', 'gpt-5.1')).toBeNull();
  });

  it('prices questions asked before their model had a price, only when asked to, and says so', async () => {
    await answered();
    await answered({ price: asked(1, 1) });
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    // Setting a price does not touch what was already answered.
    let data = await report();
    expect(data.totals).toMatchObject({ questions: 2, unpricedQuestions: 1, cost: 1.1 });
    expect(data.backfilledQuestions).toBe(0);
    const response = await fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
      method: 'POST',
      headers: { 'x-test-user': ADMIN }
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: object }).data).toEqual({
      questions: 1,
      models: [{ model: 'claude-sonnet-5-5', questions: 1 }]
    });
    data = await report();
    // The one that already had a price keeps it; the other is costed at today's, and counted as backfilled.
    expect(data.totals).toMatchObject({ unpricedQuestions: 0, cost: 1.1 + 4.5 });
    expect(data.backfilledQuestions).toBe(1);
    // Doing it again changes nothing.
    const again = await fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
      method: 'POST',
      headers: { 'x-test-user': ADMIN }
    });
    expect(((await again.json()) as { data: { questions: number } }).data.questions).toBe(0);
  });

  it('backfills only the models that now have a price, and is for administrators only', async () => {
    await answered();
    await answered({ provider: 'openai', model: 'gpt-5.1' });
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    const post = (user: string) =>
      fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
        method: 'POST',
        headers: { 'x-test-user': user }
      });
    expect((await post('alice')).status).toBe(403);
    expect(((await (await post(ADMIN)).json()) as { data: { questions: number } }).data.questions).toBe(1);
    expect((await report()).totals).toMatchObject({ unpricedQuestions: 1 });
    expect(await AssistantRun.countDocuments({ 'price.backfilled': true })).toBe(1);
  });

  it('adds no money across currencies: where a period has prices in two, there is no total', async () => {
    await answered({ price: asked(3, 15, 'USD') });
    expect((await report()).currency).toBe('USD');
    await answered({ price: asked(3, 15, 'EUR'), inputTokens: 10, outputTokens: 10 });
    const data = await report();
    expect(data.currency).toBe('MIXED');
    expect(data.totals.cost).toBeNull();
    expect(data.totals.questions).toBe(2);
    expect(data.byModel[0].cost).toBeNull();
  });

  it('splits the cost by model, day and person, and prices only what has a price', async () => {
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    await answered({ price: SONNET_PRICE, finishedAt: daysAgo(2) });
    await answered({
      price: SONNET_PRICE,
      finishedAt: daysAgo(2, 23),
      userId: 'bob',
      name: 'Bob',
      inputTokens: 2000000,
      outputTokens: 0
    });
    await answered({ provider: 'openai', model: 'gpt-5.1', inputTokens: 400000, outputTokens: 40000 });
    const data = await report();
    expect(data.totals).toMatchObject({ questions: 3, cost: 4.5 + 6, unpricedTokens: 440000 });
    // Oldest day first, each with its own tokens and cost.
    expect(data.byDay.map((d) => d.day)).toEqual([
      daysAgo(2).toISOString().slice(0, 10),
      daysAgo(0).toISOString().slice(0, 10)
    ]);
    expect(data.byDay[0]).toMatchObject({ questions: 2, cost: 4.5 + 6 });
    expect(data.byDay[1]).toMatchObject({ questions: 1, cost: null, unpricedTokens: 440000 });
    // Most money first; the unpriced model after.
    expect(data.byModel.map((m) => m.model)).toEqual(['claude-sonnet-5-5', 'gpt-5.1']);
    expect(data.byPerson.map((p) => [p.name, p.cost])).toEqual([
      ['Bob', 6],
      ['Alice', 4.5]
    ]);
  });

  it("adds one person's answers across models into one row, with the name they have now", async () => {
    await answered({ price: SONNET_PRICE, finishedAt: daysAgo(3), name: 'Alice Old' });
    await answered({ provider: 'openai', model: 'gpt-5.1', inputTokens: 1, outputTokens: 1, name: 'Alice New' });
    const people = (await report()).byPerson;
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ userId: 'alice', questions: 2, cost: 4.5, unpricedTokens: 2 });
    expect(people[0].name).toMatch(/^Alice (Old|New)$/);
  });

  it('counts only answers finished inside the window, in whole UTC days, and says how many failed', async () => {
    await answered({ finishedAt: daysAgo(0) });
    await answered({ finishedAt: daysAgo(6) });
    await answered({ finishedAt: daysAgo(7, 0) });
    await answered({ finishedAt: daysAgo(40) });
    expect((await report(7)).totals.questions).toBe(2);
    expect((await report(1)).totals.questions).toBe(1);
    expect((await report(90)).totals.questions).toBe(4);
    // Questions that did not finish used tokens nobody reported: counted as failures, never as spend.
    await answered({ state: 'failed', finishedAt: daysAgo(1), inputTokens: 0, outputTokens: 0 });
    await answered({ state: 'running', finishedAt: undefined });
    const data = await report(7);
    expect(data.totals.questions).toBe(2);
    expect(data.failedQuestions).toBe(1);
  });

  it('keeps answers that were recorded before the provider or model was, as their own unpriced row', async () => {
    await answered({ provider: undefined, model: undefined });
    expect((await report()).byModel).toEqual([
      expect.objectContaining({ provider: 'unknown', model: 'unknown', cost: null })
    ]);
  });

  it('takes a window of 1 to 365 days, and nothing else', async () => {
    expect((await usage(365)).status).toBe(200);
    for (const bad of ['0', '366', '1.5', 'abc', '-3'])
      expect((await request(`/settings/assistant/usage?days=${bad}`, ADMIN)).status).toBe(400);
  });

  it('refuses prices that are not prices, and keeps what it had', async () => {
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet] });
    const bad = (body: unknown) => putPrices(ADMIN, body);
    expect((await bad({ currency: 'dollars', entries: [] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, inputPerMillion: -1 }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, outputPerMillion: 100001 }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, inputPerMillion: '3' }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, provider: 'nobody' }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, model: '' }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [{ ...sonnet, extra: 1 }] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: [sonnet, sonnet] })).status).toBe(400);
    expect((await bad({ currency: 'USD', entries: new Array(201).fill(sonnet) })).status).toBe(400);
    expect((await bad({ entries: [] })).status).toBe(400);
    expect((await getPricingForTest()).entries).toEqual([stored(sonnet)]);
  });

  it('replaces the whole table, so a price is removed by leaving it out', async () => {
    const gpt = { provider: 'openai', model: 'gpt-5.1', inputPerMillion: 1.25, outputPerMillion: 10 };
    await putPrices(ADMIN, { currency: 'USD', entries: [sonnet, gpt] });
    await putPrices(ADMIN, { currency: 'USD', entries: [gpt] });
    expect((await getPricingForTest()).entries).toEqual([stored(gpt)]);
    await putPrices(ADMIN, { currency: 'USD', entries: [] });
    expect((await getPricingForTest()).entries).toEqual([]);
  });
});

it('prices ordinary input, cache reads, cache writes and output at the saved rates', async () => {
  await makeAdmin();
  await AssistantRun.create({
    conversationId: 'cached',
    messageId: 'cached',
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    state: 'completed',
    provider: 'anthropic',
    model: 'cached-model',
    inputTokens: 1000000,
    outputTokens: 100000,
    cacheReadTokens: 600000,
    cacheWriteTokens: 100000,
    providerRequests: 2,
    toolCalls: 1,
    durationMs: 1200,
    finishedAt: new Date(),
    price: {
      currency: 'USD',
      inputPerMillion: 3,
      outputPerMillion: 15,
      cacheReadPerMillion: 0.3,
      cacheWritePerMillion: 3.75
    }
  });
  const response = await request<
    UsageBody & { performance: { cacheReadTokens: number; cacheWriteTokens: number; providerRequests: number } }
  >('/settings/assistant/usage', ADMIN);
  expect(response.body.data.totals.cost).toBeCloseTo(2.955);
  expect(response.body.data.performance).toMatchObject({
    cacheReadTokens: 600000,
    cacheWriteTokens: 100000,
    providerRequests: 2
  });
});
it('keeps cached questions unpriced when the applicable cache rates are missing', async () => {
  await makeAdmin();
  await AssistantRun.create({
    conversationId: 'cached',
    messageId: 'missing-cache-price',
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    state: 'completed',
    provider: 'openai',
    model: 'cached-model',
    inputTokens: 1000,
    outputTokens: 100,
    cacheReadTokens: 500,
    finishedAt: new Date(),
    price: { currency: 'USD', inputPerMillion: 3, outputPerMillion: 15 }
  });
  const response = await request<UsageBody>('/settings/assistant/usage', ADMIN);
  expect(response.body.data.totals).toMatchObject({ cost: null, unpricedQuestions: 1, unpricedTokens: 1100 });
});
it('round-trips optional cache prices and freezes them in the per-answer snapshot', async () => {
  await makeAdmin();
  const entry = {
    provider: 'openai',
    model: 'cached-model',
    inputPerMillion: 2,
    outputPerMillion: 8,
    cacheReadPerMillion: 0,
    cacheWritePerMillion: 2.5
  };
  const response = await fetch(`${base}/api/chat/settings/assistant/prices`, {
    method: 'PUT',
    headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
    body: JSON.stringify({ currency: 'USD', entries: [entry] })
  });
  expect(response.status).toBe(200);
  const { priceSnapshot } = await import('../../services/usage.js');
  expect(await priceSnapshot('openai', 'cached-model')).toMatchObject({
    cacheReadPerMillion: 0,
    cacheWritePerMillion: 2.5
  });
});
it('backfills missing cache rates once while retaining the original input/output prices', async () => {
  await makeAdmin();
  const run = await AssistantRun.create({
    conversationId: 'cached',
    messageId: 'backfill-cache',
    userId: 'alice',
    email: 'alice@test.invalid',
    name: 'Alice',
    state: 'completed',
    provider: 'openai',
    model: 'cached-model',
    inputTokens: 1000000,
    outputTokens: 100000,
    cacheReadTokens: 500000,
    cacheWriteTokens: 100000,
    finishedAt: new Date(),
    price: { currency: 'USD', inputPerMillion: 3, outputPerMillion: 15 }
  });
  await fetch(`${base}/api/chat/settings/assistant/prices`, {
    method: 'PUT',
    headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
    body: JSON.stringify({
      currency: 'USD',
      entries: [
        {
          provider: 'openai',
          model: 'cached-model',
          inputPerMillion: 1,
          outputPerMillion: 2,
          cacheReadPerMillion: 0.3,
          cacheWritePerMillion: 3.75
        }
      ]
    })
  });
  const first = await request<{ questions: number }>('/settings/assistant/prices/backfill', ADMIN, {});
  expect(first.status, JSON.stringify(first.body)).toBe(200);
  expect(first.body.data.questions).toBe(1);
  expect((await AssistantRun.findById(run.id))?.price).toMatchObject({
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
    backfilled: true
  });
  const usage = await request<UsageBody>('/settings/assistant/usage', ADMIN);
  expect(usage.body.data.totals.cost).toBeCloseTo(3.225);
  expect(
    (await request<{ questions: number }>('/settings/assistant/prices/backfill', ADMIN, {})).body.data.questions
  ).toBe(0);
});
