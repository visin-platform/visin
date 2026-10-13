import type { Request, Response } from 'express';

jest.mock('../../services/jobService', () => ({
  getJob: jest.fn(),
}));
jest.mock('../../services/taskService', () => ({
  nextTask: jest.fn(),
  getTaskItem: jest.fn(),
  getTaskItemAtIndex: jest.fn(),
  getTaskWithJob: jest.fn(),
  saveObjects: jest.fn(),
  saveMask: jest.fn(),
  clearMask: jest.fn(),
  finishTask: jest.fn(),
}));
jest.mock('../../services/groupAccessService', () => ({
  requireUser: jest.fn((req: Request) => req.user),
}));
jest.mock('../../services/jobAccessService', () => ({
  assertCanWork: jest.fn(),
}));

import * as ctrl from '../../controllers/taskController';
import * as jobs from '../../services/jobService';
import * as tasks from '../../services/taskService';
import { assertCanWork } from '../../services/jobAccessService';
import { ConflictError } from '@visin/backend-core';

const mockedJobs = jobs as unknown as Record<string, jest.Mock>;
const mockedTasks = tasks as unknown as Record<string, jest.Mock>;
const mockedCanWork = assertCanWork as jest.Mock;

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, query: {}, params: {}, user: { id: 'u1', email: 'w@x.com' }, ...overrides } as unknown as Request);

const activeJob = { _id: 'j1', datasetId: 'd1', status: 'active' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTask', () => {
  it('serves one task by id, scoped to the caller when there is one', async () => {
    mockedTasks.getTaskItem.mockResolvedValue({ task: { _id: 't1' }, images: { frame: { stem: 'frame_000012' } } });
    const req = makeReq({ params: { id: 't1' } });
    const res = makeRes();

    await ctrl.getTask(req, res);

    // The caller's id decides which answer comes back as `mine`.
    expect(mockedTasks.getTaskItem).toHaveBeenCalledWith('t1', 'u1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { task: { _id: 't1' }, images: { frame: { stem: 'frame_000012' } } },
    });
  });

  // The link is the point: someone without an account has to be able to follow it.
  it('serves an anonymous caller with no membership check', async () => {
    mockedTasks.getTaskItem.mockResolvedValue({ task: { _id: 't1' }, images: {} });

    await ctrl.getTask(makeReq({ params: { id: 't1' }, user: undefined }), makeRes());

    expect(mockedTasks.getTaskItem).toHaveBeenCalledWith('t1', undefined);
    expect(mockedCanWork).not.toHaveBeenCalled();
  });

  // A shared link is a look, not a claim: leasing here would take the frame out
  // of the queue for whoever was about to be handed it.
  it('does not lease the task it serves', async () => {
    mockedTasks.getTaskItem.mockResolvedValue({ task: { _id: 't1' }, images: {} });

    await ctrl.getTask(makeReq({ params: { id: 't1' } }), makeRes());

    expect(mockedTasks.nextTask).not.toHaveBeenCalled();
  });
});

