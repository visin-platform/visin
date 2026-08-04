import type { Request, Response } from 'express';

jest.mock('../../services/jobService', () => ({
  getJob: jest.fn(),
}));
jest.mock('../../services/taskService', () => ({
  nextTask: jest.fn(),
  getTaskItem: jest.fn(),
  getTaskWithJob: jest.fn(),
  submitAnswer: jest.fn(),
  undoAnswer: jest.fn(),
}));
jest.mock('../../services/groupAccessService', () => ({
  requireUser: jest.fn((req: Request) => req.user),
  assertMember: jest.fn(),
}));

import * as ctrl from '../../controllers/taskController';
import * as jobs from '../../services/jobService';
import * as tasks from '../../services/taskService';
import { assertMember } from '../../services/groupAccessService';
import { ConflictError } from '@visin/backend-core';

const mockedJobs = jobs as unknown as Record<string, jest.Mock>;
const mockedTasks = tasks as unknown as Record<string, jest.Mock>;
const mockedMember = assertMember as jest.Mock;

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, query: {}, params: {}, user: { id: 'u1', email: 'w@x.com' }, ...overrides } as unknown as Request);

const activeJob = { _id: 'j1', groupId: 'g1', status: 'active' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTask', () => {
  it('serves one task by id to a group member', async () => {
    mockedTasks.getTaskWithJob.mockResolvedValue({ task: { _id: 't1' }, job: activeJob });
    mockedTasks.getTaskItem.mockResolvedValue({ task: { _id: 't1' }, images: { frame: { stem: 'frame_000012' } } });
    const req = makeReq({ params: { id: 't1' } });
    const res = makeRes();

    await ctrl.getTask(req, res);

    expect(mockedMember).toHaveBeenCalledWith(req, 'g1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { task: { _id: 't1' }, images: { frame: { stem: 'frame_000012' } } },
    });
  });

  it('refuses a non-member before loading images', async () => {
    mockedTasks.getTaskWithJob.mockResolvedValue({ task: { _id: 't1' }, job: activeJob });
    mockedMember.mockRejectedValueOnce(new Error('forbidden'));

    await expect(ctrl.getTask(makeReq({ params: { id: 't1' } }), makeRes())).rejects.toThrow('forbidden');
    expect(mockedTasks.getTaskItem).not.toHaveBeenCalled();
  });

  // A shared link is a look, not a claim: leasing here would take the frame out
  // of the queue for whoever was about to be handed it.
  it('does not lease the task it serves', async () => {
    mockedTasks.getTaskWithJob.mockResolvedValue({ task: { _id: 't1' }, job: activeJob });
    mockedTasks.getTaskItem.mockResolvedValue({ task: { _id: 't1' }, images: {} });

    await ctrl.getTask(makeReq({ params: { id: 't1' } }), makeRes());

    expect(mockedTasks.nextTask).not.toHaveBeenCalled();
  });
});

describe('nextTask', () => {
  it('leases the next task for a member of an active job', async () => {
    mockedJobs.getJob.mockResolvedValue(activeJob);
    mockedTasks.nextTask.mockResolvedValue({ task: { _id: 't1' }, images: {} });
    const req = makeReq({ params: { id: 'j1' } });
    const res = makeRes();

    await ctrl.nextTask(req, res);

    expect(mockedMember).toHaveBeenCalledWith(req, 'g1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { task: { _id: 't1' }, images: {} } });
  });

  it('returns null data when the queue is exhausted', async () => {
    mockedJobs.getJob.mockResolvedValue(activeJob);
    mockedTasks.nextTask.mockResolvedValue(null);
    const res = makeRes();

    await ctrl.nextTask(makeReq({ params: { id: 'j1' } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it('conflicts on a non-active job', async () => {
    mockedJobs.getJob.mockResolvedValue({ ...activeJob, status: 'paused' });

    await expect(ctrl.nextTask(makeReq({ params: { id: 'j1' } }), makeRes())).rejects.toThrow(ConflictError);
    expect(mockedTasks.nextTask).not.toHaveBeenCalled();
  });
});

describe('submitAnswer', () => {
  it('checks membership via the task’s job, then submits', async () => {
    const pair = { task: { _id: 't1' }, job: activeJob };
    mockedTasks.getTaskWithJob.mockResolvedValue(pair);
    mockedTasks.submitAnswer.mockResolvedValue({ _id: 'a1' });
    const req = makeReq({ params: { id: 't1' }, body: { rejectedMaskIds: [] } });
    const res = makeRes();

    await ctrl.submitAnswer(req, res);

    expect(mockedMember).toHaveBeenCalledWith(req, 'g1');
    expect(mockedTasks.submitAnswer).toHaveBeenCalledWith(pair.task, pair.job, req.user, { rejectedMaskIds: [] });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('undoAnswer', () => {
  it('undoes the caller’s answer', async () => {
    const pair = { task: { _id: 't1' }, job: activeJob };
    mockedTasks.getTaskWithJob.mockResolvedValue(pair);
    const req = makeReq({ params: { id: 't1' } });
    const res = makeRes();

    await ctrl.undoAnswer(req, res);

    expect(mockedTasks.undoAnswer).toHaveBeenCalledWith(pair.task, pair.job, req.user);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
