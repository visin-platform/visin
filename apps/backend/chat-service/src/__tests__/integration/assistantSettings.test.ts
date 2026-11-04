import '../helpers/mocks';
import { fetchWithTimeout } from '@visin/backend-core';
import { type Mock } from 'vitest';
import { AssistantRun } from '../../models/AssistantRun';
import { Budget } from '../../models/Budget';
import { ProviderKey } from '../../models/ProviderKey';
import { Settings } from '../../models/Settings';
import { analyze } from '../../services/analyst';
import { appendMessage } from '../../services/messages';
import { resetAssistantSettingsCache } from '../../services/settings';
import { startWorker } from '../../services/worker';
import {
  ADMIN,
  enableAnalyst,
  makeAdmin,
  provider,
  putSettings,
  restoreFetch,
  saveKey,
  saveKeys
} from '../helpers/analystFixtures';
import { create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

describe('analyst settings', () => {
  it('offers the settings only to administrators, and refuses everyone else', async () => {
    await makeAdmin();
    expect((await request('/capabilities', ADMIN)).body.data.canConfigure).toBe(true);
    expect((await request('/capabilities', 'alice')).body.data.canConfigure).toBe(false);
    for (const user of ['alice', '555555555555555555555555'])
      expect((await request('/settings/assistant', user)).status).toBe(403);
    expect(
      (await putSettings('alice', { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' })).status
    ).toBe(403);
    expect((await request('/settings/assistant/models', 'alice')).status).toBe(403);
    expect(await Settings.countDocuments()).toBe(0);
  });

  it('starts on but without a model, with the provider that has a key, and lists what only the operator can add', async () => {
    await makeAdmin();
    delete process.env.MCP_INTERNAL_URL;
    // No key anywhere: Anthropic is shown first, and nothing can answer.
    expect((await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>).toMatchObject({
      enabled: true,
      provider: 'anthropic',
      model: '',
      dailyTokenLimit: 800000,
      tokenReservation: 160000,
      source: 'default',
      ready: false
    });
    // Only OpenAI has a key: that is the provider, rather than one that could not be used.
    await saveKey('openai', 'openai-key');
    expect((await request('/settings/assistant', ADMIN)).body.data).toMatchObject({ provider: 'openai' });
    // Both have: the first.
    await saveKey('anthropic', 'anthropic-key');
    const view = (await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>;
    expect(view).toMatchObject({ provider: 'anthropic', model: '', ready: false });
    expect(view.missing).toEqual(['MCP_INTERNAL_URL']);
    expect(view.providers).toEqual([
      {
        id: 'anthropic',
        name: 'Anthropic',
        keyConfigured: true,
        keyHint: '-key'
      },
      {
        id: 'openai',
        name: 'OpenAI',
        keyConfigured: true,
        keyHint: '-key'
      }
    ]);
    expect(JSON.stringify(view)).not.toContain('anthropic-key');
    process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
  });

  it('turns the analyst on and off, with a provider and model, from the page', async () => {
    await makeAdmin();
    await saveKeys();
    const id = await create('assistant', []);
    const ask = (clientId: string) => request(`/conversations/${id}/messages`, 'alice', { body: 'Peak?', clientId });
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
    expect((await ask('settings-ask-1')).status).toBe(400);

    provider({ anthropic: ['claude-opus-5-5'] });
    const put = await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { data: object }).data).toMatchObject({
      enabled: true,
      provider: 'anthropic',
      source: 'admin',
      ready: true
    });
    expect((await request('/capabilities', 'alice')).body.data).toMatchObject({
      assistant: true,
      assistantModel: { provider: 'anthropic', model: 'claude-opus-5-5', ready: true }
    });
    expect((await ask('settings-ask-2')).status).toBe(201);

    await putSettings(ADMIN, { enabled: false, provider: 'anthropic', model: 'claude-opus-5-5' });
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
    restoreFetch();
  });

  it("switches provider, and is ready only with that provider's own key", async () => {
    await makeAdmin();
    await saveKeys();
    provider({ openai: [{ id: 'gpt-5.1', created: 2 }] });
    const put = await putSettings(ADMIN, { enabled: true, provider: 'openai', model: 'gpt-5.1' });
    expect(((await put.json()) as { data: object }).data).toMatchObject({ provider: 'openai', ready: true });
    await ProviderKey.deleteOne({ provider: 'openai' });
    resetAssistantSettingsCache();
    const view = (await request('/settings/assistant', ADMIN)).body.data;
    expect(view).toMatchObject({ provider: 'openai', ready: false, missing: [] });
    expect((view as { providers: { id: string; keyConfigured: boolean }[] }).providers[1]).toMatchObject({
      id: 'openai',
      keyConfigured: false
    });
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
    restoreFetch();
  });

  it('only accepts a model the chosen provider offers, never one typed in', async () => {
    await makeAdmin();
    await saveKeys();
    provider({ anthropic: ['claude-opus-5-5'], openai: [{ id: 'gpt-5.1', created: 1 }] });
    const refused = await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-made-up' });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { message: string }).message).toContain(
      'Anthropic does not offer claude-made-up'
    );
    // Another provider's model is not this provider's.
    expect((await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'gpt-5.1' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: '' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: true, provider: 'nobody', model: 'x' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: true, model: 'claude-opus-5-5' })).status).toBe(400);
    expect(await Settings.countDocuments()).toBe(0);
    restoreFetch();
  });

  it('cannot turn the analyst on while the provider cannot list its models, but can always turn it off', async () => {
    await makeAdmin();
    await saveKeys();
    provider({});
    const on = await putSettings(ADMIN, { enabled: true, provider: 'openai', model: 'gpt-5.1' });
    expect(on.status).toBe(400);
    expect(((await on.json()) as { message: string }).message).toContain('Add a valid OpenAI key first');
    await ProviderKey.deleteOne({ provider: 'openai' });
    resetAssistantSettingsCache();
    expect((await putSettings(ADMIN, { enabled: true, provider: 'openai', model: 'gpt-5.1' })).status).toBe(400);
    expect((await putSettings(ADMIN, { enabled: false, provider: 'openai', model: 'gone-model' })).status).toBe(200);
    expect(await Settings.countDocuments()).toBe(1);
    restoreFetch();
  });

  it('lists the models of the provider asked for, newest first, and only chat models for OpenAI', async () => {
    await makeAdmin();
    await saveKeys();
    provider({
      anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5'],
      openai: [
        { id: 'gpt-4o', created: 10 },
        { id: 'text-embedding-3-small', created: 50 },
        { id: 'gpt-5.1', created: 30 },
        { id: 'whisper-1', created: 5 },
        { id: 'gpt-4o-mini-tts', created: 40 },
        { id: 'o4-mini', created: 20 },
        { id: 'dall-e-3', created: 1 }
      ]
    });
    (fetchWithTimeout as Mock).mockClear();
    expect((await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data).toEqual({
      provider: 'anthropic',
      reachable: true,
      recommended: 'claude-sonnet-5-5',
      models: [
        { id: 'claude-opus-5-5', name: 'CLAUDE-OPUS-5-5', tier: 'best' },
        { id: 'claude-sonnet-5-5', name: 'CLAUDE-SONNET-5-5', tier: 'balanced' }
      ]
    });
    expect((fetchWithTimeout as Mock).mock.calls[0][1].headers['x-api-key']).toBe('anthropic-key');
    const openai = (await request('/settings/assistant/models?provider=openai', ADMIN)).body.data as {
      models: { id: string }[];
    };
    expect(openai.models.map((model) => model.id)).toEqual(['gpt-5.1', 'o4-mini', 'gpt-4o']);
    expect((fetchWithTimeout as Mock).mock.calls.at(-1)![1].headers.authorization).toBe('Bearer openai-key');
    // With no provider named, the one in use.
    expect((await request('/settings/assistant/models', ADMIN)).body.data).toMatchObject({ provider: 'anthropic' });
    await ProviderKey.deleteOne({ provider: 'anthropic' });
    resetAssistantSettingsCache();
    expect((await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data).toMatchObject({
      reachable: false,
      models: []
    });
    expect((await request('/settings/assistant/models?provider=nobody', ADMIN)).status).toBe(400);
    restoreFetch();
  });

  it('runs a question with the provider and model that are set when it starts', async () => {
    await enableAnalyst('claude-sonnet-5-5');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId: 'model-question-1' });
    await Settings.updateOne({ _id: 'assistant' }, { $set: { provider: 'openai', model: 'gpt-5.1' } });
    resetAssistantSettingsCache();
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.at(-1)![0]).toMatchObject({ provider: 'openai', model: 'gpt-5.1' });
    expect(await AssistantRun.findOne({ conversationId: id })).toMatchObject({ provider: 'openai', model: 'gpt-5.1' });
  });

  it('does not start questions while the settings have the analyst off', async () => {
    await enableAnalyst('claude-sonnet-5-5');
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId: 'off-question-1' });
    await Settings.updateOne({ _id: 'assistant' }, { $set: { enabled: false } });
    resetAssistantSettingsCache();
    const before = (analyze as Mock).mock.calls.length;
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.length).toBe(before);
    expect((await AssistantRun.findOne({ conversationId: id }))?.state).toBe('queued');
  });
});

