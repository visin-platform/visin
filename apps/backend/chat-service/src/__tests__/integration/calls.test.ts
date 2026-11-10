import '../helpers/mocks';
import { createHmac } from 'node:crypto';
import { fetchWithTimeout } from '@visin/backend-core';
import webpush from 'web-push';
import { vi, type Mock } from 'vitest';
import { Call } from '../../models/Call';
import { CallSignal } from '../../models/CallSignal';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { PushSubscription } from '../../models/PushSubscription';
import { CallFeed } from '../../services/callFeed';
import { DROP_GRACE_MS, RING_TIMEOUT_MS, finishIfLive, formatDuration, sweepCalls } from '../../services/callService';
import { base, create, request, setupChatTests } from '../helpers/testServer';

vi.mock('web-push', async () => {
  const actual = await vi.importActual<{ default: typeof import('web-push') }>('web-push');
  return { default: { ...actual.default, sendNotification: vi.fn(async () => ({ statusCode: 201 })) } };
});

setupChatTests();

const send = webpush.sendNotification as unknown as Mock;
const A = 'alice-device-1';
const B = 'bob-device-001';
const ICE_ENV = ['STUN_URLS', 'TURN_URLS', 'TURN_SECRET', 'CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN', 'CALLS_ENABLED'];

const post = (path: string, user: string, body?: unknown) =>
  fetch(`${base}/api/chat${path}`, {
    method: 'POST',
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
const json = async <T = Record<string, unknown>>(response: Response) => (await response.json()) as { data: T; message?: string };

beforeEach(() => {
  for (const key of ICE_ENV) delete process.env[key];
  send.mockReset();
  send.mockResolvedValue({ statusCode: 201 });
});

/** A direct message both people are active in. */
async function dm(handle = 'bob', as = 'alice') {
  const id = String((await request<{ _id: string }>('/conversations', as, { kind: 'direct', title: 'Chat', handles: [handle] })).body.data._id);
  await request(`/conversations/${id}/membership`, handle, { action: 'accept' });
  return id;
}
const ring = async (conversationId: string, user = 'alice', device = A) => post(`/conversations/${conversationId}/calls`, user, { deviceId: device });
const answered = async () => {
  const id = await dm();
  const call = (await json<{ id: string }>(await ring(id))).data;
  expect((await post(`/calls/${call.id}/accept`, 'bob', { deviceId: B })).status).toBe(200);
  return { conversation: id, call: call.id };
};
const lastLine = async (conversationId: string) =>
  (await Message.findOne({ conversationId, senderId: 'system:call' }).sort({ seq: -1 }))?.body;

describe('what this server can do', () => {
  it('reports no relay on a fresh install, and calls on', async () => {
    const config = await request<{ enabled: boolean; mode: string; relay: boolean }>('/calls/config');
    expect(config.body.data).toEqual({ enabled: true, mode: 'local', relay: false });
  });

  it('names each tier it is set up for', async () => {
    process.env.STUN_URLS = 'stun:stun.example.test:3478';
    expect((await request<{ mode: string }>('/calls/config')).body.data.mode).toBe('stun');
    process.env.TURN_URLS = 'turn:turn.example.test:3478';
    process.env.TURN_SECRET = 'shared';
    expect((await request<{ mode: string; relay: boolean }>('/calls/config')).body.data).toMatchObject({ mode: 'turn', relay: true });
    process.env.CLOUDFLARE_TURN_KEY_ID = 'key';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 'token';
    expect((await request<{ mode: string }>('/calls/config')).body.data.mode).toBe('cloudflare');
  });

  it('hands out nothing but host candidates when nothing is configured', async () => {
    const ice = (await request<{ iceServers: unknown[]; relay: boolean; mode: string }>('/calls/ice-servers')).body.data;
    expect(ice).toMatchObject({ iceServers: [], relay: false, mode: 'local' });
  });

  it('hands out only the STUN servers the operator named, never a built-in one', async () => {
    process.env.STUN_URLS = 'stun:a.example.test:3478, stun:b.example.test:3478';
    const ice = (await request<{ iceServers: { urls: string[] }[]; mode: string }>('/calls/ice-servers')).body.data;
    expect(ice.mode).toBe('stun');
    expect(ice.iceServers).toEqual([{ urls: ['stun:a.example.test:3478', 'stun:b.example.test:3478'] }]);
  });

  it('mints coturn shared-secret credentials that the relay will accept', async () => {
    process.env.TURN_URLS = 'turn:turn.example.test:3478?transport=udp,turns:turn.example.test:5349';
    process.env.TURN_SECRET = 'relay-secret';
    process.env.STUN_URLS = 'stun:turn.example.test:3478';
    const ice = (await request<{ iceServers: { urls: string[]; username?: string; credential?: string }[]; relay: boolean; expiresAt: string }>('/calls/ice-servers')).body.data;
    expect(ice.relay).toBe(true);
    const relay = ice.iceServers.find((server) => server.username)!;
    expect(relay.urls).toEqual(['turn:turn.example.test:3478?transport=udp', 'turns:turn.example.test:5349']);
    expect(relay.credential).toBe(createHmac('sha1', 'relay-secret').update(relay.username!).digest('base64'));
    expect(Number(relay.username!.split(':')[0])).toBeGreaterThan(Date.now() / 1000 + 3600);
    expect(Date.parse(ice.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('prefers Cloudflare, drops the port browsers block, and never exposes its token', async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = 'key-id';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 'secret-token';
    (fetchWithTimeout as Mock).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          iceServers: [
            { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
            { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53'], username: 'u', credential: 'c' }
          ]
        })
      )
    );
    const response = await request<{ iceServers: { urls: string[] }[]; mode: string }>('/calls/ice-servers');
    expect(response.body.data.mode).toBe('cloudflare');
    expect(JSON.stringify(response.body)).not.toContain('secret-token');
    expect(response.body.data.iceServers.flatMap((server) => server.urls).some((url) => url.endsWith(':53'))).toBe(false);
    const [url, init] = (fetchWithTimeout as Mock).mock.calls.at(-1)!;
    expect(url).toContain('/turn/keys/key-id/credentials/generate-ice-servers');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
  });

  it.each([
    ['answers an error', () => new Response('no', { status: 500 })],
    ['answers without credentials', () => new Response(JSON.stringify({ iceServers: [{ urls: 'stun:x.example.test' }] }))]
  ])('falls back to the next tier when Cloudflare %s', async (_name, answer) => {
    process.env.CLOUDFLARE_TURN_KEY_ID = 'k';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 't';
    process.env.STUN_URLS = 'stun:fallback.example.test:3478';
    (fetchWithTimeout as Mock).mockResolvedValueOnce(answer());
    const ice = (await request<{ mode: string; relay: boolean }>('/calls/ice-servers')).body.data;
    expect(ice).toMatchObject({ mode: 'stun', relay: false });
  });

  it('falls back to the operator’s own relay when Cloudflare is unreachable', async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = 'k';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 't';
    process.env.TURN_URLS = 'turn:turn.example.test:3478';
    process.env.TURN_SECRET = 's';
    (fetchWithTimeout as Mock).mockRejectedValueOnce(new Error('timeout'));
    expect((await request<{ mode: string }>('/calls/ice-servers')).body.data.mode).toBe('turn');
  });

  it('can be turned off, and then behaves as if calls did not exist', async () => {
    process.env.CALLS_ENABLED = 'false';
    expect((await request<{ enabled: boolean }>('/calls/config')).body.data.enabled).toBe(false);
    expect((await request('/calls/ice-servers')).status).toBe(404);
    expect((await request('/calls/current')).status).toBe(404);
    const id = await dm();
    expect((await ring(id)).status).toBe(404);
    const stream = await fetch(`${base}/api/chat/events?device=${A}`, { headers: { 'x-test-user': 'alice' } });
    expect(stream.status).toBe(404);
  });

  it('requires a signed-in person', async () => {
    expect((await fetch(`${base}/api/chat/calls/config`)).status).toBe(401);
  });
});

describe('placing a call', () => {
  it('rings the other person and describes the call', async () => {
    const id = await dm();
    const response = await ring(id);
    expect(response.status).toBe(201);
    const call = (await json<Record<string, unknown>>(response)).data;
    expect(call).toMatchObject({
      conversationId: id,
      status: 'ringing',
      callerDeviceId: A,
      caller: { userId: 'alice', name: 'alice' },
      callees: [{ userId: 'bob' }],
      answeredBy: null
    });
    // Both can see it is live, and a stranger cannot.
    expect((await request<{ id: string } | null>('/calls/current', 'bob')).body.data).toMatchObject({ id: call.id });
    expect((await request('/calls/current', 'alice')).body.data).toMatchObject({ id: call.id });
    expect((await request('/calls/current', 'mallory')).body.data).toBeNull();
  });

  it('only for two people in a direct message that both have joined', async () => {
    const room = await create('room', ['bob']);
    expect((await ring(room)).status).toBe(400);
    const analyst = await create('assistant', []);
    expect((await ring(analyst)).status).toBe(400);
    const pending = String((await request<{ _id: string }>('/conversations', 'alice', { kind: 'direct', title: 'x', handles: ['bob'] })).body.data._id);
    const response = await ring(pending);
    expect(response.status).toBe(400);
    expect((await json(response)).message).toContain('accepted');
  });

  it('is invisible to people outside the conversation', async () => {
    const id = await dm();
    expect((await ring(id, 'mallory')).status).toBe(404);
    expect(await Call.countDocuments()).toBe(0);
  });

  it('checks the device id', async () => {
    const id = await dm();
    expect((await post(`/conversations/${id}/calls`, 'alice', { deviceId: 'x' })).status).toBe(400);
    expect((await post(`/conversations/${id}/calls`, 'alice', {})).status).toBe(400);
  });

  it('says who is busy, for either side', async () => {
    const first = await dm();
    await ring(first);
    const mine = await ring(first);
    expect(mine.status).toBe(409);
    expect((await json(mine)).message).toBe('You are already in a call');
    // Carol calls alice, who is already ringing bob: alice is the one who is busy.
    const other = String((await request<{ _id: string }>('/conversations', 'carol', { kind: 'direct', title: 'x', handles: ['alice'] })).body.data._id);
    await request(`/conversations/${other}/membership`, 'alice', { action: 'accept' });
    const busy = await ring(other, 'carol', 'carol-device1');
    expect(busy.status).toBe(409);
    expect((await json(busy)).message).toBe('alice is on another call');
  });

  it('lets exactly one of two people calling each other at the same moment through', async () => {
    const id = await dm();
    const results = await Promise.all([ring(id, 'alice', A), ring(id, 'bob', B)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Call.countDocuments({ live: true })).toBe(1);
  });

  it('frees both people when it ends, so they can call again', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    await post(`/calls/${call.id}/end`, 'alice');
    expect((await ring(id, 'bob', B)).status).toBe(201);
  });
});

describe('answering and hanging up', () => {
  it('connects the call on the device that answered, and writes its length into the thread', async () => {
    const { conversation, call } = await answered();
    const live = await Call.findById(call);
    expect(live).toMatchObject({ status: 'active', answeredBy: 'bob', answeredDeviceId: B });
    await Call.updateOne({ _id: call }, { answeredAt: new Date(Date.now() - 125_000) });
    const ended = await post(`/calls/${call}/end`, 'bob');
    expect((await json<{ status: string; endReason: string }>(ended)).data).toMatchObject({ status: 'ended', endReason: 'hangup' });
    expect(await lastLine(conversation)).toBe('Call, 2 min');
    expect((await Call.findById(call))?.live).toBeUndefined();
  });

  it('only the person called can answer', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    expect((await post(`/calls/${call.id}/accept`, 'alice', { deviceId: A })).status).toBe(400);
    expect((await post(`/calls/${call.id}/accept`, 'mallory', { deviceId: 'mallory-dev-1' })).status).toBe(404);
  });

  it('gives a call to the first device to answer, and tells the second', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    const [one, two] = await Promise.all([
      post(`/calls/${call.id}/accept`, 'bob', { deviceId: 'bob-phone-001' }),
      post(`/calls/${call.id}/accept`, 'bob', { deviceId: 'bob-laptop-01' })
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const loser = one.status === 409 ? one : two;
    expect((await json(loser)).message).toBe('Answered on another device');
  });

  it('cannot answer a call that has ended', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    await post(`/calls/${call.id}/end`, 'alice');
    const response = await post(`/calls/${call.id}/accept`, 'bob', { deviceId: B });
    expect(response.status).toBe(409);
    expect((await json(response)).message).toBe('The call has already ended');
  });

  it('records a decline, and the caller giving up, differently', async () => {
    const id = await dm();
    const declined = (await json<{ id: string }>(await ring(id))).data;
    expect((await post(`/calls/${declined.id}/decline`, 'bob')).status).toBe(200);
    expect((await Call.findById(declined.id))?.endReason).toBe('declined');
    expect(await lastLine(id)).toBe('Call declined');
    const cancelled = (await json<{ id: string }>(await ring(id, 'bob', B))).data;
    await post(`/calls/${cancelled.id}/end`, 'bob');
    expect((await Call.findById(cancelled.id))?.endReason).toBe('cancelled');
    expect(await lastLine(id)).toBe('Missed call from bob');
    // The caller cannot "decline" their own call; the callee ending it before an answer is a decline.
    const again = (await json<{ id: string }>(await ring(id))).data;
    expect((await post(`/calls/${again.id}/decline`, 'alice')).status).toBe(400);
    await post(`/calls/${again.id}/end`, 'bob');
    expect((await Call.findById(again.id))?.endReason).toBe('declined');
  });

  it('ending twice, or racing the answer, ends the call once', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    await Promise.all([
      post(`/calls/${call.id}/end`, 'alice'),
      post(`/calls/${call.id}/accept`, 'bob', { deviceId: B }),
      post(`/calls/${call.id}/end`, 'bob')
    ]);
    await post(`/calls/${call.id}/end`, 'alice');
    expect((await Call.findById(call.id))?.status).toBe('ended');
    expect(await Message.countDocuments({ conversationId: id, senderId: 'system:call' })).toBe(1);
  });

  it('lets someone hang up in a conversation that has since closed', async () => {
    const { conversation, call } = await answered();
    await Conversation.updateOne({ _id: conversation, 'participants.userId': 'bob' }, { $set: { 'participants.$.state': 'blocked' } });
    expect((await post(`/calls/${call}/end`, 'alice')).status).toBe(200);
    expect((await Call.findById(call))?.status).toBe('ended');
  });

  it('forgets a call for someone who can no longer see the conversation', async () => {
    const { conversation } = await answered();
    await Conversation.updateOne({ _id: conversation, 'participants.userId': 'bob' }, { $set: { 'participants.$.state': 'left' } });
    expect((await request('/calls/current', 'bob')).body.data).toBeNull();
  });

  it('rejects a call id that is not one', async () => {
    expect((await post('/calls/nope/end', 'alice')).status).toBe(404);
    expect((await post('/calls/64b1f0c2a3b4c5d6e7f80912/end', 'alice')).status).toBe(404);
  });
});

