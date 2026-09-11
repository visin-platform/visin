import type { Request, Response } from 'express';

jest.mock('../../services/jobService', () => ({
  createJob: jest.fn(),
  listJobsForUser: jest.fn(),
  listPublicJobs: jest.fn(),
  withoutCreatorIdentity: jest.fn((job: { toObject: () => Record<string, unknown> }) => {
    const { createdBy: _createdBy, ...rest } = job.toObject();
    return rest;
  }),
  getJob: jest.fn(),
  deleteJob: jest.fn(),
  getJobProgress: jest.fn(),
  transitionJob: jest.fn(),
  setJobVisibility: jest.fn(),
}));
jest.mock('../../services/materializationService', () => ({
  materializeTasks: jest.fn(),
}));
jest.mock('../../services/exportService', () => ({
  exportRows: jest.fn(),
  exportCsv: jest.fn(),
  exportManifest: jest.fn(),
  jobStats: jest.fn(),
}));
jest.mock('../../services/groupAccessService', () => ({
  requireUser: jest.fn((req: Request) => req.user),
  assertMember: jest.fn(),
  assertAdmin: jest.fn(),
  isGroupAdmin: jest.fn(),
}));

jest.mock('../../services/jobAccessService', () => ({ getJobReadAccess: jest.fn() }));
import { getJobReadAccess } from '../../services/jobAccessService';

import * as ctrl from '../../controllers/jobController';
import * as svc from '../../services/jobService';
import * as materialization from '../../services/materializationService';
import * as exportSvc from '../../services/exportService';
import { assertAdmin, assertMember } from '../../services/groupAccessService';

const mockedSvc = svc as unknown as Record<string, jest.Mock>;
const mockedMat = materialization as unknown as Record<string, jest.Mock>;
const mockedExport = exportSvc as unknown as Record<string, jest.Mock>;
const mockedAdmin = assertAdmin as jest.Mock;
const mockedMember = assertMember as jest.Mock;

type MockRes = Response & { json: jest.Mock; status: jest.Mock; send: jest.Mock; setHeader: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn(), send: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, query: {}, params: {}, user: { id: 'u1', email: 'user@x.com' }, ...overrides } as unknown as Request);

const job = {
  _id: 'j1',
  groupId: 'g1',
  toObject: () => ({ _id: 'j1', groupId: 'g1', createdBy: { email: 'owner@x.com' } }),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedSvc.getJob.mockResolvedValue(job);
  (getJobReadAccess as jest.Mock).mockImplementation(async (_job, userId) => ({ member: Boolean(userId), isAdmin: false }));
});

describe('createJob', () => {
  it('requires group admin, then creates', async () => {
    mockedSvc.createJob.mockResolvedValue(job);
    const req = makeReq({ body: { name: 'J', groupId: 'g1' } });
    const res = makeRes();

    await ctrl.createJob(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('propagates access denial before creating', async () => {
    mockedAdmin.mockRejectedValueOnce(new Error('forbidden'));

    await expect(ctrl.createJob(makeReq({ body: { groupId: 'g1' } }), makeRes())).rejects.toThrow('forbidden');
    expect(mockedSvc.createJob).not.toHaveBeenCalled();
  });
});

describe('listJobs', () => {
  it('defaults to the worker role', async () => {
    mockedSvc.listJobsForUser.mockResolvedValue([]);
    const res = makeRes();

    await ctrl.listJobs(makeReq(), res);

    expect(mockedSvc.listJobsForUser).toHaveBeenCalledWith('u1', 'worker');
  });

  it('passes the admin role through', async () => {
    mockedSvc.listJobsForUser.mockResolvedValue([]);

    await ctrl.listJobs(makeReq({ query: { role: 'admin' } }), makeRes());

    expect(mockedSvc.listJobsForUser).toHaveBeenCalledWith('u1', 'admin');
  });

  it('gives an anonymous caller the public listing', async () => {
    mockedSvc.listPublicJobs.mockResolvedValue([{ _id: 'j1' }]);
    const res = makeRes();

    await ctrl.listJobs(makeReq({ user: undefined }), res);

    expect(mockedSvc.listJobsForUser).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'j1' }] });
  });

  // role=admin asks which groups the caller administers — nothing, with no caller.
  it('gives an anonymous caller nothing for the admin role', async () => {
    const res = makeRes();

    await ctrl.listJobs(makeReq({ user: undefined, query: { role: 'admin' } }), res);

    expect(mockedSvc.listPublicJobs).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });
});

