jest.mock('../../models/LabelJob', () => ({
  LabelJob: { create: jest.fn(), find: jest.fn(), findById: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock('../../models/LabelBundle', () => ({
  LabelBundle: { findById: jest.fn() },
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { countDocuments: jest.fn(), deleteMany: jest.fn(), aggregate: jest.fn() },
}));
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { countDocuments: jest.fn(), deleteMany: jest.fn(), aggregate: jest.fn() },
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

  beforeEach(() => {
    mockedTask.aggregate.mockResolvedValue([]);
    mockedAnswer.aggregate.mockResolvedValue([]);
  });

  it('worker: active jobs across all my groups', async () => {
    mockedGroups.getMyGroups.mockResolvedValue(myGroups);
    const sort = jest.fn().mockResolvedValue([]);
    mockedJob.find.mockReturnValue({ sort });

    await svc.listJobsForUser('user@x.com', 'worker', 'u1');

    expect(mockedJob.find).toHaveBeenCalledWith({ groupId: { $in: ['g1', 'g2'] }, status: 'active' });
  });

  it('public: every active job, whatever group owns it, minus who set it up', async () => {
    const job = {
      _id: 'j1',
      redundancy: 1,
      toObject: () => ({ _id: 'j1', createdBy: { email: 'owner@x.com' } }),
    };
    const sort = jest.fn().mockResolvedValue([job]);
    mockedJob.find.mockReturnValue({ sort });

    const jobs = await svc.listPublicJobs();

    // No group filter at all — a visitor has no groups to scope to. Active only:
    // a job is active because someone deliberately activated it.
    expect(mockedJob.find).toHaveBeenCalledWith({ status: 'active' });
    expect(mockedGroups.getMyGroups).not.toHaveBeenCalled();
    // Nobody's own answers, since there is nobody.
    expect(jobs[0].progress.myAnswers).toBe(0);
    // `createdBy` is an email address; the progress is what is being shared.
    expect(jobs[0].createdBy).toBeUndefined();
  });

  it('admin: all jobs in groups I own/administer', async () => {
    mockedGroups.getMyGroups.mockResolvedValue(myGroups);
    const sort = jest.fn().mockResolvedValue([]);
    mockedJob.find.mockReturnValue({ sort });

    await svc.listJobsForUser('user@x.com', 'admin', 'u1');

    expect(mockedJob.find).toHaveBeenCalledWith({ groupId: { $in: ['g1'] } });
  });

  it('attaches each job its own progress', async () => {
    mockedGroups.getMyGroups.mockResolvedValue(myGroups);
    const jobs = [
      { _id: 'j1', redundancy: 1, toObject: () => ({ _id: 'j1', name: 'A' }) },
      { _id: 'j2', redundancy: 1, toObject: () => ({ _id: 'j2', name: 'B' }) },
    ];
    mockedJob.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(jobs) });
    mockedTask.aggregate.mockResolvedValue([
      { _id: { jobId: 'j1', answersCount: 0 }, count: 3 },
      { _id: { jobId: 'j1', answersCount: 1 }, count: 7 },
      { _id: { jobId: 'j2', answersCount: 2 }, count: 5 },
    ]);
    mockedAnswer.aggregate.mockResolvedValue([{ _id: 'j1', answers: 7, myAnswers: 2 }]);

    const listed = await svc.listJobsForUser('user@x.com', 'worker', 'u1');

    expect(listed[0]).toEqual({ _id: 'j1', name: 'A', progress: { tasks: 10, completed: 7, answers: 7, myAnswers: 2 } });
    // A job with no answers still gets a zeroed progress rather than none.
    expect(listed[1].progress).toEqual({ tasks: 5, completed: 5, answers: 0, myAnswers: 0 });
  });
});

describe('progress', () => {
  it('counts a task as done only once it reaches the job redundancy', async () => {
    mockedTask.aggregate.mockResolvedValue([
      { _id: { jobId: 'j1', answersCount: 1 }, count: 6 }, // answered once — not done at K=2
      { _id: { jobId: 'j1', answersCount: 2 }, count: 4 },
    ]);
    mockedAnswer.aggregate.mockResolvedValue([{ _id: 'j1', answers: 14, myAnswers: 6 }]);
    const job = { _id: 'j1', redundancy: 2 } as never;

    expect(await svc.getJobProgress(job, 'u1')).toEqual({ tasks: 10, completed: 4, answers: 14, myAnswers: 6 });
  });

  it('does not query at all for an empty job list', async () => {
    expect(await svc.progressForJobs([], 'u1')).toEqual(new Map());
    expect(mockedTask.aggregate).not.toHaveBeenCalled();
    expect(mockedAnswer.aggregate).not.toHaveBeenCalled();
  });

  it('ignores rows for jobs outside the requested set', async () => {
    mockedTask.aggregate.mockResolvedValue([{ _id: { jobId: 'other', answersCount: 1 }, count: 9 }]);
    mockedAnswer.aggregate.mockResolvedValue([{ _id: 'other', answers: 9, myAnswers: 9 }]);

    const progress = await svc.progressForJobs([{ _id: 'j1', redundancy: 1 } as never], 'u1');

    expect(progress.get('j1')).toEqual({ tasks: 0, completed: 0, answers: 0, myAnswers: 0 });
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

describe('deleteJob', () => {
  it('removes answers, then tasks, then the job itself', async () => {
    const order: string[] = [];
    mockedAnswer.deleteMany.mockImplementation(async () => {
      order.push('answers');
      return { deletedCount: 7 };
    });
    mockedTask.deleteMany.mockImplementation(async () => {
      order.push('tasks');
      return { deletedCount: 4135 };
    });
    mockedJob.deleteOne.mockImplementation(async () => {
      order.push('job');
      return {};
    });

    const result = await svc.deleteJob('j1');

    expect(result).toEqual({ tasks: 4135, answers: 7 });
    expect(mockedAnswer.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    expect(mockedTask.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    expect(mockedJob.deleteOne).toHaveBeenCalledWith({ _id: 'j1' });
    // Answers first: a half-done delete must never leave an answer whose task is
    // already gone, which no repeat call could then find.
    expect(order).toEqual(['answers', 'tasks', 'job']);
  });

  it('reports zero when a driver omits deletedCount', async () => {
    mockedAnswer.deleteMany.mockResolvedValue({});
    mockedTask.deleteMany.mockResolvedValue({});
    mockedJob.deleteOne.mockResolvedValue({});

    expect(await svc.deleteJob('j1')).toEqual({ tasks: 0, answers: 0 });
  });
});
