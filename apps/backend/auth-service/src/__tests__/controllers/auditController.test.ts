import type { Request, Response } from 'express';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  listToolCalls: jest.fn(),
  summariseToolUsage: jest.fn(),
}));

import { listToolCalls, summariseToolUsage } from '@visin/backend-core';
import { getToolCalls, getToolUsage } from '../../controllers/auditController';

const mocked = {
  calls: listToolCalls as unknown as jest.Mock,
  usage: summariseToolUsage as unknown as jest.Mock,
};

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (over: Record<string, unknown> = {}): Request =>
  ({ query: {}, user: { id: 'u1' }, ...over }) as unknown as Request;

/** Days between `since` and now, for asserting the window without pinning a clock. */
const windowOf = (since: Date): number =>
  Math.round((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000));

beforeEach(() => {
  jest.clearAllMocks();
  mocked.usage.mockResolvedValue([]);
  mocked.calls.mockResolvedValue([]);
});

describe('getToolUsage', () => {
  it('summarises the caller’s own usage over a default month', async () => {
    const res = makeRes();

    await getToolUsage(makeReq(), res);

    expect(mocked.usage.mock.calls[0][0]).toBe('u1');
    expect(windowOf(mocked.usage.mock.calls[0][1])).toBe(30);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, data: { windowDays: 30 } });
  });

  it('honours a requested window', async () => {
    await getToolUsage(makeReq({ query: { days: '7' } }), makeRes());

    expect(windowOf(mocked.usage.mock.calls[0][1])).toBe(7);
  });

  it('caps the window at a year, which is all the rows live for anyway', async () => {
    await getToolUsage(makeReq({ query: { days: '99999' } }), makeRes());

    expect(windowOf(mocked.usage.mock.calls[0][1])).toBe(365);
  });

  it.each([['nonsense'], ['0'], ['-5']])('falls back to the default for days=%s', async days => {
    await getToolUsage(makeReq({ query: { days } }), makeRes());

    expect(windowOf(mocked.usage.mock.calls[0][1])).toBe(30);
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(getToolUsage(makeReq({ user: undefined }), makeRes())).rejects.toThrow(
      /Not authenticated/
    );
  });
});

describe('getToolCalls', () => {
  it('returns the caller’s own recent calls', async () => {
    // Scoped by session, never by anything in the request — there is no route
    // here that can reach another account's trail.
    mocked.calls.mockResolvedValue([{ tool: 'list_projects' }]);
    const res = makeRes();

    await getToolCalls(makeReq(), res);

    expect(mocked.calls).toHaveBeenCalledWith('u1', 100);
    expect(res.json.mock.calls[0][0]).toEqual({ success: true, data: [{ tool: 'list_projects' }] });
  });

  it('caps how many rows one request can pull', async () => {
    await getToolCalls(makeReq({ query: { limit: '100000' } }), makeRes());

    expect(mocked.calls).toHaveBeenCalledWith('u1', 500);
  });

  it('rejects an unauthenticated caller', async () => {
    await expect(getToolCalls(makeReq({ user: undefined }), makeRes())).rejects.toThrow(
      /Not authenticated/
    );
  });
});
