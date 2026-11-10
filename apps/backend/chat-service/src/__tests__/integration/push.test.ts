import '../helpers/mocks';
import webpush from 'web-push';
import { vi, type Mock } from 'vitest';
import { Conversation } from '../../models/Conversation';
import { DeploymentSecret } from '../../models/DeploymentSecret';
import { PushSubscription } from '../../models/PushSubscription';
import { notifyNewMessage, previewOf, recipientsOf } from '../../services/pushNotify';
import { MAX_FAILURES, resetPushConfig, sendToUsers } from '../../services/pushService';
import { base, create, request, setupChatTests } from '../helpers/testServer';

vi.mock('web-push', async () => {
  const actual = await vi.importActual<{ default: typeof import('web-push') }>('web-push');
  return { default: { ...actual.default, sendNotification: vi.fn(async () => ({ statusCode: 201 })) } };
});

setupChatTests();

const send = webpush.sendNotification as unknown as Mock;
const ENDPOINT = 'https://push.example.test/send/abc123';
const keys = { p256dh: 'BPublicKeyOfTheBrowser', auth: 'authsecret' };

const api = (path: string, user: string, method: string, body?: unknown) =>
  fetch(`${base}/api/chat${path}`, {
    method,
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ statusCode: 201 });
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

/** A room both people are active in, so a message from alice is unread for bob. */
async function activeRoom() {
  const id = await create('room', ['bob']);
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  return id;
}

describe('signing keys', () => {
  it('makes a pair on first use, with no configuration, and keeps handing out the same one', async () => {
    const first = await request<{ enabled: boolean; publicKey: string }>('/push/config');
    expect(first.body.data.enabled).toBe(true);
    expect(first.body.data.publicKey).toMatch(/^[\w-]{80,}$/);
    resetPushConfig(); // as after a restart
    const again = await request<{ publicKey: string }>('/push/config');
    expect(again.body.data.publicKey).toBe(first.body.data.publicKey);
    expect(await DeploymentSecret.countDocuments()).toBe(1);
  });

  it('seals the private key when an encryption secret is configured', async () => {
    await request('/push/config');
    const stored = await DeploymentSecret.findById('vapid').lean();
    expect(stored?.ciphertext).toBeTruthy();
    expect(stored?.plain).toBeUndefined();
  });

  it('stores the key plainly, and still works, with no encryption secret', async () => {
    const secret = process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    try {
      const first = await request<{ publicKey: string }>('/push/config');
      expect((await DeploymentSecret.findById('vapid').lean())?.plain).toBeTruthy();
      resetPushConfig();
      expect((await request<{ publicKey: string }>('/push/config')).body.data.publicKey).toBe(
        first.body.data.publicKey
      );
    } finally {
      process.env.API_KEY_ENCRYPTION_SECRET = secret;
    }
  });

  it('is unavailable, not crashing, when the saved pair cannot be read', async () => {
    await request('/push/config');
    resetPushConfig();
    const secret = process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET; // sealed key, secret gone
    try {
      const result = await request<{ enabled: boolean; publicKey: string | null }>('/push/config');
      expect(result.status).toBe(200);
      expect(result.body.data).toEqual({ enabled: false, publicKey: null });
    } finally {
      process.env.API_KEY_ENCRYPTION_SECRET = secret;
    }
  });

  it('lets an operator bring their own pair', async () => {
    const own = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = own.publicKey;
    process.env.VAPID_PRIVATE_KEY = own.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:ops@example.test';
    const result = await request<{ publicKey: string }>('/push/config');
    expect(result.body.data.publicKey).toBe(own.publicKey);
    expect(await DeploymentSecret.countDocuments()).toBe(0);
  });

  it('is unavailable when the operator subject is not a mailto: or a URL', async () => {
    process.env.VAPID_SUBJECT = 'not a subject';
    const result = await request<{ enabled: boolean }>('/push/config');
    expect(result.body.data.enabled).toBe(false);
  });
});