describe('time', () => {
  it('stops ringing after the timeout and says it was missed', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    await sweepCalls(Date.now() + RING_TIMEOUT_MS - 5000);
    expect((await Call.findById(call.id))?.status).toBe('ringing');
    await sweepCalls(Date.now() + RING_TIMEOUT_MS + 5000);
    expect(await Call.findById(call.id)).toMatchObject({ status: 'ended', endReason: 'missed' });
    expect(await lastLine(id)).toBe('Missed call from alice');
  });

  it('ends an answered call when a side has gone, and only then', async () => {
    const { call } = await answered();
    await sweepCalls(Date.now() + DROP_GRACE_MS - 10_000);
    expect((await Call.findById(call))?.status).toBe('active');
    await sweepCalls(Date.now() + DROP_GRACE_MS + 10_000);
    expect(await Call.findById(call)).toMatchObject({ status: 'ended', endReason: 'dropped' });
  });

  it('keeps a call whose devices keep being seen', async () => {
    const { call } = await answered();
    const caller = new CallFeed('alice', A);
    const callee = new CallFeed('bob', B);
    const later = Date.now() + DROP_GRACE_MS - 5000;
    await caller.poll(later);
    await callee.poll(later);
    await sweepCalls(later + 20_000);
    expect((await Call.findById(call))?.status).toBe('active');
  });

  it('does not drop a call if both devices were seen after the timeout check', async () => {
    const { call } = await answered();
    const cutoff = new Date(Date.now() - 1000);
    expect(await finishIfLive(call, ['active'], 'dropped', cutoff)).toBeNull();
    expect((await Call.findById(call))?.status).toBe('active');
  });

  it('formats lengths', () => {
    expect([7, 60, 3600, 5400, 3720].map(formatDuration)).toEqual(['7 sec', '1 min', '1 h', '1 h 30 min', '1 h 2 min']);
  });
});

