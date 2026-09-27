jest.mock('../../models/LabelJob', () => ({
  LabelJob: { create: jest.fn(), find: jest.fn(), findById: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock('../../clients/datasetServiceClient', () => ({
  getDataset: jest.fn(),
  getPermission: jest.fn(),
  datasetIdsFor: jest.fn(),
  addHold: jest.fn(),
  removeHold: jest.fn(),
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { countDocuments: jest.fn(), deleteMany: jest.fn(), aggregate: jest.fn() },
}));
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { countDocuments: jest.fn(), deleteMany: jest.fn(), aggregate: jest.fn() },
}));

import * as svc from '../../services/jobService';
import { LabelJob } from '../../models/LabelJob';
import * as datasets from '../../clients/datasetServiceClient';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnswer } from '../../models/LabelAnswer';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';

const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedDatasets = datasets as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnswer = LabelAnswer as unknown as Record<string, jest.Mock>;

const user = { id: 'u1', email: 'Admin@X.com', name: 'Admin' };
const body = {
  name: 'Job',
  datasetId: 'd1',
  taskType: 'mask_toggle' as const,
  question: { prompt: 'p' },
  annotationSets: [],
  framesGroup: 'frames',
  redundancy: 1,
};

const dataset = (extra: Record<string, unknown> = {}) => ({
  _id: 'd1',
  name: 'VLM',
  owner: { kind: 'group', id: 'g1' },
  visibility: 'private',
  groups: [{ name: 'frames', images: 2, jsons: 0 }, { name: 'verify', images: 2, jsons: 1 }],
  imageCount: 4,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createJob', () => {
  beforeEach(() => {
    mockedDatasets.getDataset.mockResolvedValue(dataset());
    mockedDatasets.getPermission.mockResolvedValue('manage');
  });

  it('claims the dataset so its files cannot go away under the job', async () => {
    mockedJob.create.mockResolvedValue({ _id: 'j1', datasetId: 'd1' });

    await svc.createJob(user, { ...body, annotationSets: ['verify'] });

    expect(mockedDatasets.getPermission).toHaveBeenCalledWith('d1', 'u1');
    expect(mockedJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', datasetId: 'd1', createdBy: { userId: 'u1', email: 'admin@x.com', name: 'Admin' } })
    );
    expect(mockedJob.create.mock.calls[0][0]).not.toHaveProperty('groupId');
    expect(mockedDatasets.addHold).toHaveBeenCalledWith('d1', 'j1');
  });

  it('builds a job only on a dataset the caller manages', async () => {
    mockedDatasets.getPermission.mockResolvedValue('contribute');
    await expect(svc.createJob(user, body)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedJob.create).not.toHaveBeenCalled();
  });

  it('refuses a dataset that is missing, or lacks the named image groups', async () => {
    mockedDatasets.getDataset.mockRejectedValueOnce(new NotFoundError('Dataset not found'));
    await expect(svc.createJob(user, { ...body, datasetId: 'missing' })).rejects.toThrow(BadRequestError);

    mockedDatasets.getDataset.mockRejectedValueOnce(new Error('dataset-service down'));
    await expect(svc.createJob(user, body)).rejects.toThrow('dataset-service down');

    await expect(svc.createJob(user, { ...body, framesGroup: 'nope', annotationSets: ['gone'] })).rejects.toThrow(
      'Not image groups of this dataset: nope, gone'
    );
    expect(mockedJob.create).not.toHaveBeenCalled();
  });

  it('does not leave a job behind when the claim fails', async () => {
    mockedJob.create.mockResolvedValue({ _id: 'j1', datasetId: 'd1' });
    mockedDatasets.addHold.mockRejectedValueOnce(new Error('dataset-service down'));

    await expect(svc.createJob(user, body)).rejects.toThrow('dataset-service down');

    expect(mockedJob.deleteOne).toHaveBeenCalledWith({ _id: 'j1' });
  });
});

