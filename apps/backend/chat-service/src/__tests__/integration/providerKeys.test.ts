import '../helpers/mocks';
import { fetchWithTimeout } from '@visin/backend-core';
import { vi, type Mock } from 'vitest';
import { AssistantRun } from '../../models/AssistantRun';
import { ProviderKey } from '../../models/ProviderKey';
import { analyze } from '../../services/analyst';
import { resetProviderKeyCache } from '../../services/keys';
import { resetAssistantSettingsCache } from '../../services/settings';
import { startWorker } from '../../services/worker';
import { ADMIN, makeAdmin, putSettings, restoreFetch, saveKey, saveKeys } from '../helpers/analystFixtures';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

describe('provider keys', () => {
  const GOOD = 'sk-test-good-key-1234';
  const putKey = (user: string, provider: string, body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/keys/${provider}`, {
      method: 'PUT',
      headers: { 'x-test-user': user, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const deleteKey = (user: string, provider: string) =>
    fetch(`${base}/api/chat/settings/assistant/keys/${provider}`, {
      method: 'DELETE',
      headers: { 'x-test-user': user }
    });
  const view = async () => (await request('/settings/assistant', ADMIN)).body.data as Record<string, unknown>;
  const providers = async () => (await view()).providers as Record<string, unknown>[];
  /** The provider accepts only GOOD, whichever header it came in. */
  const acceptsOnly = (key: string) =>
    (fetchWithTimeout as Mock).mockImplementation(async function (
      _url: string,
      init?: { headers?: Record<string, string> }
    ) {
      const presented = init?.headers?.['x-api-key'] ?? init?.headers?.authorization?.replace('Bearer ', '');
      return presented === key
        ? new Response(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Opus' }] }))
        : new Response('invalid key', { status: 401 });
    });

  beforeEach(async () => {
    await makeAdmin();
    acceptsOnly(GOOD);
  });
  afterEach(restoreFetch);

  it('lets only administrators save or remove a key', async () => {
    for (const user of ['alice', '555555555555555555555555']) {
      expect((await putKey(user, 'anthropic', { key: GOOD })).status).toBe(403);
      expect((await deleteKey(user, 'anthropic')).status).toBe(403);
    }
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('keeps a key the provider accepts, encrypted, and shows only where it came from and its last characters', async () => {
    const saved = await putKey(ADMIN, 'anthropic', { key: GOOD });
    expect(saved.status).toBe(200);
    const body = await saved.text();
    expect(body).not.toContain(GOOD);
    expect(JSON.parse(body).data.providers[0]).toEqual({
      id: 'anthropic',
      name: 'Anthropic',
      keyConfigured: true,
      keyHint: '1234'
    });
    const record = await ProviderKey.findOne({ provider: 'anthropic' }).lean();
    expect(record?.owner).toBe('deployment');
    expect(JSON.stringify(record)).not.toContain(GOOD);
    expect(record?.ciphertext).toBeTruthy();
    expect(JSON.stringify(await view())).not.toContain(GOOD);
  });

  it('refuses a key the provider does not accept, without keeping it or repeating it', async () => {
    const refused = await putKey(ADMIN, 'anthropic', { key: 'sk-test-wrong-key-9999' });
    expect(refused.status).toBe(400);
    const text = await refused.text();
    expect(text).toContain('Anthropic did not accept this key');
    expect(text).not.toContain('wrong-key');
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('refuses what is plainly not a key, without echoing it', async () => {
    for (const key of ['short', 'has a space in it', 'x'.repeat(501), '']) {
      const response = await putKey(ADMIN, 'anthropic', { key });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(key || 'never-empty');
    }
    expect((await putKey(ADMIN, 'anthropic', {})).status).toBe(400);
    expect((await putKey(ADMIN, 'anthropic', { key: GOOD, extra: 1 })).status).toBe(400);
    expect((await putKey(ADMIN, 'nobody', { key: GOOD })).status).toBe(400);
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('cannot save a key until the server can encrypt it', async () => {
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    const response = await putKey(ADMIN, 'anthropic', { key: GOOD });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('API_KEY_ENCRYPTION_SECRET');
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('reports the provider being unreachable as that, not as a bad key', async () => {
    (fetchWithTimeout as Mock).mockRejectedValue(new Error('socket hang up'));
    expect((await putKey(ADMIN, 'anthropic', { key: GOOD })).status).toBe(502);
    expect(await ProviderKey.countDocuments()).toBe(0);
  });

  it('uses the saved key to list models and to answer', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    (fetchWithTimeout as Mock).mockClear();
    const models = (await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data;
    expect(models).toMatchObject({ reachable: true });
    expect((fetchWithTimeout as Mock).mock.calls[0][1].headers['x-api-key']).toBe(GOOD);

    const put = await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(put.status).toBe(200);
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId: 'saved-key-question' });
    const worker = startWorker();
    worker();
    await worker.tick();
    expect((analyze as Mock).mock.calls.at(-1)![0]).toMatchObject({ provider: 'anthropic', apiKey: GOOD });
    // The key is used for the call and never kept with the run.
    expect(JSON.stringify(await AssistantRun.findOne({ conversationId: id }).lean())).not.toContain(GOOD);
  });

  it('makes a provider ready that has only a saved key, and not ready again once it is removed', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    expect((await putSettings(ADMIN, { enabled: true, provider: 'anthropic', model: 'claude-opus-5-5' })).status).toBe(
      200
    );
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(true);
    const removed = await deleteKey(ADMIN, 'anthropic');
    expect(removed.status).toBe(200);
    expect(
      ((await removed.json()) as { data: { providers: Record<string, unknown>[] } }).data.providers[0]
    ).toMatchObject({
      keyConfigured: false,
      keyHint: null
    });
    expect(await ProviderKey.countDocuments()).toBe(0);
    expect((await request('/capabilities', 'alice')).body.data.assistant).toBe(false);
  });

  it('replaces the key for a provider rather than adding another, and keeps the providers apart', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    acceptsOnly('sk-test-second-key-5678');
    await putKey(ADMIN, 'anthropic', { key: 'sk-test-second-key-5678' });
    expect(await ProviderKey.countDocuments({ provider: 'anthropic' })).toBe(1);
    expect((await providers())[0]).toMatchObject({ keyHint: '5678' });
    expect((await providers())[1]).toMatchObject({ id: 'openai', keyConfigured: false });
  });

  it('treats a saved key it can no longer decrypt as no key, so it can be added again', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    await ProviderKey.updateOne({ provider: 'anthropic' }, { $set: { tag: Buffer.alloc(16).toString('base64') } });
    resetAssistantSettingsCache();
    expect((await providers())[0]).toMatchObject({ keyConfigured: false, keyHint: null });
    expect((await putKey(ADMIN, 'anthropic', { key: GOOD })).status).toBe(200);
    expect((await providers())[0]).toMatchObject({ keyConfigured: true, keyHint: '1234' });
  });

  it('treats a saved key as none while the encryption secret is missing, rather than failing', async () => {
    await putKey(ADMIN, 'anthropic', { key: GOOD });
    const secret = process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    try {
      resetAssistantSettingsCache();
      expect((await providers())[0]).toMatchObject({ keyConfigured: false, keyHint: null });
    } finally {
      process.env.API_KEY_ENCRYPTION_SECRET = secret;
      resetAssistantSettingsCache();
    }
    expect((await providers())[0]).toMatchObject({ keyConfigured: true, keyHint: '1234' });
  });

  it('never reads a provider key from the environment', async () => {
    process.env.ANTHROPIC_API_KEY = 'from-the-environment';
    process.env.OPENAI_API_KEY = 'from-the-environment';
    try {
      resetAssistantSettingsCache();
      expect((await providers()).map((provider) => provider.keyConfigured)).toEqual([false, false]);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
    }
  });
});

describe('model listing and key decryption', () => {
  it('asks the provider once for callers that arrive together, and reuses the answer', async () => {
    await makeAdmin();
    await saveKeys();
    let release: (value: Response) => void = () => undefined;
    (fetchWithTimeout as Mock).mockImplementation(function () {
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    (fetchWithTimeout as Mock).mockClear();
    const both = Promise.all([
      request('/settings/assistant/models?provider=anthropic', ADMIN),
      request('/settings/assistant/models?provider=anthropic', ADMIN)
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release(new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-5-5', display_name: 'Sonnet' }] })));
    const [first, second] = await both;
    expect(first.body.data).toMatchObject({ recommended: 'claude-sonnet-5-5' });
    expect(second.body.data).toEqual(first.body.data);
    expect((await request('/settings/assistant/models?provider=anthropic', ADMIN)).body.data).toEqual(first.body.data);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    restoreFetch();
  });

  it('reports a saved key that no longer decrypts once, not on every use', async () => {
    const { logger } = (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')) as {
      logger: { error: (...args: unknown[]) => void };
    };
    const error = vi.spyOn(logger, 'error').mockImplementation(function () {
      return undefined;
    });
    await ProviderKey.create({
      owner: 'deployment',
      provider: 'anthropic',
      ciphertext: 'bm90LWEta2V5',
      iv: Buffer.alloc(12).toString('base64'),
      tag: Buffer.alloc(16).toString('base64')
    });
    for (let i = 0; i < 5; i++) {
      // As each new cache period would: the record is read and decrypted again.
      resetProviderKeyCache();
      expect((await request('/capabilities', 'alice')).status).toBe(200);
    }
    expect(error.mock.calls.filter((call) => String(call[0]).includes('could not be decrypted'))).toHaveLength(1);
    error.mockRestore();
  });
});

it("does not keep a replaced key's models, even when their listing finishes after the change", async () => {
  await makeAdmin();
  const releases: ((value: Response) => void)[] = [];
  (fetchWithTimeout as Mock).mockImplementation(function () {
    return new Promise<Response>((resolve) => releases.push(resolve));
  });
  const listed = (id: string) => new Response(JSON.stringify({ data: [{ id, display_name: id }] }));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
  await saveKey('anthropic', 'old-key');
  // A listing with the old key is under way…
  const slow = request('/settings/assistant/models?provider=anthropic', ADMIN);
  await tick();
  // …when a new key is saved (it is checked by listing models directly, not through the cache).
  const save = fetch(`${base}/api/chat/settings/assistant/keys/anthropic`, {
    method: 'PUT',
    headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'sk-new-key-12345' })
  });
  await tick();
  releases[1](listed('claude-new'));
  expect((await save).status).toBe(200);
  // The old listing finishes last.
  releases[0](listed('claude-old'));
  expect(((await slow).body.data as { models: { id: string }[] }).models.map((m) => m.id)).toEqual(['claude-old']);
  // The next one asks again, with the new key, rather than serving the old key's answer.
  const next = request('/settings/assistant/models?provider=anthropic', ADMIN);
  await tick();
  expect(releases).toHaveLength(3);
  releases[2](listed('claude-new'));
  expect(((await next).body.data as { models: { id: string }[] }).models.map((m) => m.id)).toEqual(['claude-new']);
  restoreFetch();
});