describe('signals', () => {
  const signal = (call: string, user: string, device: string, data: unknown) => post(`/calls/${call}/signal`, user, { deviceId: device, data });

  it('reach the other device in the order they were sent, once', async () => {
    const { call } = await answered();
    for (const sdp of ['one', 'two', 'three']) expect((await signal(call, 'alice', A, { description: { type: 'offer', sdp } })).status).toBe(204);
    const bob = new CallFeed('bob', B);
    const first = await bob.poll();
    const received = first.events.filter((e) => e.type === 'call.signal').map((e) => (e.payload as { data: { description: { sdp: string } } }).data.description.sdp);
    expect(received).toEqual(['one', 'two', 'three']);
    expect((await bob.poll()).events).toEqual([]);
    expect(await CallSignal.countDocuments()).toBe(0);
  });

  it('are delivered to the device they are for and no other of the same person', async () => {
    const { call } = await answered();
    await signal(call, 'alice', A, { camera: true });
    const otherTab = new CallFeed('bob', 'bob-other-tab1');
    expect((await otherTab.poll()).events.filter((e) => e.type === 'call.signal')).toEqual([]);
    const rightTab = new CallFeed('bob', B);
    const events = (await rightTab.poll()).events.filter((e) => e.type === 'call.signal');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ callId: call, fromDeviceId: A, toDeviceId: B, data: { camera: true } });
  });

  it('go both ways', async () => {
    const { call } = await answered();
    await signal(call, 'bob', B, { description: { type: 'answer', sdp: 'a' } });
    const events = (await new CallFeed('alice', A).poll()).events.filter((e) => e.type === 'call.signal');
    expect(events[0].payload).toMatchObject({ data: { description: { sdp: 'a' } }, toDeviceId: A });
  });

  it('refuse a device that is not in the call, even if it is the same person', async () => {
    const { call } = await answered();
    expect((await signal(call, 'alice', 'alice-other-tab', { camera: true })).status).toBe(409);
    expect((await signal(call, 'bob', A, { camera: true })).status).toBe(409);
    expect((await signal(call, 'mallory', 'mallory-dev-1', { camera: true })).status).toBe(404);
    expect(await CallSignal.countDocuments()).toBe(0);
  });

  it('are refused before the call is answered and after it ends', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    expect((await signal(call.id, 'alice', A, { camera: true })).status).toBe(409);
    await post(`/calls/${call.id}/accept`, 'bob', { deviceId: B });
    await post(`/calls/${call.id}/end`, 'alice');
    expect((await signal(call.id, 'alice', A, { camera: true })).status).toBe(409);
  });

  it('must carry something and stay bounded', async () => {
    const { call } = await answered();
    expect((await signal(call, 'alice', A, {})).status).toBe(400);
    expect((await signal(call, 'alice', A, { description: { type: 'offer', sdp: 'x'.repeat(50_001) } })).status).toBe(400);
    expect((await signal(call, 'alice', A, { description: { type: 'nope', sdp: 'x' } })).status).toBe(400);
    expect((await signal(call, 'alice', A, { showing: 'huge' })).status).toBe(400);
    expect((await signal(call, 'alice', A, { candidate: null })).status).toBe(204);
  });

  it('are thrown away when the call ends', async () => {
    const { call } = await answered();
    await signal(call, 'alice', A, { camera: true });
    await post(`/calls/${call}/end`, 'alice');
    expect(await CallSignal.countDocuments()).toBe(0);
  });
});

