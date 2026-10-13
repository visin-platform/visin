jest.mock('../../models/LabelTask', () => ({
  LabelTask: { find: jest.fn() },
}));
jest.mock('../../models/LabelAnnotation', () => ({
  LabelAnnotation: { find: jest.fn() },
}));
jest.mock('../../clients/datasetServiceClient', () => ({
  getDataset: jest.fn(),
}));

import { exportManifest, jobStats } from '../../services/exportService';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import * as datasets from '../../clients/datasetServiceClient';
import type { ILabelJob } from '../../models/LabelJob';

const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnnotation = LabelAnnotation as unknown as Record<string, jest.Mock>;
const mockedDatasets = datasets as unknown as Record<string, jest.Mock>;

const job = {
  _id: 'j1',
  name: 'Street',
  taskType: 'annotate',
  redundancy: 2,
  status: 'active',
  tasksCount: 3,
  createdBy: { email: 'owner@x.com' },
  createdAt: new Date('2026-10-01T00:00:00Z'),
  datasetId: 'd1',
  sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
  classes: [
    { key: 'car', name: 'Car', color: '#ff0000', tools: ['box', 'mask'], maskIndex: 1 },
    { key: 'road', name: 'Road', color: '#00ff00', tools: ['mask'], maskIndex: 2 },
  ],
  selection: { kind: 'filter', spec: { sampleN: 3 } },
} as unknown as ILabelJob;

const stub = (tasks: unknown[], annotations: unknown[]) => {
  mockedTask.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(tasks) });
  mockedAnnotation.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(annotations) });
};

const annotation = (userId: string, overrides: Record<string, unknown> = {}) => ({
  userId,
  userEmail: `${userId}@x.com`,
  userName: userId.toUpperCase(),
  status: 'done',
  objects: [],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('jobStats', () => {
  it('counts progress, boxes and mask pixels per class, and who did how much', async () => {
    stub(
      [
        { _id: 't1', stratum: 'day', answersCount: 2 },
        { _id: 't2', stratum: 'day', answersCount: 1 },
        { _id: 't3', answersCount: 0 },
      ],
      [
        annotation('u1', {
          objects: [{ classKey: 'car' }, { classKey: 'car' }, { classKey: 'ghost' }],
          mask: { pixels: { '1': 100, '2': 400, '9': 5 } },
        }),
        annotation('u2', { objects: [{ classKey: 'car' }] }),
        annotation('u1', { objects: [{ classKey: 'car' }], mask: { pixels: { '2': 50 } } }),
        annotation('u2', { status: 'skipped', objects: [{ classKey: 'car' }] }),
      ]
    );

    const stats = await jobStats(job);

    expect(stats).toEqual({
      tasks: 3,
      completed: 1,
      done: 3,
      skipped: 1,
      // The ghost class is not in the job, but the box is still on a finished frame.
      objects: 5,
      perUser: [
        { userEmail: 'u1@x.com', userName: 'U1', done: 2, skipped: 0 },
        { userEmail: 'u2@x.com', userName: 'U2', done: 1, skipped: 1 },
      ],
      perClass: [
        { classKey: 'car', name: 'Car', boxes: 4, pixels: 100 },
        { classKey: 'road', name: 'Road', boxes: 0, pixels: 450 },
      ],
      perStratum: [
        { stratum: '(none)', tasks: 1, completed: 0 },
        { stratum: 'day', tasks: 2, completed: 1 },
      ],
    });
  });

  it('only reads finished and skipped labels', async () => {
    stub([], []);

    await jobStats(job);

    expect(mockedAnnotation.find.mock.calls[0][0]).toEqual({ jobId: 'j1', status: { $in: ['done', 'skipped'] } });
  });

  it('is all zeros for a job nobody has started, and copes with an annotation that has no objects field', async () => {
    stub([], []);
    expect(await jobStats(job)).toMatchObject({ tasks: 0, completed: 0, done: 0, skipped: 0, objects: 0, perUser: [] });

    stub([{ _id: 't1', answersCount: 0 }], [{ userId: 'u', userEmail: 'u@x.com', status: 'done' }]);
    expect((await jobStats(job)).objects).toBe(0);
  });
});

describe('exportManifest', () => {
  it('describes how the job was set up, with its classes and sensors', async () => {
    stub([{ _id: 't1', answersCount: 2 }], [annotation('u1'), annotation('u2', { status: 'skipped' })]);
    mockedDatasets.getDataset.mockResolvedValue({
      _id: 'd1',
      name: 'Drive',
      description: 'City',
      groups: [{ name: 'camera', images: 3, jsons: 0 }],
    });

    const manifest = await exportManifest(job);

    expect(manifest.job).toMatchObject({
      id: 'j1',
      name: 'Street',
      taskType: 'annotate',
      sensors: job.sensors,
      redundancy: 2,
      createdBy: 'owner@x.com',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(manifest.job.classes).toEqual(job.classes);
    expect(manifest.dataset).toEqual({ id: 'd1', name: 'Drive', description: 'City', groups: [{ name: 'camera', images: 3, jsons: 0 }] });
    expect(manifest.selection).toEqual({ kind: 'filter', spec: { sampleN: 3 } });
    expect(manifest.progress).toEqual({ tasks: 1, completed: 1, done: 1, skipped: 1 });
  });

  it('copes with a job that has no dataset and no selection', async () => {
    stub([], []);

    const manifest = await exportManifest({ ...job, datasetId: undefined, selection: undefined, createdBy: undefined } as never);

    expect(mockedDatasets.getDataset).not.toHaveBeenCalled();
    expect(manifest.dataset).toBeNull();
    expect(manifest.selection).toBeNull();
    expect(manifest.job.createdBy).toBeUndefined();
  });
});