describe('subscriptions', () => {
  it('requires a signed-in person', async () => {
    expect((await fetch(`${base}/api/chat/push/config`)).status).toBe(401);
  });

  it('stores a browser, and moves it to the account that registers it next', async () => {
    expect((await api('/push/subscriptions', 'alice', 'POST', { endpoint: ENDPOINT, keys })).status).toBe(200);
    expect((await PushSubscription.findOne({ endpoint: ENDPOINT }))?.userId).toBe('alice');
    const moved = await api('/push/subscriptions', 'bob', 'POST', { endpoint: ENDPOINT, keys, platform: 'Linux' });
    expect(((await moved.json()) as { data: { configured: boolean } }).data.configured).toBe(true);
    expect(await PushSubscription.countDocuments()).toBe(1);
    expect((await PushSubscription.findOne({ endpoint: ENDPOINT }))?.userId).toBe('bob');
  });

  it('forgives earlier failures when a browser registers again', async () => {
    await api('/push/subscriptions', 'alice', 'POST', { endpoint: ENDPOINT, keys });
    await PushSubscription.updateOne({ endpoint: ENDPOINT }, { failureCount: 5 });
    await api('/push/subscriptions', 'alice', 'POST', { endpoint: ENDPOINT, keys });
    expect((await PushSubscription.findOne({ endpoint: ENDPOINT }))?.failureCount).toBe(0);
  });

  it.each([
    ['plain http', 'http://push.example.test/x'],
    ['an IPv4 address', 'https://10.0.0.5/x'],
    ['an IPv6 address', 'https://[::1]/x'],
    ['a docker service name', 'https://auth-service/x'],
    ['an internal name', 'https://vault.internal/x'],
    ['localhost', 'https://localhost/x'],
    ['credentials in the URL', 'https://user:pw@push.example.test/x'],
    ['a string that is not a URL', 'nope']
  ])('refuses %s as an endpoint, so the server cannot be pointed at its own network', async (_name, endpoint) => {
    const response = await api('/push/subscriptions', 'alice', 'POST', { endpoint, keys });
    expect(response.status).toBe(400);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it('reports not configured, and stores nothing, when signing keys are unavailable', async () => {
    process.env.VAPID_SUBJECT = 'not a subject';
    const response = await api('/push/subscriptions', 'alice', 'POST', { endpoint: ENDPOINT, keys });
    expect(((await response.json()) as { data: { configured: boolean } }).data.configured).toBe(false);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it('removes only the caller’s own browser', async () => {
    await api('/push/subscriptions', 'alice', 'POST', { endpoint: ENDPOINT, keys });
    await api('/push/subscriptions', 'bob', 'DELETE', { endpoint: ENDPOINT });
    expect(await PushSubscription.countDocuments()).toBe(1);
    expect((await api('/push/subscriptions', 'alice', 'DELETE', { endpoint: ENDPOINT })).status).toBe(200);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });
});

describe('delivery', () => {
  const payload = { title: 'T', body: 'B', tag: 't', url: '/chat' };

  it('sends to every device of the people named, with a topic that collapses a backlog', async () => {
    await PushSubscription.create([
      { userId: 'bob', endpoint: `${ENDPOINT}1`, keys },
      { userId: 'bob', endpoint: `${ENDPOINT}2`, keys },
      { userId: 'carol', endpoint: `${ENDPOINT}3`, keys }
    ]);
    expect(await sendToUsers(['bob'], payload, { topic: 'abc' })).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][2]).toMatchObject({ topic: 'abc', urgency: 'high' });
    expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: 'T' });
  });

  it('sends nothing to nobody', async () => {
    expect(await sendToUsers([], payload)).toBe(0);
    expect(await sendToUsers(['bob'], payload)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes a subscription the push service says is gone, but keeps one that failed once', async () => {
    await PushSubscription.create([
      { userId: 'bob', endpoint: `${ENDPOINT}gone`, keys },
      { userId: 'bob', endpoint: `${ENDPOINT}flaky`, keys }
    ]);
    send.mockImplementation(async (sub: { endpoint: string }) => {
      throw Object.assign(new Error('x'), { statusCode: sub.endpoint.endsWith('gone') ? 410 : 503 });
    });
    expect(await sendToUsers(['bob'], payload)).toBe(0);
    expect(await PushSubscription.findOne({ endpoint: `${ENDPOINT}gone` })).toBeNull();
    expect((await PushSubscription.findOne({ endpoint: `${ENDPOINT}flaky` }))?.failureCount).toBe(1);
  });

  it('gives up on a subscription that keeps failing, and resets the count on success', async () => {
    await PushSubscription.create([
      { userId: 'bob', endpoint: `${ENDPOINT}dead`, keys, failureCount: MAX_FAILURES - 1 },
      { userId: 'bob', endpoint: `${ENDPOINT}back`, keys, failureCount: 3 }
    ]);
    send.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('dead')) throw Object.assign(new Error('x'), { statusCode: 500 });
      return { statusCode: 201 };
    });
    expect(await sendToUsers(['bob'], payload)).toBe(1);
    expect(await PushSubscription.findOne({ endpoint: `${ENDPOINT}dead` })).toBeNull();
    expect((await PushSubscription.findOne({ endpoint: `${ENDPOINT}back` }))?.failureCount).toBe(0);
  });

  it('drops a row that has no keys instead of failing on it', async () => {
    await PushSubscription.collection.insertOne({ userId: 'bob', endpoint: `${ENDPOINT}bare` });
    expect(await sendToUsers(['bob'], payload)).toBe(0);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });
});