describe('what a device is told (CallFeed)', () => {
  const types = (events: { type: string }[]) => events.map((e) => e.type);

  it('announces a ringing call to both sides, once each', async () => {
    const id = await dm();
    await ring(id);
    const bob = new CallFeed('bob', B);
    const first = await bob.poll();
    expect(types(first.events)).toEqual(['call.ringing']);
    expect(first.busy).toBe(true);
    expect(types((await bob.poll()).events)).toEqual([]);
    expect(types((await new CallFeed('alice', A).poll()).events)).toEqual(['call.ringing']);
    expect(types((await new CallFeed('carol', 'carol-device1').poll()).events)).toEqual([]);
  });

  it('tells the story of a call in order: ringing, answered, ended', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    const alice = new CallFeed('alice', A);
    expect(types((await alice.poll()).events)).toEqual(['call.ringing']);
    await post(`/calls/${call.id}/accept`, 'bob', { deviceId: B });
    expect(types((await alice.poll()).events)).toEqual(['call.accepted']);
    expect(types((await alice.poll()).events)).toEqual([]);
    await post(`/calls/${call.id}/end`, 'bob');
    const ended = await alice.poll();
    expect(types(ended.events)).toEqual(['call.ended']);
    expect(ended.busy).toBe(false);
    expect(types((await alice.poll()).events)).toEqual([]);
  });

  it('does not announce an answered call again to a stream that reconnects, but does a ringing one', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    expect(types((await new CallFeed('bob', B).poll()).events)).toEqual(['call.ringing']);
    expect(types((await new CallFeed('bob', B).poll()).events)).toEqual(['call.ringing']);
    await post(`/calls/${call.id}/accept`, 'bob', { deviceId: B });
    const reconnected = await new CallFeed('bob', B).poll();
    expect(types(reconnected.events)).toEqual([]);
    expect(reconnected.busy).toBe(true);
  });

  it('tells a second device of the person called when the first has answered', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    const tablet = new CallFeed('bob', 'bob-tablet-001');
    expect(types((await tablet.poll()).events)).toEqual(['call.ringing']);
    await post(`/calls/${call.id}/accept`, 'bob', { deviceId: B });
    const events = (await tablet.poll()).events;
    expect(events[0]).toMatchObject({ type: 'call.accepted', payload: { answeredDeviceId: B } });
  });

  it('lets a ringing call time out on the callee’s own stream', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    const bob = new CallFeed('bob', B);
    await bob.poll();
    await bob.poll(Date.now() + RING_TIMEOUT_MS + 1000);
    expect((await Call.findById(call.id))?.endReason).toBe('missed');
    expect(types((await bob.poll()).events)).toEqual(['call.ended']);
  });

  it('marks only the two devices on the call as seen', async () => {
    const { call } = await answered();
    const later = Date.now() + 60_000;
    await new CallFeed('alice', 'alice-other-tab').poll(later);
    expect((await Call.findById(call))?.seen?.caller?.getTime()).toBeLessThan(later);
    await new CallFeed('alice', A).poll(later);
    expect((await Call.findById(call))?.seen?.caller?.getTime()).toBe(later);
    await new CallFeed('bob', B).poll(later);
    expect((await Call.findById(call))?.seen?.callee?.getTime()).toBe(later);
  });

  it('forgets a call that no longer exists', async () => {
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    const bob = new CallFeed('bob', B);
    await bob.poll();
    await Call.deleteOne({ _id: call.id });
    expect((await bob.poll()).busy).toBe(false);
  });
});

