import type { NextFunction, Request, Response } from 'express';
import { vi } from 'vitest';

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

vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    fetchWithTimeout: vi.fn(
      (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
    ),
    createGroupServiceClient: vi.fn(function () {
      return {
        getMyGroups: vi.fn(async () => []),
        checkMembership: vi.fn(async () => ({ member: false, role: null }))
      };
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
