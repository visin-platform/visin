import '../helpers/mocks';
import webpush from 'web-push';
import { vi, type Mock } from 'vitest';
import { PushPreference } from '../../models/PushPreference';
import { PushSubscription } from '../../models/PushSubscription';
import { base, request, setupChatTests } from '../helpers/testServer';

vi.mock('web-push', async () => {
  const actual = await vi.importActual<{ default: typeof import('web-push') }>('web-push');
  return { default: { ...actual.default, sendNotification: vi.fn(async () => ({ statusCode: 201 })) } };
});

setupChatTests();

const send = webpush.sendNotification as unknown as Mock;
const TRAINING = 'a'.repeat(24);
const run = { userId: 'alice', trainingId: TRAINING, name: 'resnet-50 night', status: 'completed', projectName: 'Roads' };

const announce = (body: unknown, token: string | null = 'test') =>
  fetch(`${base}/api/chat/internal/run-finished`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) },
    body: JSON.stringify(body)
  });
const subscribe = (userId = 'alice') =>
  PushSubscription.create({ userId, endpoint: `https://push.example.test/${userId}`, keys: { p256dh: 'p', auth: 'a' } });
const sent = () => JSON.parse(String((send.mock.calls[0] as unknown[])[1])) as Record<string, string>;

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ statusCode: 201 });
});

describe('announcing a finished run', () => {
  it('is for services only: no token, a wrong token and a person all fail', async () => {
    await subscribe();
    expect((await announce(run, null)).status).toBe(401);
    expect((await announce(run, 'wrong')).status).toBe(401);
    expect(
      (await fetch(`${base}/api/chat/internal/run-finished`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-user': 'alice' },
        body: JSON.stringify(run)
      })).status
    ).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('notifies the owner on their devices, with a link to the run', async () => {
    await subscribe();
    const response = await announce(run);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { delivered: number } }).data.delivered).toBe(1);
    expect(sent()).toMatchObject({
      title: 'Run finished',
      body: 'resnet-50 night · Roads',
      tag: `run:${TRAINING}`,
      url: `/trainings/${TRAINING}`
    });
    expect((send.mock.calls[0] as unknown[])[2]).toMatchObject({ topic: TRAINING });
  });

  it('says a run failed, and names it without a project when none is given', async () => {
    await subscribe();
    await announce({ ...run, status: 'failed', projectName: undefined });
    expect(sent()).toMatchObject({ title: 'Run failed', body: 'resnet-50 night' });
  });

  it('reaches nobody who has not turned notifications on, and nobody who turned run alerts off', async () => {
    expect(((await (await announce(run)).json()) as { data: { delivered: number } }).data.delivered).toBe(0);
    await subscribe();
    await PushPreference.create({ userId: 'alice', runs: false });
    await announce(run);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a malformed announcement', async () => {
    expect((await announce({ ...run, trainingId: 'nope' })).status).toBe(400);
    expect((await announce({ ...run, status: 'running' })).status).toBe(400);
    expect((await announce({ ...run, extra: 1 })).status).toBe(400);
  });

  it('does not fail the caller when sending fails', async () => {
    await subscribe();
    send.mockRejectedValue(Object.assign(new Error('down'), { statusCode: 500 }));
    expect((await announce(run)).status).toBe(200);
  });
});

describe('run alert preference', () => {
  it('is on until chosen, and is kept per person', async () => {
    expect((await request<{ runs: boolean }>('/push/preferences')).body.data.runs).toBe(true);
    expect((await request('/push/preferences', 'alice', { runs: false }, 'PUT')).body.data).toEqual({ runs: false });
    expect((await request<{ runs: boolean }>('/push/preferences')).body.data.runs).toBe(false);
    expect((await request<{ runs: boolean }>('/push/preferences', 'bob')).body.data.runs).toBe(true);
    await request('/push/preferences', 'alice', { runs: true }, 'PUT');
    expect((await request<{ runs: boolean }>('/push/preferences')).body.data.runs).toBe(true);
    expect(await PushPreference.countDocuments({ userId: 'alice' })).toBe(1);
  });

  it('refuses anything but a yes or no', async () => {
    expect((await request('/push/preferences', 'alice', { runs: 'no' }, 'PUT')).status).toBe(400);
    expect((await request('/push/preferences', 'alice', { runs: false, other: 1 }, 'PUT')).status).toBe(400);
  });
});
