import type { NextFunction, Request, Response } from 'express';
import { vi, type Mock } from 'vitest';

vi.mock('../../services/analyst', async () => {
  const module = await (() => ({
    RESERVATION: 160000,
    reservationFor: (screen: boolean) => (screen ? 280000 : 160000),
    analyze: vi.fn(async function () {
      return {
        text: 'Validation peaked at epoch 42.',
        evidence: [],
        inputTokens: 100,
        outputTokens: 20
      };
    })
  }))();
  return Object.assign({ default: module }, module);
});


/**
 * This service calls chat over HTTP, through the same `fetchWithTimeout` a test replaces to stand in for vision, a
 * provider or file-service. Whatever a test makes of it, a call to chat (the address the fake chat was started on)
 * goes through for real: only what is outside the pair is a test's to answer.
 */
function passChatCalls<F extends Mock>(mock: F, real: typeof import('@visin/backend-core').fetchWithTimeout): F {
  type Implementation = (url: string, init?: Parameters<typeof real>[1]) => unknown;
  const toChat = (url: unknown) => Boolean(process.env.CHAT_INTERNAL_URL && String(url).startsWith(process.env.CHAT_INTERNAL_URL));
  const wrap =
    (implementation: Implementation): Implementation =>
    (url, init) =>
      toChat(url) ? real(url, init) : implementation(url, init);
  const patch = (method: string, toImplementation: (value: never) => Implementation) => {
    const original = (mock as unknown as Record<string, (arg: unknown) => unknown>)[method].bind(mock);
    (mock as unknown as Record<string, unknown>)[method] = (value: never) => original(wrap(toImplementation(value)));
  };
  patch('mockImplementation', (value) => value as unknown as Implementation);
  patch('mockImplementationOnce', (value) => value as unknown as Implementation);
  patch('mockResolvedValue', (value) => async () => value);
  patch('mockResolvedValueOnce', (value) => async () => value);
  patch('mockRejectedValue', (value) => async () => {
    throw value;
  });
  patch('mockRejectedValueOnce', (value) => async () => {
    throw value;
  });
  patch('mockReturnValue', (value) => () => value);
  patch('mockReturnValueOnce', (value) => () => value);
  return mock;
}

vi.mock('@visin/backend-core', async () => {
  const sharedGroupClient = {
    getMyGroups: vi.fn(async () => []),
    checkMembership: vi.fn(async () => ({ member: false, role: null }))
  };
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    fetchWithTimeout: passChatCalls(
      vi.fn((await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout),
      (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
    ),
    // One client for everyone who asks: chat and Vivi each build theirs, and a test sets the groups once.
    createGroupServiceClient: vi.fn(function () {
      return sharedGroupClient;
    }),
    createApiKey: vi.fn(async function () {
      return { token: 'ephemeral', summary: { id: 'key1' } };
    }),
    deleteApiKey: vi.fn(async function () {
      return true;
    }),
    authenticateToken: async (req: Request, _res: Response, next: NextFunction) => {
      const id = req.headers['x-test-user'];
      if (!id)
        return next(
          new (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).UnauthorizedError()
        );
      req.user = { id: String(id), email: `${id}@test.invalid`, name: String(id) };
      next();
    }
  }))();
  return Object.assign({ default: module }, module);
});

// The access check reaches vision and the groups; a test answers for them (the groups through the one shared client).
vi.mock('../../services/access', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/access')>('../../services/access')),
    peer: vi.fn(async function () {
      return { _id: '111111111111111111111111', owner: { kind: 'user', id: 'alice' } };
    })
  }))();
  return Object.assign({ default: module }, module);
});

// These HTTP/worker suites use synthetic names (alice/bob) as authenticated IDs.
// Keep policy enforcement real while replacing only the account identity lookup.
vi.mock('../../services/adminPolicy', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminPolicy')>('../../services/adminPolicy');
  return { ...actual, assertViviUser: async (id: string) => {
    const policy = await actual.effectivePolicy(id);
    if (!policy.enabled) throw new Error('Vivi access is disabled');
    return policy;
  } };
});
