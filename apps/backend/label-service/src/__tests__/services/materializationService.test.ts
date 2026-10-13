jest.mock('../../clients/datasetServiceClient', () => ({
  getDataset: jest.fn(),
  listItems: jest.fn(),
  getManifest: jest.fn()
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { deleteMany: jest.fn(), insertMany: jest.fn() },
}));

import { materializeTasks, toPoints, MAX_POINTS_PER_FRAME } from '../../services/materializationService';
import * as datasets from '../../clients/datasetServiceClient';
import { LabelTask } from '../../models/LabelTask';
import { BadRequestError, ConflictError } from '@visin/backend-core';
import type { ILabelJob } from '../../models/LabelJob';

const mockedDatasets = datasets as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;

type Item = {
  _id: string;
  group: string;
  path: string;
  stem: string;
  variant?: string;
  kind: 'image' | 'json';
  fileId?: string;
  width?: number;
  height?: number;
  data?: unknown;
};

const image = (group: string, stem: string, extra: Partial<Item> = {}): Item => ({
  _id: `${group}-${stem}`,
  group,
  path: `${group}/${stem}.png`,
  stem,
  kind: 'image',
  fileId: `file/${group}/${stem}.png`,
  ...extra
});
const frame = (stem: string): Item => image('camera', stem, { width: 4, height: 2 });
const points = (group: string, stem: string, data: unknown, variant?: string): Item => ({
  _id: `${group}-${stem}`,
  group,
  path: `${group}/${stem}.json`,
  stem,
  kind: 'json',
  data,
  ...(variant ? { variant } : {})
});

const makeJob = (overrides: Partial<ILabelJob> = {}): ILabelJob =>
  ({
    _id: 'j1',
    status: 'draft',
    datasetId: 'd1',
    taskType: 'annotate',
    sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
    save: jest.fn(),
    ...overrides,
  }) as unknown as ILabelJob;

const dataset = (groups = ['camera', 'lidar', 'radar']) => ({
  _id: 'd1',
  name: 'Drive',
  owner: { kind: 'user', id: 'u1' },
  visibility: 'public' as const,
  groups: groups.map((name) => ({ name, images: 1, jsons: 0 })),
  imageCount: groups.length
});

/** Serve the dataset's items the way dataset-service would, per group, kind and variant. */
const stubItems = (items: Item[]) => {
  mockedDatasets.listItems.mockImplementation(
    async (_id: string, filter: { group: string; kind: string; variant?: string; noVariant?: boolean }) =>
      items.filter(
        (item) =>
          item.group === filter.group &&
          item.kind === filter.kind &&
          (filter.variant === undefined || item.variant === filter.variant) &&
          (!filter.noVariant || !item.variant)
      )
  );
};

const inserted = (): Record<string, unknown>[] => mockedTask.insertMany.mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  mockedDatasets.getDataset.mockResolvedValue(dataset());
  mockedTask.deleteMany.mockResolvedValue({});
  mockedTask.insertMany.mockResolvedValue([]);
});

describe('materializeTasks guards', () => {
  it('only works on a draft with a dataset and a camera', async () => {
    await expect(materializeTasks(makeJob({ status: 'active' }), { kind: 'filter' })).rejects.toThrow(ConflictError);
    await expect(materializeTasks(makeJob({ datasetId: undefined }), { kind: 'filter' })).rejects.toThrow('no dataset');
    await expect(materializeTasks(makeJob({ sensors: [] }), { kind: 'filter' })).rejects.toThrow('no camera sensor');
  });

  it('rejects a sensor whose image group the dataset does not have', async () => {
    mockedDatasets.getDataset.mockResolvedValue(dataset(['camera']));
    const job = makeJob({
      sensors: [
        { key: 'camera', group: 'camera', kind: 'image' },
        { key: 'lidar', group: 'lidar', kind: 'image' },
      ],
    } as Partial<ILabelJob>);

    await expect(materializeTasks(job, { kind: 'filter' })).rejects.toThrow('no image group "lidar" (lidar)');
    expect(mockedTask.deleteMany).not.toHaveBeenCalled();
  });
});

