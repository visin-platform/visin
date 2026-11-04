import type { UsageBody } from '../helpers/usageTypes';
import '../helpers/mocks';
import { fetchWithTimeout } from '@visin/backend-core';
import { type Mock } from 'vitest';
import { AssistantRun } from '../../models/AssistantRun';
import { Pricing } from '../../models/Pricing';
import { ADMIN, makeAdmin, restoreFetch } from '../helpers/analystFixtures';
import { base, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

describe('refreshing prices from the price list', () => {
  const LIST_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
  const list = {
    'claude-haiku-5-5': { litellm_provider: 'anthropic', input_cost_per_token: 1e-7, output_cost_per_token: 5e-7 },
    'claude-sonnet-5-5': { litellm_provider: 'anthropic', input_cost_per_token: 2e-6, output_cost_per_token: 1e-5 },
    'gpt-5.1': { litellm_provider: 'openai', input_cost_per_token: 1.25e-6, output_cost_per_token: 1e-5 }
  };
  let sequence = 0;
  const answered = (provider: string, model: string) =>
    AssistantRun.create({
      conversationId: 'c1',
      messageId: `price-m${++sequence}`,
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      state: 'completed',
      provider,
      model,
      inputTokens: 1000000,
      outputTokens: 100000,
      finishedAt: new Date()
    });
  const serve = (body: unknown, status = 200) =>
    (fetchWithTimeout as Mock).mockImplementation(async function (url: string) {
      return String(url).includes('model_prices') || String(url).includes('prices.test')
        ? new Response(JSON.stringify(body), { status })
        : new Response('{}', { status: 404 });
    });
  const refresh = (user = ADMIN) =>
    fetch(`${base}/api/chat/settings/assistant/prices/refresh`, { method: 'POST', headers: { 'x-test-user': user } });
  const putPrices = (body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/prices`, {
      method: 'PUT',
      headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const table = async () =>
    (await Pricing.findById('pricing').lean()) as { currency: string; entries: Record<string, unknown>[] } | null;

  beforeEach(async () => {
    await makeAdmin();
    (fetchWithTimeout as Mock).mockClear();
  });
  afterEach(restoreFetch);

  it('is for administrators only, and fetches nothing for anyone else', async () => {
    serve(list);
    expect((await refresh('alice')).status).toBe(403);
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('prices every model that has answered a question, per million tokens, marked as fetched', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await answered('openai', 'gpt-5.1');
    await answered('anthropic', 'claude-haiku-5-5');
    serve(list);
    const response = await refresh();
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { currency: string; entries: Record<string, unknown>[]; refresh: Record<string, unknown> };
    };
    expect((fetchWithTimeout as Mock).mock.calls[0][0]).toBe(LIST_URL);
    expect(data.currency).toBe('USD');
    // 1e-7 per token is exactly 0.1 per million, not 0.09999999999999999.
    expect(data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'claude-haiku-5-5',
          inputPerMillion: 0.1,
          outputPerMillion: 0.5,
          source: 'fetched'
        }),
        expect.objectContaining({ model: 'gpt-5.1', inputPerMillion: 1.25, outputPerMillion: 10, source: 'fetched' })
      ])
    );
    expect(data.entries).toHaveLength(2);
    expect(data.refresh).toMatchObject({
      updated: expect.arrayContaining(['claude-haiku-5-5', 'gpt-5.1']),
      notFound: [],
      keptManual: []
    });
    expect(new Date(data.refresh.fetchedAt as string).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect((await table())?.entries.every((entry) => entry.source === 'fetched' && entry.fetchedAt)).toBe(true);
  });

  it('never overwrites a price an administrator typed, and says it left it alone', async () => {
    await answered('anthropic', 'claude-sonnet-5-5');
    await answered('anthropic', 'claude-haiku-5-5');
    await putPrices({
      currency: 'USD',
      entries: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 1.8, outputPerMillion: 9 }]
    });
    serve(list);
    const { data } = (await (await refresh()).json()) as {
      data: { entries: Record<string, unknown>[]; refresh: Record<string, unknown> };
    };
    expect(data.refresh).toMatchObject({ updated: ['claude-haiku-5-5'], keptManual: ['claude-sonnet-5-5'] });
    const sonnetEntry = data.entries.find((entry) => entry.model === 'claude-sonnet-5-5');
    expect(sonnetEntry).toMatchObject({ inputPerMillion: 1.8, outputPerMillion: 9, source: 'manual' });
  });

  it('updates a fetched price when the list changes, for questions asked from then on, not for those already answered', async () => {
    await answered('anthropic', 'claude-sonnet-5-5');
    serve(list);
    await refresh();
    const cost = async () => (await request<UsageBody>('/settings/assistant/usage', ADMIN)).body.data.totals.cost;
    // A refresh sets the price for questions to come: the one already answered had none, and is priced only on request.
    expect(await cost()).toBeNull();
    await fetch(`${base}/api/chat/settings/assistant/prices/backfill`, {
      method: 'POST',
      headers: { 'x-test-user': ADMIN }
    });
    expect(await cost()).toBe(2 + 1);
    serve({ ...list, 'claude-sonnet-5-5': { ...list['claude-sonnet-5-5'], input_cost_per_token: 4e-6 } });
    await refresh();
    // The table has the new price; what the answered question cost stays what it was.
    expect((await table())?.entries).toEqual([
      expect.objectContaining({ model: 'claude-sonnet-5-5', inputPerMillion: 4 })
    ]);
    expect(await cost()).toBe(2 + 1);
  });

  it('reports the models the list has no price for, and keeps the rest', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await answered('anthropic', 'claude-brand-new');
    serve(list);
    const { data } = (await (await refresh()).json()) as {
      data: { entries: unknown[]; refresh: Record<string, unknown> };
    };
    expect(data.refresh).toMatchObject({ updated: ['claude-haiku-5-5'], notFound: ['claude-brand-new'] });
    expect(data.entries).toHaveLength(1);
  });

  it("does not take a price that is not one, or one that belongs to another provider's model of the same name", async () => {
    for (const model of ['negative', 'text', 'huge', 'missing-output', 'wrong-provider', 'not-an-object'])
      await answered('openai', model);
    serve({
      negative: { litellm_provider: 'openai', input_cost_per_token: -1e-6, output_cost_per_token: 1e-6 },
      text: { litellm_provider: 'openai', input_cost_per_token: '1e-6', output_cost_per_token: 1e-6 },
      huge: { litellm_provider: 'openai', input_cost_per_token: 1, output_cost_per_token: 1 },
      'missing-output': { litellm_provider: 'openai', input_cost_per_token: 1e-6 },
      'wrong-provider': { litellm_provider: 'azure', input_cost_per_token: 1e-6, output_cost_per_token: 1e-6 },
      'not-an-object': 'cheap'
    });
    const { data } = (await (await refresh()).json()) as {
      data: { entries: unknown[]; refresh: { updated: string[]; notFound: string[] } };
    };
    expect(data.refresh.updated).toEqual([]);
    expect(data.refresh.notFound.sort()).toEqual([
      'huge',
      'missing-output',
      'negative',
      'not-an-object',
      'text',
      'wrong-provider'
    ]);
    expect(data.entries).toEqual([]);
  });

  it('finds a model listed under its provider prefix', async () => {
    await answered('openai', 'gpt-5.1');
    serve({ 'openai/gpt-5.1': list['gpt-5.1'] });
    const { data } = (await (await refresh()).json()) as { data: { refresh: { updated: string[] } } };
    expect(data.refresh.updated).toEqual(['gpt-5.1']);
  });

  it('leaves the prices as they were when the list cannot be fetched or is not a list', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await putPrices({
      currency: 'USD',
      entries: [
        {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          inputPerMillion: 9,
          outputPerMillion: 9,
          source: 'fetched',
          fetchedAt: '2026-10-01T00:00:00.000Z'
        }
      ]
    });
    const before = JSON.stringify(await table());
    for (const [body, status] of [
      [list, 503],
      [[1, 2], 200],
      ['text', 200],
      [null, 200]
    ] as const) {
      serve(body, status);
      const response = await refresh();
      expect(response.status).toBe(502);
      expect(((await response.json()) as { message: string }).message).toContain('The prices are as they were');
    }
    (fetchWithTimeout as Mock).mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    expect((await refresh()).status).toBe(502);
    expect(JSON.stringify(await table())).toBe(before);
  });

  it('refuses a list that announces itself as far too large, or a failure that carries no message', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    (fetchWithTimeout as Mock).mockResolvedValue(
      new Response(JSON.stringify(list), { headers: { 'content-length': String(21 * 1024 * 1024) } })
    );
    expect((await refresh()).status).toBe(502);
    (fetchWithTimeout as Mock).mockRejectedValue('offline');
    expect((await refresh()).status).toBe(502);
  });

  it('will not apply dollar prices to another currency, and does not even ask for the list', async () => {
    await answered('anthropic', 'claude-haiku-5-5');
    await putPrices({ currency: 'EUR', entries: [] });
    serve(list);
    const response = await refresh();
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain('in USD, and prices here are in EUR');
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("reads LiteLLM's public list, whatever the environment says", async () => {
    await answered('openai', 'gpt-5.1');
    process.env.ANALYST_PRICE_LIST_URL = 'https://prices.test/list.json';
    try {
      serve(list);
      expect((await refresh()).status).toBe(200);
      expect((fetchWithTimeout as Mock).mock.calls[0][0]).toBe(
        'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
      );
    } finally {
      delete process.env.ANALYST_PRICE_LIST_URL;
    }
  });

  it('keeps a fetched price marked as fetched when it is saved back unchanged, and a typed one as manual', async () => {
    const fetched = {
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      inputPerMillion: 0.1,
      outputPerMillion: 0.5,
      source: 'fetched',
      fetchedAt: '2026-11-02T10:00:00.000Z'
    };
    const typed = { provider: 'openai', model: 'gpt-5.1', inputPerMillion: 1, outputPerMillion: 2 };
    expect((await putPrices({ currency: 'USD', entries: [fetched, typed] })).status).toBe(200);
    expect((await table())?.entries).toEqual([
      expect.objectContaining({ model: 'claude-haiku-5-5', source: 'fetched' }),
      expect.objectContaining({ model: 'gpt-5.1', source: 'manual', fetchedAt: null })
    ]);
    expect((await putPrices({ currency: 'USD', entries: [{ ...fetched, fetchedAt: 'yesterday' }] })).status).toBe(400);
    expect((await putPrices({ currency: 'USD', entries: [{ ...fetched, source: 'magic' }] })).status).toBe(400);
  });
});