describe('the daily token limit', () => {
  const view = async () => (await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>;
  const save = (body: Record<string, unknown>) =>
    putSettings(ADMIN, { enabled: false, provider: 'anthropic', model: '', ...body });

  beforeEach(async () => {
    await makeAdmin();
  });

  it('is saved with the other settings, kept when a save leaves it out, and starts at the default', async () => {
    expect((await view()).dailyTokenLimit).toBe(800000);
    const saved = await save({ dailyTokenLimit: 2000000 });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { data: Record<string, unknown> }).data).toMatchObject({
      dailyTokenLimit: 2000000,
      tokenReservation: 160000,
      source: 'admin'
    });
    // Saving only the switch leaves the limit alone.
    expect((await save({ enabled: false })).status).toBe(200);
    expect((await view()).dailyTokenLimit).toBe(2000000);
    expect((await Settings.findById('assistant').lean())?.dailyTokenLimit).toBe(2000000);
  });

  it('is a whole number of tokens, at least what one question reserves, and not absurdly large', async () => {
    const tooSmall = await save({ dailyTokenLimit: 159999 });
    expect(tooSmall.status).toBe(400);
    expect(((await tooSmall.json()) as { message: string }).message).toContain('at least 160,000 tokens');
    expect((await save({ dailyTokenLimit: 160000 })).status).toBe(200);
    expect((await save({ dailyTokenLimit: 1_000_000_001 })).status).toBe(400);
    expect((await save({ dailyTokenLimit: 1_000_000_000 })).status).toBe(200);
    for (const bad of [1.5, '800000', -5, 0, null, Number.NaN])
      expect((await save({ dailyTokenLimit: bad })).status).toBe(400);
    expect((await view()).dailyTokenLimit).toBe(1_000_000_000);
  });

  it('is applied to the next question: a person who has used most of it is refused, until it is raised', async () => {
    await enableAnalyst('test');
    const day = new Date().toISOString().slice(0, 10);
    await Budget.create({ userId: 'alice', day, reserved: 300000 });
    await Settings.updateOne({ _id: 'assistant' }, { $set: { dailyTokenLimit: 400000 } });
    resetAssistantSettingsCache();
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'First', clientId: 'limit-question-1' });
    const before = (analyze as Mock).mock.calls.length;
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.length).toBe(before);
    const refused = await AssistantRun.findOne({ conversationId: id });
    expect(refused?.state).toBe('failed');
    expect(refused?.error).toContain('daily assistant token budget is used');
    // Nothing was added to what they had used.
    expect((await Budget.findOne({ userId: 'alice', day }))?.reserved).toBe(300000);

    // Raised by an administrator (the analyst stays on).
    await Settings.updateOne({ _id: 'assistant' }, { $set: { dailyTokenLimit: 800000 } });
    resetAssistantSettingsCache();
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Second', clientId: 'limit-question-2' });
    await worker.tick();
    expect((analyze as Mock).mock.calls.length).toBe(before + 1);
  });

  it('refuses a question before charging anything when there is no model or key to answer it', async () => {
    await enableAnalyst('test');
    await ProviderKey.deleteMany({});
    resetAssistantSettingsCache();
    const id = await create('assistant', []);
    // Ready needs a key, so a question is refused when it is sent; one already queued fails at the worker.
    const question = await appendMessage({
      conversationId: id,
      senderId: 'alice',
      senderName: 'Alice',
      kind: 'person',
      body: 'Hello',
      clientId: 'no-key-question'
    });
    await AssistantRun.create({
      conversationId: id,
      messageId: question.id,
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      membershipVersion: 1,
      state: 'queued'
    });
    const worker = startWorker();
    worker();
    await worker.tick();
    const run = await AssistantRun.findOne({ messageId: question.id });
    expect(run?.state).toBe('failed');
    expect(run?.error).toContain('key is configured');
    expect(await Budget.countDocuments()).toBe(0);
  });
});
