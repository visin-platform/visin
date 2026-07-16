jest.mock('../../models/LabelBundle', () => ({
  LabelBundle: { findById: jest.fn() },
}));
jest.mock('../../models/LabelImage', () => ({
  LabelImage: { find: jest.fn() },
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { deleteMany: jest.fn(), insertMany: jest.fn() },
}));

import { materializeTasks } from '../../services/materializationService';
import { LabelBundle } from '../../models/LabelBundle';
import { LabelImage } from '../../models/LabelImage';
import { LabelTask } from '../../models/LabelTask';
import { BadRequestError, ConflictError } from '@visin/backend-core';
import type { ILabelJob } from '../../models/LabelJob';

const mockedBundle = LabelBundle as unknown as Record<string, jest.Mock>;
const mockedImage = LabelImage as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;

const frame = (stem: string) => ({ _id: `frame-${stem}`, stem, kind: 'frame', path: `frames/${stem}.png` });
const layer = (set: string, stem: string) => ({ _id: `layer-${set}-${stem}`, stem, kind: 'layer', annotationSet: set });
const idmap = (set: string, stem: string, masks: unknown[] = [{ id: 1, class: 'vehicle' }]) => ({
  _id: `idmap-${set}-${stem}`,
  stem,
  kind: 'idmap',
  annotationSet: set,
  metadata: { masks },
});

const makeJob = (overrides: Partial<ILabelJob> = {}): ILabelJob =>
  ({
    _id: 'j1',
    status: 'draft',
    bundleId: 'b1',
    taskType: 'mask_toggle',
    annotationSets: ['setA'],
    save: jest.fn(),
    ...overrides,
  }) as unknown as ILabelJob;

const readyBundle = (overrides: Record<string, unknown> = {}) => ({
  _id: 'b1',
  status: 'ready',
  annotationSets: ['setA', 'setB'],
  manifest: undefined,
  ...overrides,
});

const stubImages = (frames: unknown[], annotationImages: unknown[]) => {
  // The frames query filters kind: 'frame' and chains .sort(); the annotation
  // query (only issued when the job has annotation sets) resolves directly.
  mockedImage.find.mockImplementation((query: { kind: unknown }) =>
    query.kind === 'frame'
      ? { sort: jest.fn().mockResolvedValue(frames) }
      : Promise.resolve(annotationImages)
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedTask.deleteMany.mockResolvedValue({});
  mockedTask.insertMany.mockResolvedValue([]);
});

describe('materializeTasks guards', () => {
  it('requires a draft job with a ready bundle', async () => {
    await expect(materializeTasks(makeJob({ status: 'active' }), { kind: 'filter' })).rejects.toThrow(ConflictError);

    await expect(materializeTasks(makeJob({ bundleId: undefined }), { kind: 'filter' })).rejects.toThrow('no bundle');

    mockedBundle.findById.mockResolvedValue({ status: 'importing' });
    await expect(materializeTasks(makeJob(), { kind: 'filter' })).rejects.toThrow('not ready');
  });

  it('rejects annotation sets missing from the bundle', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());

    await expect(
      materializeTasks(makeJob({ annotationSets: ['nope'] }), { kind: 'filter' })
    ).rejects.toThrow('Annotation sets not in bundle: nope');
  });

  it('requires exactly one set for mask_toggle', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());

    await expect(
      materializeTasks(makeJob({ annotationSets: ['setA', 'setB'] }), { kind: 'filter' })
    ).rejects.toThrow('exactly one annotation set');
  });

  it('requires an id map per frame for mask_toggle', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([frame('a'), frame('b')], [layer('setA', 'a'), idmap('setA', 'a')]);

    await expect(materializeTasks(makeJob(), { kind: 'filter' })).rejects.toThrow('missing for: b');
  });
});

describe('manifest path', () => {
  it('materializes from the bundle manifest with strata and layer/idmap resolution', async () => {
    mockedBundle.findById.mockResolvedValue(
      readyBundle({ manifest: [{ stem: 'a', stratum: 'vehicle' }, { stem: 'ghost' }] })
    );
    stubImages([frame('a')], [layer('setA', 'a'), idmap('setA', 'a')]);
    const job = makeJob();

    const result = await materializeTasks(job, { kind: 'manifest' });

    expect(result).toEqual({ tasks: 1, missing: ['ghost'] });
    expect(mockedTask.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    expect(mockedTask.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        labelImageId: 'frame-a',
        order: 0,
        stratum: 'vehicle',
        payload: {
          layers: [{ set: 'setA', imageId: 'layer-setA-a' }],
          maskMap: { imageId: 'idmap-setA-a', masks: [{ id: 1, class: 'vehicle' }] },
        },
      }),
    ]);
    expect(job.tasksCount).toBe(1);
    expect(job.selection).toMatchObject({ kind: 'manifest', spec: { source: 'bundle', rows: 1, missing: 1 } });
  });

  it('parses inline manifest content', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([frame('a')], [idmap('setA', 'a')]);

    const result = await materializeTasks(makeJob(), {
      kind: 'manifest',
      content: 'filename,stratum\na.png,s1',
      format: 'csv',
    });

    expect(result.tasks).toBe(1);
  });

  it('fails without any manifest or when nothing matches', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([frame('a')], []);
    await expect(materializeTasks(makeJob({ taskType: 'single_choice' }), { kind: 'manifest' })).rejects.toThrow(
      'No manifest'
    );

    mockedBundle.findById.mockResolvedValue(readyBundle({ manifest: [{ stem: 'ghost' }] }));
    stubImages([frame('a')], []);
    await expect(materializeTasks(makeJob({ taskType: 'single_choice' }), { kind: 'manifest' })).rejects.toThrow(
      'matches a frame'
    );
  });
});

describe('filter path', () => {
  it('takes all frames when sampleN is absent', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([frame('a'), frame('b')], []);
    const job = makeJob({ taskType: 'single_choice', annotationSets: [] });

    const result = await materializeTasks(job, { kind: 'filter' });

    expect(result.tasks).toBe(2);
    // No layers and no maskMap → tasks carry no payload at all.
    expect(mockedTask.insertMany.mock.calls[0][0][0].payload).toBeUndefined();
  });

  it('samples deterministically with a seed', async () => {
    const frames = ['a', 'b', 'c', 'd', 'e'].map(frame);
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages(frames, []);
    const job = makeJob({ taskType: 'single_choice', annotationSets: [] });

    await materializeTasks(job, { kind: 'filter', sampleN: 2, seed: 7 });
    const firstPick = mockedTask.insertMany.mock.calls[0][0].map((task: { labelImageId: string }) => task.labelImageId);

    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages(frames, []);
    await materializeTasks(job, { kind: 'filter', sampleN: 2, seed: 7 });
    const secondPick = mockedTask.insertMany.mock.calls[1][0].map((task: { labelImageId: string }) => task.labelImageId);

    expect(firstPick).toHaveLength(2);
    expect(secondPick).toEqual(firstPick);
  });

  it('fails on an empty bundle', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([], []);

    await expect(
      materializeTasks(makeJob({ taskType: 'single_choice', annotationSets: [] }), { kind: 'filter' })
    ).rejects.toThrow(BadRequestError);
  });
});