describe('the stream', () => {
  async function open(user: string, device: string) {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/chat/events?device=${device}`, { headers: { 'x-test-user': user }, signal: controller.signal });
    const reader = response.body!.getReader();
    let text = '';
    const until = async (needle: string) => {
      const deadline = Date.now() + 5000;
      while (!text.includes(needle) && Date.now() < deadline) {
        const chunk = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))]);
        if (chunk && !chunk.done) text += new TextDecoder().decode(chunk.value);
      }
      return text;
    };
    return { response, until, close: () => controller.abort() };
  }

  it('carries a call to the person being called the moment it is placed', async () => {
    const id = await dm();
    const bob = await open('bob', B);
    expect(bob.response.headers.get('content-type')).toContain('text/event-stream');
    await bob.until('event: ready');
    const started = Date.now();
    const call = (await json<{ id: string }>(await ring(id))).data;
    const text = await bob.until('call.ringing');
    expect(text).toContain('event: call');
    expect(text).toContain(`"id":"${call.id}"`);
    // Woken on this process rather than found at the next poll.
    expect(Date.now() - started).toBeLessThan(900);
    bob.close();
  });

  it('carries the signals of the call to the device they are for', async () => {
    const { call } = await answered();
    const bob = await open('bob', B);
    await post(`/calls/${call}/signal`, 'alice', { deviceId: A, data: { screen: true } });
    expect(await bob.until('call.signal')).toContain('"screen":true');
    bob.close();
  });

  it('refuses a stream without a device, and too many at once', async () => {
    expect((await fetch(`${base}/api/chat/events`, { headers: { 'x-test-user': 'alice' } })).status).toBe(400);
    const open6 = await Promise.all(Array.from({ length: 6 }, (_, i) => open('dave', `dave-device-${i}`)));
    expect((await fetch(`${base}/api/chat/events?device=dave-device-9`, { headers: { 'x-test-user': 'dave' } })).status).toBe(400);
    open6.forEach((stream) => stream.close());
  });
});

describe('notifications', () => {
  const keys = { p256dh: 'BPublicKeyOfTheBrowser', auth: 'authsecret' };
  const sent = () => send.mock.calls.map((c) => JSON.parse(c[1]));

  it('rings a phone whose app is closed, and stops it when the call is answered elsewhere', async () => {
    await PushSubscription.create({ userId: 'bob', endpoint: 'https://push.example.test/bob', keys });
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    await vi.waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]).toMatchObject({ title: 'alice', body: 'Calling you', kind: 'call', tag: `call-${call.id}`, url: `/chat?conversation=${id}` });
    expect(send.mock.calls[0][2].TTL).toBe(45);
    await post(`/calls/${call.id}/accept`, 'bob', { deviceId: B });
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()[1]).toMatchObject({ kind: 'call-over', tag: `call-${call.id}` });
  });

  it('replaces the ringing notification with a missed call, but not after an answered call', async () => {
    await PushSubscription.create({ userId: 'bob', endpoint: 'https://push.example.test/bob', keys });
    const id = await dm();
    const call = (await json<{ id: string }>(await ring(id))).data;
    await post(`/calls/${call.id}/end`, 'alice');
    await vi.waitFor(() => expect(sent().some((p) => p.body === 'Missed call' && p.tag === `call-${call.id}`)).toBe(true));
    send.mockClear();
    const { call: answeredCall } = await answered();
    await post(`/calls/${answeredCall}/end`, 'alice');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sent().some((p) => p.body === 'Missed call')).toBe(false);
  });

  it('does not push to the person calling', async () => {
    await PushSubscription.create({ userId: 'alice', endpoint: 'https://push.example.test/alice', keys });
    const id = await dm();
    await ring(id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(send).not.toHaveBeenCalled();
  });
});
