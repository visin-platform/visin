jest.mock('../../models/Session', () => jest.requireActual('../helpers/sessionModelMock').sessionModule());
import type { Request, Response } from 'express';
import { Session } from '../../models/Session';
import { renewSession } from '../../services/sessionService';
import { makeSession } from '../helpers/sessionModelMock';

const mockedSession = Session as unknown as Record<string, jest.Mock>;

beforeAll(() => { process.env.JWT_SECRET = 'session-service-test-secret'; });
afterAll(() => { delete process.env.JWT_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('renewSession', () => {
  const user = { id: '507f1f77bcf86cd799439011', email: 'user@example.test', name: 'User', tokenVersion: 1 };
  const res = () => ({ cookie: jest.fn() }) as unknown as Response & { cookie: jest.Mock };

  it('renews nothing when the session was revoked after the middleware checked it', async () => {
    mockedSession.findOneAndUpdate.mockResolvedValue(null);
    const response = res();
    const req = { user, authSession: makeSession(), headers: {} } as unknown as Request;

    await expect(renewSession(req, response)).rejects.toThrow('Session has ended');
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('skips the write for a session renewed moments ago', async () => {
    const response = res();
    const req = { user, authSession: makeSession({ lastSeenAt: new Date() }), headers: {} } as unknown as Request;

    await renewSession(req, response);

    expect(mockedSession.findOneAndUpdate).not.toHaveBeenCalled();
    expect(response.cookie).toHaveBeenCalledTimes(1);
  });
});