describe('filter path', () => {
  it('takes every camera frame in path order', async () => {
    stubItems([frame('b'), frame('a'), frame('c')]);
    const job = makeJob();

    const result = await materializeTasks(job, { kind: 'filter' });

    expect(result).toEqual({ tasks: 3, missing: [], sensors: {} });
    expect(mockedTask.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    expect(inserted().map((task) => (task.frame as { stem: string }).stem)).toEqual(['a', 'b', 'c']);
    expect(inserted().map((task) => task.order)).toEqual([0, 1, 2]);
    expect(inserted()[0]).toMatchObject({
      jobId: 'j1',
      frame: { fileId: 'file/camera/a.png', path: 'camera/a.png', stem: 'a', width: 4, height: 2 },
    });
    expect(inserted()[0]).not.toHaveProperty('sensors');
    expect(job.tasksCount).toBe(3);
    expect(job.selection).toEqual({ kind: 'filter', spec: { sampleN: null, seed: 42, rows: 3 } });
    expect(job.save).toHaveBeenCalled();
  });

  it('samples deterministically with a seed', async () => {
    stubItems(Array.from({ length: 20 }, (_, i) => frame(String(i).padStart(2, '0'))));

    const first = await materializeTasks(makeJob(), { kind: 'filter', sampleN: 5, seed: 7 });
    const firstStems = inserted().map((task) => (task.frame as { stem: string }).stem);
    mockedTask.insertMany.mockClear();
    await materializeTasks(makeJob(), { kind: 'filter', sampleN: 5, seed: 7 });

    expect(first.tasks).toBe(5);
    expect(inserted().map((task) => (task.frame as { stem: string }).stem)).toEqual(firstStems);
  });

  it('fails on a dataset with no frames', async () => {
    stubItems([]);
    await expect(materializeTasks(makeJob(), { kind: 'filter' })).rejects.toThrow('no frames in "camera"');
  });

  it('omits image sizes the dataset does not have', async () => {
    stubItems([image('camera', 'a')]);

    await materializeTasks(makeJob(), { kind: 'filter' });

    expect(inserted()[0].frame).toEqual({ fileId: 'file/camera/a.png', path: 'camera/a.png', stem: 'a' });
  });
});

describe('sensors', () => {
  const rig = () =>
    makeJob({
      sensors: [
        { key: 'camera', group: 'camera', kind: 'image' },
        { key: 'lidar', group: 'lidar', kind: 'image' },
        { key: 'radar', group: 'radar', kind: 'points' },
      ],
    } as Partial<ILabelJob>);

  it('copies each overlay the frame has, and reports how many frames each covers', async () => {
    stubItems([
      frame('a'),
      frame('b'),
      image('lidar', 'a'),
      points('radar', 'a', [{ u: 1, v: 2, range: 30 }]),
      points('radar', 'b', { points: [[5, 6, 7]] }),
    ]);

    const result = await materializeTasks(rig(), { kind: 'filter' });

    expect(result.sensors).toEqual({ lidar: 1, radar: 2 });
    expect(inserted()[0].sensors).toEqual([
      { key: 'lidar', kind: 'image', fileId: 'file/lidar/a.png' },
      { key: 'radar', kind: 'points', points: [{ u: 1, v: 2, value: 30 }] },
    ]);
    expect(inserted()[1].sensors).toEqual([{ key: 'radar', kind: 'points', points: [{ u: 5, v: 6, value: 7 }] }]);
  });

  it('keeps a frame that lacks a sensor, and reports a sensor with no files as zero', async () => {
    stubItems([frame('a')]);

    const result = await materializeTasks(rig(), { kind: 'filter' });

    expect(result).toMatchObject({ tasks: 1, sensors: { lidar: 0, radar: 0 } });
    expect(inserted()[0]).not.toHaveProperty('sensors');
  });

  it('finds a sensor that shares a group with the camera by its file-name variant', async () => {
    stubItems([
      image('camera', 'a', { width: 4, height: 2 }),
      image('camera', 'a', { variant: 'lidar', fileId: 'file/camera/a.lidar.png' }),
    ]);
    const job = makeJob({
      sensors: [
        { key: 'camera', group: 'camera', kind: 'image' },
        { key: 'lidar', group: 'camera', kind: 'image', variant: 'lidar' },
      ],
    } as Partial<ILabelJob>);

    await materializeTasks(job, { kind: 'filter' });

    expect(inserted()).toHaveLength(1);
    expect(inserted()[0].sensors).toEqual([{ key: 'lidar', kind: 'image', fileId: 'file/camera/a.lidar.png' }]);
  });

  it('skips a point sidecar that holds no list, and an image item with no file', async () => {
    stubItems([
      frame('a'),
      points('radar', 'a', { detections: 3 }),
      { ...image('lidar', 'a'), fileId: undefined },
    ]);

    const result = await materializeTasks(rig(), { kind: 'filter' });

    expect(result.sensors).toEqual({ lidar: 0, radar: 0 });
  });
});

describe('toPoints', () => {
  it('reads u/v objects, x/y objects and triples, with the usual names for the reading', () => {
    expect(
      toPoints([
        { u: 1, v: 2, value: 3 },
        { x: 4, y: 5, depth: 6 },
        { u: 7, v: 8, rcs: '9.5' },
        { u: 1, v: 1 },
        [2, 3],
        [2, 3, 4],
      ])
    ).toEqual([
      { u: 1, v: 2, value: 3 },
      { u: 4, v: 5, value: 6 },
      { u: 7, v: 8, value: 9.5 },
      { u: 1, v: 1 },
      { u: 2, v: 3 },
      { u: 2, v: 3, value: 4 },
    ]);
  });

  it('drops entries that have no position, and refuses what is not a list', () => {
    expect(toPoints([{ u: 'a', v: 1 }, null, 5, { u: Number.NaN, v: 1 }, { u: 1, v: 2 }])).toEqual([{ u: 1, v: 2 }]);
    expect(toPoints({ nope: true })).toBeUndefined();
    expect(toPoints('text')).toBeUndefined();
    expect(toPoints(null)).toBeUndefined();
  });

  it('stops at the most a frame shows', () => {
    const many = Array.from({ length: MAX_POINTS_PER_FRAME + 50 }, (_, i) => ({ u: i, v: i }));
    expect(toPoints(many)).toHaveLength(MAX_POINTS_PER_FRAME);
  });
});

describe('manifest path', () => {
  beforeEach(() => stubItems([frame('a'), frame('b'), frame('c')]));

  it("materializes from the dataset's manifest, keeping each row's stratum", async () => {
    mockedDatasets.getManifest.mockResolvedValue([
      { stem: 'c', attributes: { stratum: 'night' } },
      { stem: 'a', attributes: {} },
      { stem: 'zz', attributes: {} },
    ]);
    const job = makeJob();

    const result = await materializeTasks(job, { kind: 'manifest' });

    expect(result).toMatchObject({ tasks: 2, missing: ['zz'] });
    expect(inserted().map((task) => task.stratum)).toEqual(['night', undefined]);
    expect(job.selection).toEqual({ kind: 'manifest', spec: { source: 'dataset', rows: 2, missing: 1 } });
  });

  it('parses inline manifest content', async () => {
    const job = makeJob();

    await materializeTasks(job, { kind: 'manifest', content: 'filename,stratum\nb.png,day\n', format: 'csv' });

    expect(mockedDatasets.getManifest).not.toHaveBeenCalled();
    expect(inserted()).toHaveLength(1);
    expect(job.selection!.spec).toMatchObject({ source: 'inline' });
  });

  it('fails without any manifest or when nothing matches', async () => {
    mockedDatasets.getManifest.mockResolvedValue([]);
    await expect(materializeTasks(makeJob(), { kind: 'manifest' })).rejects.toThrow(BadRequestError);

    mockedDatasets.getManifest.mockResolvedValue([{ stem: 'nope', attributes: {} }]);
    await expect(materializeTasks(makeJob(), { kind: 'manifest' })).rejects.toThrow('No manifest row matches');
    expect(mockedTask.deleteMany).not.toHaveBeenCalled();
  });
});
