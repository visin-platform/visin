import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@visin/frontend-core';
import { callApi, callsConfig } from './callApi';

const config = vi.hoisted(() => ({ CHAT_SERVICE_URL: 'http://chat.example.test/' }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

const reply = (body: unknown, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status });
let send: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  send = vi.fn<typeof fetch>(async () => reply({ data: { ok: true } }));
  vi.stubGlobal('fetch', send);
});
afterEach(() => vi.unstubAllGlobals());

const call = () => ({ url: String(send.mock.calls[0]![0]), init: send.mock.calls[0]![1]! });

describe('callApi', () => {
  it('asks for the ICE servers and for the current call', async () => {
    expect(await callApi.iceServers()).toEqual({ ok: true });
    expect(call()).toMatchObject({ url: 'http://chat.example.test/api/chat/calls/ice-servers', init: { credentials: 'include' } });
    send.mockClear();
    await callApi.currentCall();
    expect(call().url).toBe('http://chat.example.test/api/chat/calls/current');
  });

  it('places, answers, declines and ends a call as this tab', async () => {
    await callApi.startCall('c1', 'tab-device-1');
    expect(call()).toMatchObject({ url: 'http://chat.example.test/api/chat/conversations/c1/calls', init: { method: 'POST' } });
    expect(JSON.parse(String(call().init.body))).toEqual({ deviceId: 'tab-device-1' });
    send.mockClear();
    await callApi.acceptCall('k1', 'tab-device-1');
    expect(call().url).toContain('/calls/k1/accept');
    send.mockClear();
    await expect(callApi.declineCall('k1')).resolves.toBeUndefined();
    expect(call().url).toContain('/calls/k1/decline');
    send.mockClear();
    await expect(callApi.endCall('k1')).resolves.toBeUndefined();
    expect(call().url).toContain('/calls/k1/end');
  });

  it('sends a signal and accepts the empty answer a 204 gives', async () => {
    send.mockResolvedValue(reply(undefined, 204));
    await expect(callApi.sendSignal('k1', 'tab-device-1', { camera: true })).resolves.toBeUndefined();
    expect(call().url).toContain('/calls/k1/signal');
    expect(JSON.parse(String(call().init.body))).toEqual({ deviceId: 'tab-device-1', data: { camera: true } });
  });

  it('keeps the server’s reason, which the call screen shows', async () => {
    send.mockResolvedValue(reply({ message: 'alice is on another call' }, 409));
    const failure = await callApi.startCall('c1', 'tab-device-1').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 409, message: 'alice is on another call' });
  });

  it('reads whether calls are on', async () => {
    send.mockResolvedValue(reply({ data: { enabled: true, mode: 'stun', relay: false } }));
    expect(await callsConfig()).toEqual({ enabled: true, mode: 'stun', relay: false });
    expect(call().url).toBe('http://chat.example.test/api/chat/calls/config');
  });
});