describe('listJobsForUser', () => {
  beforeEach(() => {
    mockedTask.aggregate.mockResolvedValue([]);
    mockedAnswer.aggregate.mockResolvedValue([]);
  });

  it('worker: active jobs on datasets I contribute to', async () => {
    mockedDatasets.datasetIdsFor.mockResolvedValue(['d1', 'd2']);
    const sort = jest.fn().mockResolvedValue([]);
    mockedJob.find.mockReturnValue({ sort });

    await svc.listJobsForUser('u1', 'worker');

    expect(mockedDatasets.datasetIdsFor).toHaveBeenCalledWith('u1', 'contribute');
    expect(mockedJob.find).toHaveBeenCalledWith({ datasetId: { $in: ['d1', 'd2'] }, status: 'active' });
  });

  it('public: explicitly published active jobs, minus who set it up', async () => {
    const job = {
      _id: 'j1',
      redundancy: 1,
      toObject: () => ({ _id: 'j1', createdBy: { email: 'owner@x.com' } }),
    };
    const sort = jest.fn().mockResolvedValue([job]);
    mockedJob.find.mockReturnValue({ sort });
    mockedDatasets.datasetIdsFor.mockResolvedValue(['d-public']);

    const jobs = await svc.listPublicJobs();

    // Only on public datasets: a job made public on a dataset that later went
    // private is closed. Active only: a job is active because someone activated it.
    expect(mockedDatasets.datasetIdsFor).toHaveBeenCalledWith(undefined, 'read');
    expect(mockedJob.find).toHaveBeenCalledWith({ status: 'active', isPublic: true, datasetId: { $in: ['d-public'] } });
    // Nobody's own answers, since there is nobody.
    expect(jobs[0].progress.myAnswers).toBe(0);
    // `createdBy` is an email address; the progress is what is being shared.
    expect(jobs[0].createdBy).toBeUndefined();
  });

  it('admin: every job on datasets I manage, and my own drafts from before datasets were required', async () => {
    mockedDatasets.datasetIdsFor.mockResolvedValue(['d1']);
    const sort = jest.fn().mockResolvedValue([]);
    mockedJob.find.mockReturnValue({ sort });

    await svc.listJobsForUser('u1', 'admin');

    expect(mockedDatasets.datasetIdsFor).toHaveBeenCalledWith('u1', 'manage');
    expect(mockedJob.find).toHaveBeenCalledWith({
      $or: [{ datasetId: { $in: ['d1'] } }, { datasetId: { $exists: false }, 'createdBy.userId': 'u1' }]
    });
  });

  it('attaches each job its own progress', async () => {
    mockedDatasets.datasetIdsFor.mockResolvedValue(['d1']);
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

    const listed = await svc.listJobsForUser('u1', 'worker');

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
    datasetId: 'd1',
    tasksCount: 5,
    save: jest.fn(),
    ...extra,
  });

  it('activates a draft with a dataset and materialized tasks', async () => {
    const job = makeJob('draft');
    mockedJob.findById.mockResolvedValue(job);

    const updated = await svc.transitionJob('j1', 'activate');

    expect(updated.status).toBe('active');
    expect(job.save).toHaveBeenCalled();
  });

  it('refuses to activate without a dataset or without tasks', async () => {
    mockedJob.findById.mockResolvedValue(makeJob('draft', { datasetId: undefined }));
    await expect(svc.transitionJob('j1', 'activate')).rejects.toThrow('no dataset');

    mockedJob.findById.mockResolvedValue(makeJob('draft', { tasksCount: 0 }));
    await expect(svc.transitionJob('j1', 'activate')).rejects.toThrow('materialize first');
  });

  it('resumes a paused job', async () => {
    const job = makeJob('paused');
    mockedJob.findById.mockResolvedValue(job);

    const updated = await svc.transitionJob('j1', 'resume');

    expect(updated.status).toBe('active');
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
    mockedJob.findById.mockResolvedValue({ _id: 'j1', datasetId: 'd1' });
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
    expect(mockedDatasets.removeHold).toHaveBeenCalledWith('d1', 'j1');
  });

  it('keeps the job when its dataset claim cannot be released, so the delete can be retried', async () => {
    mockedJob.findById.mockResolvedValue({ _id: 'j1', datasetId: 'd1' });
    mockedDatasets.removeHold.mockRejectedValueOnce(new Error('dataset-service down'));

    await expect(svc.deleteJob('j1')).rejects.toThrow('dataset-service down');

    expect(mockedAnswer.deleteMany).not.toHaveBeenCalled();
    expect(mockedJob.deleteOne).not.toHaveBeenCalled();
  });

  it('reports zero when a driver omits deletedCount', async () => {
    mockedAnswer.deleteMany.mockResolvedValue({});
    mockedTask.deleteMany.mockResolvedValue({});
    mockedJob.deleteOne.mockResolvedValue({});

    expect(await svc.deleteJob('j1')).toEqual({ tasks: 0, answers: 0 });
  });
});

describe('jobDataset', () => {
  it("names the job's dataset and its owner, and nothing for a dataset that is gone", async () => {
    mockedDatasets.getDataset.mockResolvedValueOnce(dataset());
    expect(await svc.jobDataset({ datasetId: 'd1' } as never)).toEqual({ _id: 'd1', name: 'VLM', owner: { kind: 'group', id: 'g1' } });

    mockedDatasets.getDataset.mockRejectedValueOnce(new NotFoundError('gone'));
    expect(await svc.jobDataset({ datasetId: 'd1' } as never)).toBeUndefined();
    expect(await svc.jobDataset({} as never)).toBeUndefined();

    mockedDatasets.getDataset.mockRejectedValueOnce(new Error('dataset-service down'));
    await expect(svc.jobDataset({ datasetId: 'd1' } as never)).rejects.toThrow('dataset-service down');
  });
});
