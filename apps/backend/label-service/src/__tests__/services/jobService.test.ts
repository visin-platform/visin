jest.mock('../../models/LabelJob', () => ({
  MAX_CLASSES: 100,
  LabelJob: { create: jest.fn(), find: jest.fn(), findById: jest.fn(), deleteOne: jest.fn(), findOneAndUpdate: jest.fn() },
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
jest.mock('../../models/LabelAnnotation', () => ({
  LabelAnnotation: { deleteMany: jest.fn(), aggregate: jest.fn() },
}));
jest.mock('../../models/LabelSuggestion', () => ({
  LabelSuggestion: { deleteMany: jest.fn() },
}));
jest.mock('../../clients/fileServiceClient', () => ({
  deleteFolder: jest.fn(),
  jobFolder: (jobId: string) => `label/${jobId}/`,
}));

import * as svc from '../../services/jobService';
import { LabelJob } from '../../models/LabelJob';
import * as datasets from '../../clients/datasetServiceClient';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import { LabelSuggestion } from '../../models/LabelSuggestion';
import * as files from '../../clients/fileServiceClient';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';

const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedDatasets = datasets as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnnotation = LabelAnnotation as unknown as Record<string, jest.Mock>;
const mockedSuggestion = LabelSuggestion as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;

const user = { id: 'u1', email: 'Admin@X.com', name: 'Admin' };
const body = {
  name: 'Job',
  datasetId: 'd1',
  taskType: 'annotate' as const,
  sensors: [{ key: 'camera' as const, group: 'frames', kind: 'image' as const }],
  classes: [{ name: 'Car', tools: ['box', 'mask'] as ('box' | 'mask')[] }],
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

describe('setModelClassMapping', () => {
  const job = () => ({ _id: 'j1', classes: [
    { key: 'human', tools: ['box'], modelClass: 'person' },
    { key: 'vehicle', tools: ['box', 'mask'] },
    { key: 'road', tools: ['mask'] }
  ] }) as unknown as Parameters<typeof svc.setModelClassMapping>[0];

  it('changes and clears only explicit mappings on the existing classes', async () => {
    mockedJob.findOneAndUpdate.mockResolvedValue(job());
    await svc.setModelClassMapping(job(), { vehicle: 'car', human: null });
    expect(mockedJob.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'j1', 'classes.1.key': 'vehicle', 'classes.0.key': 'human' },
      { $set: { 'classes.1.modelClass': 'car' }, $unset: { 'classes.0.modelClass': '' } },
      { returnDocument: 'after', runValidators: true }
    );
  });

  it('can set or clear a mapping by itself and preserves other explicit mappings', async () => {
    mockedJob.findOneAndUpdate.mockResolvedValue(job());
    await svc.setModelClassMapping(job(), { vehicle: 'car' });
    expect(mockedJob.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty('$unset');
    await svc.setModelClassMapping(job(), { human: null });
    expect(mockedJob.findOneAndUpdate.mock.calls[1][1]).not.toHaveProperty('$set');
  });

  it('refuses unknown classes and ambiguous explicit box mappings', async () => {
    await expect(svc.setModelClassMapping(job(), { ghost: 'car' })).rejects.toThrow(BadRequestError);
    await expect(svc.setModelClassMapping(job(), { vehicle: ' PERSON ' })).rejects.toThrow('only one');
    expect(mockedJob.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('asks to reload when class positions changed concurrently', async () => {
    mockedJob.findOneAndUpdate.mockResolvedValue(null);
    await expect(svc.setModelClassMapping(job(), { vehicle: 'car' })).rejects.toThrow(ConflictError);
  });
});

describe('createJob', () => {
  beforeEach(() => {
    mockedDatasets.getDataset.mockResolvedValue(dataset());
    mockedDatasets.getPermission.mockResolvedValue('manage');
  });

  it('claims the dataset so its files cannot go away under the job', async () => {
    mockedJob.create.mockResolvedValue({ _id: 'j1', datasetId: 'd1' });

    await svc.createJob(user, {
      ...body,
      sensors: [...body.sensors, { key: 'lidar', group: 'verify', kind: 'image' }],
    });

    expect(mockedDatasets.getPermission).toHaveBeenCalledWith('d1', 'u1');
    expect(mockedJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', datasetId: 'd1', createdBy: { userId: 'u1', email: 'admin@x.com', name: 'Admin' } })
    );
    expect(mockedJob.create.mock.calls[0][0].classes).toEqual([
      { key: 'car', name: 'Car', color: '#2a78d6', hotkey: '1', tools: ['box', 'mask'], maskIndex: 1 },
    ]);
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

    await expect(
      svc.createJob(user, {
        ...body,
        sensors: [
          { key: 'camera', group: 'nope', kind: 'image' },
          { key: 'radar', group: 'gone', kind: 'points' },
        ],
      })
    ).rejects.toThrow('Not image groups of this dataset: nope, gone');
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
    mockedAnnotation.aggregate.mockResolvedValue([]);
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
    // Nobody's own labels, since there is nobody.
    expect(jobs[0].progress.myDone).toBe(0);
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
    mockedAnnotation.aggregate.mockResolvedValue([{ _id: 'j1', done: 7, skipped: 1, myDone: 2 }]);

    const listed = await svc.listJobsForUser('u1', 'worker');

    expect(listed[0]).toEqual({ _id: 'j1', name: 'A', progress: { tasks: 10, completed: 7, done: 7, skipped: 1, myDone: 2 } });
    // A job with no labels still gets a zeroed progress rather than none.
    expect(listed[1].progress).toEqual({ tasks: 5, completed: 5, done: 0, skipped: 0, myDone: 0 });
  });
});

describe('progress', () => {
  it('counts a task as done only once it reaches the job redundancy', async () => {
    mockedTask.aggregate.mockResolvedValue([
      { _id: { jobId: 'j1', answersCount: 1 }, count: 6 }, // answered once — not done at K=2
      { _id: { jobId: 'j1', answersCount: 2 }, count: 4 },
    ]);
    mockedAnnotation.aggregate.mockResolvedValue([{ _id: 'j1', done: 14, skipped: 0, myDone: 6 }]);
    const job = { _id: 'j1', redundancy: 2 } as never;

    expect(await svc.getJobProgress(job, 'u1')).toEqual({ tasks: 10, completed: 4, done: 14, skipped: 0, myDone: 6 });
  });

  it('does not query at all for an empty job list', async () => {
    expect(await svc.progressForJobs([], 'u1')).toEqual(new Map());
    expect(mockedTask.aggregate).not.toHaveBeenCalled();
    expect(mockedAnnotation.aggregate).not.toHaveBeenCalled();
  });

  it('ignores rows for jobs outside the requested set', async () => {
    mockedTask.aggregate.mockResolvedValue([{ _id: { jobId: 'other', answersCount: 1 }, count: 9 }]);
    mockedAnnotation.aggregate.mockResolvedValue([{ _id: 'other', done: 9, skipped: 0, myDone: 9 }]);

    const progress = await svc.progressForJobs([{ _id: 'j1', redundancy: 1 } as never], 'u1');

    expect(progress.get('j1')).toEqual({ tasks: 0, completed: 0, done: 0, skipped: 0, myDone: 0 });
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
  it('releases the dataset and the files, then removes labels, tasks and the job itself', async () => {
    mockedJob.findById.mockResolvedValue({ _id: 'j1', datasetId: 'd1' });
    const order: string[] = [];
    mockedDatasets.removeHold.mockImplementation(async () => void order.push('hold'));
    mockedFiles.deleteFolder.mockImplementation(async () => void order.push('files'));
    mockedAnnotation.deleteMany.mockImplementation(async () => {
      order.push('annotations');
      return { deletedCount: 7 };
    });
    mockedSuggestion.deleteMany.mockImplementation(async () => {
      order.push('suggestions');
      return { deletedCount: 2 };
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

    expect(result).toEqual({ tasks: 4135, annotations: 7, suggestions: 2 });
    expect(mockedFiles.deleteFolder).toHaveBeenCalledWith('label/j1/');
    expect(mockedAnnotation.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    expect(mockedTask.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    expect(mockedJob.deleteOne).toHaveBeenCalledWith({ _id: 'j1' });
    // Things that can fail and be retried go first, and labels before tasks: a
    // half-done delete must never leave a label whose task is already gone,
    // which no repeat call could then find.
    expect(order).toEqual(['hold', 'files', 'annotations', 'suggestions', 'tasks', 'job']);
  });

  it('keeps the job when its dataset claim cannot be released, so the delete can be retried', async () => {
    mockedJob.findById.mockResolvedValue({ _id: 'j1', datasetId: 'd1' });
    mockedDatasets.removeHold.mockRejectedValueOnce(new Error('dataset-service down'));

    await expect(svc.deleteJob('j1')).rejects.toThrow('dataset-service down');

    expect(mockedFiles.deleteFolder).not.toHaveBeenCalled();
    expect(mockedAnnotation.deleteMany).not.toHaveBeenCalled();
    expect(mockedJob.deleteOne).not.toHaveBeenCalled();
  });

  it('keeps the job when its files cannot be removed', async () => {
    mockedJob.findById.mockResolvedValue({ _id: 'j1' });
    mockedFiles.deleteFolder.mockRejectedValueOnce(new Error('file-service down'));

    await expect(svc.deleteJob('j1')).rejects.toThrow('file-service down');

    expect(mockedDatasets.removeHold).not.toHaveBeenCalled();
    expect(mockedJob.deleteOne).not.toHaveBeenCalled();
  });

  it('reports zero when a driver omits deletedCount', async () => {
    mockedJob.findById.mockResolvedValue(null);
    mockedFiles.deleteFolder.mockResolvedValue(undefined);
    mockedAnnotation.deleteMany.mockResolvedValue({});
    mockedSuggestion.deleteMany.mockResolvedValue({});
    mockedTask.deleteMany.mockResolvedValue({});
    mockedJob.deleteOne.mockResolvedValue({});

    expect(await svc.deleteJob('j1')).toEqual({ tasks: 0, annotations: 0, suggestions: 0 });
  });
});

describe('buildClasses', () => {
  it('derives a key, a colour, a hotkey and the mask value from the name and position', () => {
    const built = svc.buildClasses([{ name: 'Traffic Light', tools: ['box', 'mask'] }, { name: 'Café Bär', tools: ['mask'] }]);

    expect(built).toEqual([
      { key: 'traffic-light', name: 'Traffic Light', color: '#2a78d6', hotkey: '1', tools: ['box', 'mask'], maskIndex: 1 },
      { key: 'cafe-bar', name: 'Café Bär', color: '#eb6834', hotkey: '2', tools: ['mask'], maskIndex: 2 },
    ]);
  });

  it('keeps what the caller chose, and numbers on from the classes a job already has', () => {
    const existing = svc.buildClasses([{ name: 'Car', tools: ['box'] }]);

    const added = svc.buildClasses(
      [{ name: 'Bus', key: 'big-bus', color: '#123456', hotkey: 'b', tools: ['box'], modelClass: 'bus' }],
      existing
    );

    expect(added).toEqual([
      { key: 'big-bus', name: 'Bus', color: '#123456', hotkey: 'b', tools: ['box'], maskIndex: 2, modelClass: 'bus' },
    ]);
  });

  it('gives a name that makes no key, and one that repeats a key, a unique one', () => {
    const built = svc.buildClasses([
      { name: '???', tools: ['box'] },
      { name: 'Car', tools: ['box'] },
    ]);
    expect(built.map((entry) => entry.key)).toEqual(['class', 'car']);

    const existing = svc.buildClasses([{ name: 'Car', tools: ['box'] }]);
    expect(svc.buildClasses([{ name: 'car!', tools: ['box'] }], existing)[0].key).toBe('car-2');
  });

  it('gives only the first nine classes a digit hotkey, and never one that is taken', () => {
    const many = svc.buildClasses(Array.from({ length: 11 }, (_, i) => ({ name: `Class ${i}`, tools: ['box' as const] })));
    expect(many.map((entry) => entry.hotkey)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', undefined, undefined]);

    const taken = svc.buildClasses([{ name: 'A', hotkey: '2', tools: ['box'] }, { name: 'B', tools: ['box'] }]);
    expect(taken.map((entry) => entry.hotkey)).toEqual(['2', undefined]);
  });

  it('refuses a repeated key or name, and more classes than a mask can index', () => {
    expect(() =>
      svc.buildClasses([
        { name: 'A', key: 'x', tools: ['box'] },
        { name: 'B', key: 'x', tools: ['box'] },
      ])
    ).toThrow('Two classes use the key "x"');
    expect(() =>
      svc.buildClasses([
        { name: 'Car', tools: ['box'] },
        { name: 'car', tools: ['box'] },
      ])
    ).toThrow('same name');
    expect(() => svc.buildClasses(Array.from({ length: 101 }, (_, i) => ({ name: `c${i}`, tools: ['box' as const] })))).toThrow(
      'at most 100 classes'
    );
  });

  it('cycles colours rather than running out', () => {
    const many = svc.buildClasses(Array.from({ length: 14 }, (_, i) => ({ name: `c${i}`, tools: ['box' as const] })));
    expect(many[12].color).toBe(many[0].color);
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
