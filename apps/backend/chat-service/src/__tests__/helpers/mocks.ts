import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';

vi.mock('@visin/backend-core', async () => {
  // One client for everyone who asks, so a test sets the groups once.
  const sharedGroupClient = {
    getMyGroups: vi.fn(async () => []),
    checkMembership: vi.fn(async () => ({ member: false, role: null }))
  };
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    fetchWithTimeout: vi.fn(
      (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
    ),
    createGroupServiceClient: vi.fn(function () {
      return sharedGroupClient;
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

vi.mock('../../services/access', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/access')>('../../services/access')),
    publicPerson: vi.fn(async function (handle: string) {
      return { id: handle, name: handle, handle };
    }),
    peer: vi.fn(async function () {
      return { _id: '111111111111111111111111', owner: { kind: 'user', id: 'alice' } };
    })
  }))();
  return Object.assign({ default: module }, module);
});

// The assistants are another service. These suites test chat with an assistant service that takes every question
// (to the assistant the thread is bound to, if it is, called Bot) and that nothing is running for: what the real one
// decides is its own tests'. The contract between the two is in each service's tests of its half of it.
vi.mock('../../services/assistantClient', () => ({
  prepare: vi.fn(
    async (input: {
      person: { id: string; email: string; name: string };
      assistantId?: string | null;
      membershipVersion: number;
      screen?: Record<string, unknown>;
    }) => ({
      request: {
        userId: input.person.id,
        email: input.person.email,
        name: input.person.name,
        // With none named there is none: a private chat without an assistant answers as Vivi herself.
        ...(input.assistantId ? { assistantId: input.assistantId, assistantName: 'Bot' } : {}),
        membershipVersion: input.membershipVersion,
        ...(input.screen ? { screen: input.screen } : {})
      }
    })
  ),
  resolve: vi.fn(async (input: { assistantId?: string }) => (input.assistantId ? { id: input.assistantId, name: 'Bot' } : null)),
  cancelRuns: vi.fn(async () => undefined),
  cancelMessageRuns: vi.fn(async () => undefined),
  capabilities: vi.fn(async () => ({
    assistant: false,
    assistantModel: { provider: '', model: '', ready: false },
    canConfigure: false
  }))
}));
