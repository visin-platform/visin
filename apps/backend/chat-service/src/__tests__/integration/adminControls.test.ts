import { vi } from 'vitest';
import mongoose from 'mongoose';
import { setupChatTests, request } from '../helpers/testServer';
import { makeAdmin, ADMIN } from '../helpers/analystFixtures';
import { AdminPolicy } from '../../models/AdminPolicy';
import { ProviderUsage } from '../../models/ProviderUsage';
import { AssistantRun } from '../../models/AssistantRun';
import { Settings } from '../../models/Settings';
import { Assistant } from '../../models/Assistant';
import { forgetPlatformAssistant, platformAssistantPublic } from '../../services/assistantProfiles';
import { defaultPolicy, effectivePolicy } from '../../services/adminPolicy';
import { saveAssistantSettings } from '../../services/settings';
setupChatTests();
beforeEach(async () => {
  await makeAdmin();
  await AdminPolicy.deleteMany({});
  await ProviderUsage.deleteMany({});
});
const edit = (revision = 0, settings = defaultPolicy) => ({ revision, reason: 'Review operating allowance', settings });
it('protects policies and run reports from ordinary users', async () => {
  expect((await request('/admin/policies', 'alice')).status).toBe(403);
  expect((await request('/admin/runs', 'alice')).status).toBe(403);
  const result = await request('/admin/policies', ADMIN);
  expect(result.body.data).toMatchObject({ revision: 0, settings: { guestEnabled: false } });
});
it('revises policies atomically and keeps safe before/after history', async () => {
  const responses = await Promise.all([
    request('/admin/policies', ADMIN, edit(), 'PUT'),
    request('/admin/policies', ADMIN, edit(), 'PUT')
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await request('/admin/policies', ADMIN, edit(), 'PUT')).status).toBe(409);
  const doc = await AdminPolicy.findById('global');
  expect(doc?.history).toHaveLength(1);
});
it('stores only what a user policy overrides, so later global changes still reach that account', async () => {
  const id = '222222222222222222222222';
  expect((await request(`/admin/policies/${id}`, ADMIN)).body.data).toMatchObject({
    settings: {},
    inherited: { dailyRequestLimit: 100 },
    effective: { dailyRequestLimit: 100 }
  });
  const saved = await request(`/admin/policies/${id}`, ADMIN, edit(0, { dailyRequestLimit: 2 } as never), 'PUT');
  expect(saved.status).toBe(200);
  expect(saved.body.data).toMatchObject({ revision: 1, settings: { dailyRequestLimit: 2 } });
  expect((await AdminPolicy.findById(id).lean())?.settings).toEqual({ dailyRequestLimit: 2 });
  // Guest settings are platform-wide: an account override cannot carry them.
  expect(
    (await request(`/admin/policies/${id}`, ADMIN, edit(1, { guestEnabled: true } as never), 'PUT')).status
  ).toBe(400);
  await AdminPolicy.create({ _id: 'global', settings: { ...defaultPolicy, enabled: false, dailyTokenLimit: 5000 } });
  const effective = await effectivePolicy(id);
  expect(effective).toMatchObject({ enabled: false, dailyRequestLimit: 2, dailyTokenLimit: 5000 });
  // An override saved whole, before overrides were partial, keeps its account settings but never its guest ones.
  await AdminPolicy.updateOne({ _id: id }, { $set: { settings: { ...defaultPolicy, guestEnabled: true } } });
  expect(await effectivePolicy(id)).toMatchObject({ guestEnabled: false, dailyTokenLimit: 800000 });
});
it('saves a policy with no reason, and keeps one when it is given', async () => {
  const bare = await request('/admin/policies', ADMIN, { revision: 0, settings: { ...defaultPolicy, dailyRequestLimit: 7 } }, 'PUT');
  expect(bare.status).toBe(200);
  const noted = await request('/admin/policies', ADMIN, { ...edit(1, { ...defaultPolicy, dailyRequestLimit: 8 }), reason: '  Busy week  ' }, 'PUT');
  expect(noted.status).toBe(200);
  expect((noted.body.data as { history: { reason: string }[] }).history.map((h) => h.reason)).toEqual(['', 'Busy week']);
});
it('rejects invalid identifiers, over-long reasons and unsafe guest enablement', async () => {
  expect((await request('/admin/policies/not-an-id', ADMIN)).status).toBe(400);
  expect((await request('/admin/policies/not-an-id', ADMIN, edit(), 'PUT')).status).toBe(400);
  expect((await request('/admin/policies', ADMIN, { ...edit(), reason: 'x'.repeat(301) }, 'PUT')).status).toBe(400);
  expect(
    (await request('/admin/policies', ADMIN, edit(0, { ...defaultPolicy, guestEnabled: true }), 'PUT')).status
  ).toBe(400);
});
it('says exactly what is missing when anonymous access cannot be turned on', async () => {
  const saved = { ...process.env };
  try {
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.GUEST_NETWORK_SECRET = 'too short';
    const refused = await request('/admin/policies', ADMIN, edit(0, { ...defaultPolicy, guestEnabled: true }), 'PUT');
    expect(refused.status).toBe(400);
    const message = String(refused.body.message);
    expect(message).toContain('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY');
    expect(message).toContain('GUEST_NETWORK_SECRET of at least 32 characters');
    expect(message).toContain('a daily spend ceiling above zero');
    expect(message).toContain('a monthly spend ceiling above zero');
    // What the deployment has is reported for the page's checklist, without any value.
    const read = await request('/admin/policies', ADMIN);
    expect(read.body.data.guestSetup).toMatchObject({ botCheck: false, networkSecret: false });
    expect(JSON.stringify(read.body.data.guestSetup)).not.toContain('too short');
  } finally {
    Object.assign(process.env, saved);
  }
});
it('reports measured, unpriced and uncertain attempts and cancels active runs', async () => {
  const run = await AssistantRun.create({
    userId: ADMIN,
    email: 'admin@example.test',
    name: 'Admin',
    conversationId: 'c',
    messageId: 'm',
    state: 'queued'
  });
  await ProviderUsage.create([
    {
      runId: run.id,
      userId: ADMIN,
      provider: 'anthropic',
      model: 'test',
      state: 'completed',
      inputTokens: 100,
      outputTokens: 20
    },
    { runId: run.id, userId: ADMIN, provider: 'anthropic', model: 'test', state: 'pending' }
  ]);
  const result = await request(`/admin/runs?userId=${ADMIN}&days=7`, ADMIN);
  expect(result.status).toBe(200);
  expect(result.body.data).toMatchObject({ usage: [{ calls: 2, inputTokens: 100, uncertain: 1, unpriced: 1 }] });
  expect((await request(`/admin/runs/${run.id}/cancel`, ADMIN, {})).status).toBe(200);
  expect(await AssistantRun.findById(run.id).lean()).toMatchObject({ state: 'cancelled' });
  expect((await request(`/admin/runs/${run.id}/cancel`, ADMIN, {})).status).toBe(404);
  expect((await request('/admin/runs/not-an-id/cancel', ADMIN, {})).status).toBe(400);
  expect((await request('/admin/runs?days=invalid', ADMIN)).status).toBe(400);
});
it('checks actual account state and per-user access before paid work', async () => {
  const { assertViviUser } =
    await vi.importActual<typeof import('../../services/adminPolicy')>('../../services/adminPolicy');
  const id = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('users').insertOne({ _id: id, status: 'active' });
  expect((await assertViviUser(id.toHexString())).enabled).toBe(true);
  await AdminPolicy.create({ _id: id.toHexString(), settings: { ...defaultPolicy, enabled: false } });
  await expect(assertViviUser(id.toHexString())).rejects.toThrow('disabled');
  await mongoose.connection.collection('users').updateOne({ _id: id }, { $set: { status: 'suspended' } });
  await expect(assertViviUser(id.toHexString())).rejects.toThrow('not active');
  await expect(assertViviUser('invalid')).rejects.toThrow('not active');
});
it('keeps provider setting revisions and rejects stale edits', async () => {
  const settings = {
    enabled: false,
    provider: 'anthropic' as const,
    model: '',
    dailyTokenLimit: 800000,
    toolRounds: 8
  };
  await saveAssistantSettings(settings, ADMIN, 0);
  await expect(saveAssistantSettings(settings, ADMIN, 0)).rejects.toThrow('changed');
  await saveAssistantSettings(settings, ADMIN, 1);
  const doc = await Settings.findById('assistant');
  expect(doc?.revision).toBe(2);
  expect(doc?.history).toHaveLength(2);
});