describe('message notifications', () => {
  const message = (conversationId: string, seq: number, body = 'Hello there') => ({
    conversationId,
    senderId: 'alice',
    senderName: 'alice',
    body,
    seq,
    createdAt: new Date()
  });

  const subscribeBob = () => PushSubscription.create({ userId: 'bob', endpoint: ENDPOINT, keys });

  it('buzzes the people who have not read it, never the sender', async () => {
    const id = await activeRoom();
    await subscribeBob();
    await PushSubscription.create({ userId: 'alice', endpoint: `${ENDPOINT}-alice`, keys });
    const conversation = (await Conversation.findById(id))!;
    await notifyNewMessage(conversation, message(id, 5), 0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].endpoint).toBe(ENDPOINT);
    const sent = JSON.parse(send.mock.calls[0][1]);
    expect(sent).toMatchObject({ body: 'Hello there', tag: id, conversationId: id, url: `/chat?conversation=${id}` });
    expect(sent.title).toContain('alice');
    expect(send.mock.calls[0][2].topic).toBe(id);
  });

  it('does not buzz someone who read it while the grace period ran', async () => {
    const id = await activeRoom();
    await subscribeBob();
    const conversation = (await Conversation.findById(id))!;
    await Conversation.updateOne({ _id: id, 'participants.userId': 'bob' }, { $set: { 'participants.$.readSeq': 5 } });
    await notifyNewMessage(conversation, message(id, 5), 0);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not buzz people who have not joined, or when nobody has a device', async () => {
    const id = await create('room', ['bob']); // bob only invited
    await subscribeBob();
    const conversation = (await Conversation.findById(id))!;
    await notifyNewMessage(conversation, message(id, 5), 0);
    expect(send).not.toHaveBeenCalled();
    await PushSubscription.deleteMany({});
    await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
    await notifyNewMessage((await Conversation.findById(id))!, message(id, 5), 0);
    expect(send).not.toHaveBeenCalled();
  });

  it('is silent for the analyst thread and for a conversation deleted meanwhile', async () => {
    const analyst = await create('assistant', []);
    await PushSubscription.create({ userId: 'alice', endpoint: `${ENDPOINT}-alice`, keys });
    await notifyNewMessage((await Conversation.findById(analyst))!, message(analyst, 5), 0);
    const room = await activeRoom();
    await subscribeBob();
    const conversation = (await Conversation.findById(room))!;
    await Conversation.updateOne({ _id: room }, { deletedAt: new Date() });
    await notifyNewMessage(conversation, message(room, 5), 0);
    expect(send).not.toHaveBeenCalled();
  });

  it('never throws, whatever the push service does', async () => {
    const id = await activeRoom();
    await subscribeBob();
    send.mockRejectedValue(new Error('network down'));
    await expect(notifyNewMessage((await Conversation.findById(id))!, message(id, 5), 0)).resolves.toBeUndefined();
    await expect(notifyNewMessage({} as never, message(id, 5), 0)).resolves.toBeUndefined();
  });

  it('is sent after a real message, without making the send wait for it', async () => {
    const id = await activeRoom();
    await subscribeBob();
    const started = Date.now();
    const response = await request(`/conversations/${id}/messages`, 'alice', {
      body: 'Is the run done?',
      clientId: 'push-live-001'
    });
    expect(response.status).toBe(201);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(send).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(JSON.parse(send.mock.calls[0][1]).body).toBe('Is the run done?');
  });

  it('shortens long previews and collapses whitespace', () => {
    expect(previewOf('  a\n\n b  ')).toBe('a b');
    expect(previewOf('x'.repeat(300))).toHaveLength(140);
    expect(previewOf('   ')).toBe('New message');
  });

  it('counts a room only from when someone joined it', () => {
    const participants = [
      { userId: 'alice', state: 'active', readSeq: 0, joinedSeq: 0 },
      { userId: 'late', state: 'active', readSeq: 0, joinedSeq: 9 },
      { userId: 'gone', state: 'left', readSeq: 0, joinedSeq: 0 }
    ] as never;
    expect(recipientsOf({ participants }, 'alice', 5)).toEqual([]);
    expect(recipientsOf({ participants }, 'x', 10)).toEqual(['alice', 'late']);
  });
});

describe('unread', () => {
  it('says how many conversations are unread, and whether the one named still is', async () => {
    const id = await activeRoom();
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Hi', clientId: 'unread-0001' });
    const unread = await request<{ unread: number; fresh: boolean }>(`/push/unread?conversation=${id}`, 'bob');
    expect(unread.body.data).toEqual({ unread: 1, fresh: true });
    const conversation = (await Conversation.findById(id))!;
    await request(`/conversations/${id}/read`, 'bob', { seq: conversation.seq });
    const read = await request<{ unread: number; fresh: boolean }>(`/push/unread?conversation=${id}`, 'bob');
    expect(read.body.data).toEqual({ unread: 0, fresh: false });
    // Alice has not read "bob joined"; her own message is not unread for her.
    const total = await request<{ unread: number; fresh?: boolean }>('/push/unread', 'alice');
    expect(total.body.data).toEqual({ unread: 1 });
    await request(`/conversations/${id}/read`, 'alice', { seq: conversation.seq });
    expect((await request('/push/unread', 'alice')).body.data).toEqual({ unread: 0 });
  });

  it('treats a conversation the person is not in as already read, and refuses a bad id', async () => {
    const id = await activeRoom();
    expect((await request<{ fresh: boolean }>(`/push/unread?conversation=${id}`, 'mallory')).body.data.fresh).toBe(false);
    expect((await request('/push/unread?conversation=nope', 'bob')).status).toBe(400);
  });
});