describe('getJob', () => {
  it('attaches progress scoped to the caller', async () => {
    mockedSvc.getJobProgress.mockResolvedValue({ tasks: 3 });
    const req = makeReq({ params: { id: 'j1' } });
    const res = makeRes();

    await ctrl.getJob(req, res);

    expect(mockedSvc.getJobProgress).toHaveBeenCalledWith(job, 'u1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { canLabel: false, _id: 'j1', groupId: 'g1', createdBy: { email: 'owner@x.com' }, progress: { tasks: 3 } },
    });
  });

  // A shared link resolves without an account; "answers by me" is simply zero.
  // `createdBy` is dropped for the same reason the per-labeler stats are: it is
  // an email address, and the progress is the thing being shared.
  it('serves an anonymous caller without the creator identity or a membership check', async () => {
    mockedSvc.getJobProgress.mockResolvedValue({ tasks: 3, myAnswers: 0 });
    const res = makeRes();

    await ctrl.getJob(makeReq({ params: { id: 'j1' }, user: undefined }), res);

    expect(mockedSvc.getJobProgress).toHaveBeenCalledWith(job, '');
    expect(mockedMember).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { canLabel: false, _id: 'j1', groupId: 'g1', progress: { tasks: 3, myAnswers: 0 } },
    });
  });
});

describe('deleteJob', () => {
  it('requires admin, then reports what was removed', async () => {
    mockedSvc.deleteJob.mockResolvedValue({ tasks: 10, answers: 12 });
    const req = makeReq({ params: { id: 'j1' } });
    const res = makeRes();

    await ctrl.deleteJob(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tasks: 10, answers: 12 } });
  });

  it('propagates access denial before removing anything', async () => {
    mockedAdmin.mockRejectedValueOnce(new Error('forbidden'));

    await expect(ctrl.deleteJob(makeReq({ params: { id: 'j1' } }), makeRes())).rejects.toThrow('forbidden');
    expect(mockedSvc.deleteJob).not.toHaveBeenCalled();
  });
});

describe('transitions', () => {
  it.each([
    ['activateJob', 'activate'],
    ['pauseJob', 'pause'],
    ['resumeJob', 'resume'],
    ['archiveJob', 'archive'],
  ] as const)('%s requires admin and delegates', async (handler, action) => {
    mockedSvc.transitionJob.mockResolvedValue({ ...job, status: 'x' });
    const req = makeReq({ params: { id: 'j1' } });

    await ctrl[handler](req, makeRes());

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(mockedSvc.transitionJob).toHaveBeenCalledWith('j1', action);
  });
});

describe('materializeTasks', () => {
  it('requires admin and returns the result', async () => {
    mockedMat.materializeTasks.mockResolvedValue({ tasks: 10, missing: [] });
    const res = makeRes();

    await ctrl.materializeTasks(makeReq({ params: { id: 'j1' }, body: { kind: 'filter' } }), res);

    expect(mockedMat.materializeTasks).toHaveBeenCalledWith(job, { kind: 'filter' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tasks: 10, missing: [] } });
  });
});

describe('exportJob', () => {
  it('streams JSONL by default', async () => {
    mockedExport.exportRows.mockResolvedValue([{ a: 1 }, { b: 2 }]);
    const res = makeRes();

    await ctrl.exportJob(makeReq({ params: { id: 'j1' } }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson');
    expect(res.send).toHaveBeenCalledWith('{"a":1}\n{"b":2}\n');
  });

  it('streams CSV when requested', async () => {
    mockedExport.exportCsv.mockResolvedValue('h\nrow\n');
    const res = makeRes();

    await ctrl.exportJob(makeReq({ params: { id: 'j1' }, query: { format: 'csv' } }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.send).toHaveBeenCalledWith('h\nrow\n');
    expect(mockedExport.exportRows).not.toHaveBeenCalled();
  });

  it('serves the manifest as pretty JSON under its own filename', async () => {
    mockedExport.exportManifest.mockResolvedValue({ job: { id: 'j1' } });
    const res = makeRes();

    await ctrl.exportJob(makeReq({ params: { id: 'j1' }, query: { format: 'manifest' } }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="job-j1.manifest.json"'
    );
    expect(res.send).toHaveBeenCalledWith(JSON.stringify({ job: { id: 'j1' } }, null, 2));
    expect(mockedExport.exportRows).not.toHaveBeenCalled();
  });
});

describe('jobStats', () => {
  it('gives an authorized group administrator the per-labeler breakdown', async () => {
    (getJobReadAccess as jest.Mock).mockResolvedValue({ member: true, isAdmin: true });
    mockedExport.jobStats.mockResolvedValue({ tasks: 1, perUser: [{ userEmail: 'w@x.com', answered: 1 }] });
    const res = makeRes();

    await ctrl.jobStats(makeReq({ params: { id: 'j1' } }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { tasks: 1, perUser: [{ userEmail: 'w@x.com', answered: 1 }] },
    });
  });

  // Progress is the thing being shared; the breakdown is a list of email addresses.
  it('drops the per-labeler breakdown for an anonymous caller', async () => {
    mockedExport.jobStats.mockResolvedValue({
      tasks: 1,
      perStratum: [],
      perUser: [{ userEmail: 'w@x.com', answered: 1 }],
    });
    const res = makeRes();

    await ctrl.jobStats(makeReq({ params: { id: 'j1' }, user: undefined }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tasks: 1, perStratum: [] } });
    expect(mockedMember).not.toHaveBeenCalled();
  });
});
