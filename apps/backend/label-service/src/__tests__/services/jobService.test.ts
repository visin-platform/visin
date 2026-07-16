jest.mock('../../models/LabelJob', () => ({
  LabelJob: { create: jest.fn(), find: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../models/LabelBundle', () => ({
  LabelBundle: { findById: jest.fn() },
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { countDocuments: jest.fn() },
}));
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { countDocuments: jest.fn() },
}));
jest.mock('../../clients/groupServiceClient', () => ({
  getMyGroups: jest.fn(),
}));

import * as svc from '../../services/jobService';
import { LabelJob } from '../../models/LabelJob';
import { LabelBundle } from '../../models/LabelBundle';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnswer } from '../../models/LabelAnswer';
import * as groups from '../../clients/groupServiceClient';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';

const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedBundle = LabelBundle as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnswer = LabelAnswer as unknown as Record<string, jest.Mock>;
const mockedGroups = groups as unknown as Record<string, jest.Mock>;

const user = { id: 'u1', email: 'Admin@X.com', name: 'Admin' };
const body = {
  name: 'Job',
  groupId: 'g1',
  taskType: 'mask_toggle' as const,
  question: { prompt: 'p' },
  annotationSets: [],
  redundancy: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createJob', () => {
  it('creates a draft without a bundle', async () => {
    mockedJob.create.mockResolvedValue({ _id: 'j1' });

    await svc.createJob(user, body);

    expect(mockedJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', createdBy: { userId: 'u1', email: 'admin@x.com', name: 'Admin' } })
    );
  });

  it('validates the bundle exists and matches the group', async () => {
    mockedBundle.findById.mockResolvedValue(null);
    await expect(svc.createJob(user, { ...body, bundleId: 'missing' })).rejects.toThrow(BadRequestError);

    mockedBundle.findById.mockResolvedValue({ groupId: 'other-group' });
    await expect(svc.createJob(user, { ...body, bundleId: 'b1' })).rejects.toThrow('different group');
  });
});

describe('listJobsForUser', () => {
  const myGroups = [
    { groupId: 'g1', role: 'owner' },
    { groupId: 'g2', role: 'member' },
  ];

  it('worker: active jobs across all my groups', async () => {
    mockedGroups.getMyGroups.mockResolvedValue(myGroups);
    const sort = jest.fn().mockResolvedValue([]);
    mockedJob.find.mockReturnValue({ sort });

    await svc.listJobsForUser('user@x.com', 'worker');

    expect(mockedJob.find).toHaveBeenCalledWith({ groupId: { $in: ['g1', 'g2'] }, status: 'active' });
  });

  it('admin: all jobs in groups I own/administer', async () => {
    mockedGroups.getMyGroups.mockResolvedValue(myGroups);
    const sort = jest.fn().mockResolvedValue([]);
    mockedJob.find.mockReturnValue({ sort });

    await svc.listJobsForUser('user@x.com', 'admin');

    expect(mockedJob.find).toHaveBeenCalledWith({ groupId: { $in: ['g1'] } });
  });
});

describe('getJobProgress', () => {
  it('counts tasks, completion, and per-user answers', async () => {
    mockedTask.countDocuments.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    mockedAnswer.countDocuments.mockResolvedValueOnce(13).mockResolvedValueOnce(6);
    const job = { _id: 'j1', redundancy: 2 } as never;

    const progress = await svc.getJobProgress(job, 'u1');

    expect(progress).toEqual({ tasks: 10, completed: 4, answers: 13, myAnswers: 6 });
    expect(mockedTask.countDocuments).toHaveBeenCalledWith({ jobId: 'j1', answersCount: { $gte: 2 } });
  });
});

describe('transitionJob', () => {
  const makeJob = (status: string, extra: Record<string, unknown> = {}) => ({
    _id: 'j1',
    status,
    bundleId: 'b1',
    tasksCount: 5,
    save: jest.fn(),
    ...extra,
  });

  it('activates a draft with a ready bundle and materialized tasks', async () => {
    const job = makeJob('draft');
    mockedJob.findById.mockResolvedValue(job);
    mockedBundle.findById.mockResolvedValue({ status: 'ready' });

    const updated = await svc.transitionJob('j1', 'activate');

    expect(updated.status).toBe('active');
    expect(job.save).toHaveBeenCalled();
  });

  it('refuses to activate without a bundle, a ready bundle, or tasks', async () => {
    mockedJob.findById.mockResolvedValue(makeJob('draft', { bundleId: undefined }));
    await expect(svc.transitionJob('j1', 'activate')).rejects.toThrow('no bundle');

    mockedJob.findById.mockResolvedValue(makeJob('draft'));
    mockedBundle.findById.mockResolvedValue({ status: 'importing' });
    await expect(svc.transitionJob('j1', 'activate')).rejects.toThrow('not ready');

    mockedJob.findById.mockResolvedValue(makeJob('draft', { tasksCount: 0 }));
    mockedBundle.findById.mockResolvedValue({ status: 'ready' });
    await expect(svc.transitionJob('j1', 'activate')).rejects.toThrow('materialize first');
  });

  it('resumes a paused job without re-checking the bundle', async () => {
    const job = makeJob('paused');
    mockedJob.findById.mockResolvedValue(job);

    const updated = await svc.transitionJob('j1', 'resume');

    expect(updated.status).toBe('active');
    expect(mockedBundle.findById).not.toHaveBeenCalled();
  });

  it('pauses only active jobs and archives from most states', async () => {
    mockedJob.findById.mockResolvedValue(makeJob('draft'));
    await expect(svc.transitionJob('j1', 'pause')).rejects.toThrow(ConflictError);

    const completed = makeJob('completed');
    mockedJob.findById.mockResolvedValue(completed);
    expect((await svc.transitionJob('j1', 'archive')).status).toBe('archived');

    mockedJob.findById.mockResolvedValue(makeJob('archived'));
    await expect(svc.transitionJob('j1', 'archive')).rejects.toThrow(ConflictError);
  });

  it('throws NotFound for a missing job', async () => {
    mockedJob.findById.mockResolvedValue(null);

    await expect(svc.transitionJob('missing', 'activate')).rejects.toThrow(NotFoundError);
  });
});
