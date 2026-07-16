import type { Request, Response } from 'express';

jest.mock('../../services/jobService', () => ({
  createJob: jest.fn(),
  listJobsForUser: jest.fn(),
}));

import * as ctrl from '../../controllers/jobController';
import * as svc from '../../services/jobService';
import { UnauthorizedError } from '@visin/backend-core';

const mockedSvc = svc as unknown as Record<string, jest.Mock>;

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, query: {}, params: {}, ...overrides } as unknown as Request);

const userReq = (overrides: Record<string, unknown> = {}) =>
  makeReq({ user: { id: 'u1', email: 'owner@x.com' }, ...overrides });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createJob', () => {
  it('creates a job for the authenticated user and returns 201', async () => {
    const job = { _id: 'j1', name: 'Job' };
    mockedSvc.createJob.mockResolvedValue(job);
    const req = userReq({ body: { name: 'Job' } });
    const res = makeRes();

    await ctrl.createJob(req, res);

    expect(mockedSvc.createJob).toHaveBeenCalledWith(req.user, { name: 'Job' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: job });
  });

  it('rejects a request without an authenticated user', async () => {
    await expect(ctrl.createJob(makeReq(), makeRes())).rejects.toThrow(UnauthorizedError);
    expect(mockedSvc.createJob).not.toHaveBeenCalled();
  });
});

describe('listJobs', () => {
  it('lists jobs for the authenticated user', async () => {
    mockedSvc.listJobsForUser.mockResolvedValue([{ _id: 'j1' }]);
    const res = makeRes();

    await ctrl.listJobs(userReq(), res);

    expect(mockedSvc.listJobsForUser).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'j1' }] });
  });

  it('rejects a request without an authenticated user', async () => {
    await expect(ctrl.listJobs(makeReq(), makeRes())).rejects.toThrow(UnauthorizedError);
  });
});