describe('getTaskAtIndex', () => {
  it('serves the frame at a position', async () => {
    mockedTasks.getTaskItemAtIndex.mockResolvedValue({ task: { _id: 't7' }, images: {} });
    const res = makeRes();

    await ctrl.getTaskAtIndex(makeReq({ params: { id: 'j1', index: '6' } }), res);

    expect(mockedTasks.getTaskItemAtIndex).toHaveBeenCalledWith('j1', 6, 'u1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { task: { _id: 't7' }, images: {} } });
  });

  // Walking forwards is how a reader finds the end; a 404 would read as a bug.
  it('answers null past the last frame rather than erroring', async () => {
    mockedTasks.getTaskItemAtIndex.mockResolvedValue(null);
    const res = makeRes();

    await ctrl.getTaskAtIndex(makeReq({ params: { id: 'j1', index: '999' } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });
});

describe('nextTask', () => {
  it('leases the next task for someone who may work an active job', async () => {
    mockedJobs.getJob.mockResolvedValue(activeJob);
    mockedTasks.nextTask.mockResolvedValue({ task: { _id: 't1' }, images: {} });
    const req = makeReq({ params: { id: 'j1' } });
    const res = makeRes();

    await ctrl.nextTask(req, res);

    expect(mockedCanWork).toHaveBeenCalledWith(activeJob, 'u1');
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

describe('writing labels', () => {
  const pair = { task: { _id: 't1' }, job: activeJob };
  const annotation = { status: 'draft', objects: [{ id: 'o1' }], updatedAt: new Date(0), userId: 'u1', userEmail: 'w@x.com' };

  beforeEach(() => {
    mockedCanWork.mockReset();
    mockedTasks.getTaskWithJob.mockResolvedValue(pair);
  });

  it('checks access through the task’s job before every write', async () => {
    mockedTasks.saveObjects.mockResolvedValue(annotation);
    mockedTasks.saveMask.mockResolvedValue({ ...annotation, mask: { width: 4, height: 2 } });
    mockedTasks.finishTask.mockResolvedValue(annotation);
    mockedCanWork.mockRejectedValue(new Error('forbidden'));
    const req = makeReq({ params: { id: 't1' }, body: { objects: [] } });

    for (const handler of [ctrl.saveAnnotation, ctrl.saveMask, ctrl.clearMask, ctrl.finishDone, ctrl.finishSkip]) {
      await expect(handler(req, makeRes())).rejects.toThrow('forbidden');
    }

    expect(mockedCanWork).toHaveBeenCalledWith(activeJob, 'u1');
    expect(mockedTasks.saveObjects).not.toHaveBeenCalled();
    expect(mockedTasks.saveMask).not.toHaveBeenCalled();
    expect(mockedTasks.clearMask).not.toHaveBeenCalled();
    expect(mockedTasks.finishTask).not.toHaveBeenCalled();
  });

  it('saves the boxes and answers with the labels, without who made them', async () => {
    mockedTasks.saveObjects.mockResolvedValue(annotation);
    const req = makeReq({ params: { id: 't1' }, body: { objects: [{ id: 'o1' }] } });
    const res = makeRes();

    await ctrl.saveAnnotation(req, res);

    expect(mockedTasks.saveObjects).toHaveBeenCalledWith(pair.task, pair.job, req.user, { objects: [{ id: 'o1' }] });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { status: 'draft', objects: [{ id: 'o1' }], updatedAt: new Date(0) },
    });
  });

  it('hands the raw mask bytes on, and says what size it stored', async () => {
    mockedTasks.saveMask.mockResolvedValue({ ...annotation, mask: { width: 4, height: 2 } });
    const bytes = Buffer.from('VMSK');
    const res = makeRes();

    await ctrl.saveMask(makeReq({ params: { id: 't1' }, body: bytes }), res);

    expect(mockedTasks.saveMask).toHaveBeenCalledWith(pair.task, pair.job, expect.anything(), bytes);
    expect(res.json.mock.calls[0][0].data.mask).toEqual({ width: 4, height: 2 });
  });

  it('treats a body that was not sent as raw bytes as an empty mask, which the service refuses', async () => {
    mockedTasks.saveMask.mockRejectedValue(new Error('Not a Visin mask'));

    await expect(ctrl.saveMask(makeReq({ params: { id: 't1' }, body: {} }), makeRes())).rejects.toThrow('Not a Visin mask');
    expect((mockedTasks.saveMask.mock.calls[0][3] as Buffer).length).toBe(0);
  });

  it('clears the mask', async () => {
    const res = makeRes();

    await ctrl.clearMask(makeReq({ params: { id: 't1' } }), res);

    expect(mockedTasks.clearMask).toHaveBeenCalledWith(pair.task, pair.job, expect.anything());
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it.each([
    ['finishDone', 'done'],
    ['finishSkip', 'skipped'],
  ] as const)('%s closes the frame as %s', async (handler, outcome) => {
    mockedTasks.finishTask.mockResolvedValue({ ...annotation, status: outcome });
    const res = makeRes();

    await ctrl[handler](makeReq({ params: { id: 't1' }, body: { elapsedMs: 900 } }), res);

    expect(mockedTasks.finishTask).toHaveBeenCalledWith(pair.task, pair.job, expect.anything(), outcome, 900);
    expect(res.json.mock.calls[0][0].data.status).toBe(outcome);
  });

  it('closes a frame with no timing sent', async () => {
    mockedTasks.finishTask.mockResolvedValue(annotation);

    await ctrl.finishDone(makeReq({ params: { id: 't1' }, body: undefined }), makeRes());

    expect(mockedTasks.finishTask).toHaveBeenCalledWith(pair.task, pair.job, expect.anything(), 'done', undefined);
  });
});
