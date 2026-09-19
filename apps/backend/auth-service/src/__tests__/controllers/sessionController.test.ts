import type { Request, Response } from 'express';
import { listSessions, revokeSession, revokeOtherSessions } from '../../controllers/sessionController';

// The happy paths run end to end in integration/sessionRevocation.test.ts; these
// are the guards a route mounted without authentication would hit.
const makeRes = () => ({ json: jest.fn(), clearCookie: jest.fn() }) as unknown as Response;

describe('session controllers without a session', () => {
  it.each([
    ['listSessions', listSessions],
    ['revokeSession', revokeSession],
    ['revokeOtherSessions', revokeOtherSessions]
  ])('%s refuses an unauthenticated request', async (_name, handler) => {
    await expect(handler({ params: {} } as unknown as Request, makeRes())).rejects.toThrow('Not authenticated');
  });
});