describe("the platform assistant's profile", () => {
  beforeEach(async () => {
    await Assistant.deleteMany({});
    await mongoose.connection.collection('users').deleteMany({ kind: 'assistant' });
    forgetPlatformAssistant();
  });
  const profile = (over: Record<string, unknown> = {}) => ({
    name: 'Vivi',
    handle: 'vivi',
    bio: 'Visin research assistant',
    public: true,
    ...over
  });

  it('is for administrators only, and says when there is no platform assistant yet', async () => {
    expect((await request('/admin/profile', 'alice')).status).toBe(403);
    const missing = await request('/admin/profile', ADMIN);
    expect(missing.status).toBe(404);
    expect(String(missing.body.message)).toMatch(/No platform assistant/);
  });

  it("lets any administrator rename it and publish its page, whoever created it, and visitors see it at once", async () => {
    await Assistant.create({ name: 'Old name', createdBy: 'someone-else', published: false, platformDefault: true });
    const saved = await request('/admin/profile', ADMIN, profile({ name: 'Vivi' }), 'PUT');
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ name: 'Vivi', handle: 'vivi', bio: 'Visin research assistant', public: true });
    expect((await request('/admin/profile', ADMIN)).body.data).toMatchObject({ name: 'Vivi', public: true });
    const identity = await mongoose.connection.collection('users').findOne({ kind: 'assistant' });
    expect(identity).toMatchObject({ handle: 'vivi', firstName: 'Vivi', profilePublic: true });
    expect(await platformAssistantPublic()).toEqual({ name: 'Vivi', handle: 'vivi' });
  });

  it('refuses a reserved or taken handle, and a missing name', async () => {
    await Assistant.create({ name: 'Vivi', createdBy: 'x', platformDefault: true });
    expect((await request('/admin/profile', ADMIN, profile({ handle: 'admin' }), 'PUT')).status).toBe(400);
    expect((await request('/admin/profile', ADMIN, profile({ name: ' ' }), 'PUT')).status).toBe(400);
    await mongoose.connection.collection('users').insertOne({ handle: 'taken', email: 'h@example.test' });
    expect((await request('/admin/profile', ADMIN, profile({ handle: 'taken' }), 'PUT')).status).toBe(409);
  });
});
