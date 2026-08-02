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

  it('requires an id map for every manifest-named frame in a mask_toggle job', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle({ manifest: [{ stem: 'a' }, { stem: 'b' }] }));
    stubImages([frame('a'), frame('b')], [layer('setA', 'a'), idmap('setA', 'a')]);

    await expect(materializeTasks(makeJob(), { kind: 'manifest' })).rejects.toThrow('missing for: b');
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

  it('scopes a mask_toggle job to the frames its own set covers', async () => {
    // One bundle, two sets painted on different frames — a job on setA gets
    // setA's frames and ignores the ones only setB annotates.
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages(
      [frame('a'), frame('b'), frame('c')],
      [idmap('setA', 'a'), idmap('setB', 'b'), idmap('setB', 'c')]
    );

    const result = await materializeTasks(makeJob(), { kind: 'filter' });

    expect(result.tasks).toBe(1);
    expect(mockedTask.insertMany.mock.calls[0][0][0].labelImageId).toBe('frame-a');
  });

  it('fails when no frame carries the mask_toggle set', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([frame('a')], [idmap('setB', 'a')]);

    await expect(materializeTasks(makeJob(), { kind: 'filter' })).rejects.toThrow(
      'No frame in the bundle has an .ids.png in "setA"'
    );
  });

  it('caps masks per field value across the whole bundle and drops emptied frames', async () => {
    // Three frames, one 'rare' mask scattered one per frame plus 'common' ones:
    // a per-frame cap could never reach a target count for 'rare', so the cap is
    // global. Frame c contributes no selected mask and gets no task.
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages(
      [frame('a'), frame('b'), frame('c')],
      [
        idmap('setA', 'a', [
          { id: 1, class: 'sign', stratum: 'rare' },
          { id: 2, class: 'sign', stratum: 'common' }
        ]),
        idmap('setA', 'b', [
          { id: 1, class: 'sign', stratum: 'rare' },
          { id: 2, class: 'sign', stratum: 'common' }
        ]),
        idmap('setA', 'c', [{ id: 1, class: 'sign', stratum: 'common' }])
      ]
    );
    const job = makeJob();

    const result = await materializeTasks(job, {
      kind: 'filter',
      masks: { field: 'stratum', include: ['rare'], perValue: 2, seed: 1 }
    });

    expect(result.tasks).toBe(2);
    expect(result.masks).toEqual({ rare: 2 });
    const tasks = mockedTask.insertMany.mock.calls[0][0];
    expect(tasks.map((task: { labelImageId: string }) => task.labelImageId).sort()).toEqual([
      'frame-a',
      'frame-b'
    ]);
    // Only the selected masks reach the workbench, not every mask in the frame.
    expect(tasks[0].payload.maskMap.masks).toEqual([{ id: 1, class: 'sign', stratum: 'rare' }]);
    expect(job.selection).toMatchObject({
      kind: 'filter',
      spec: { masks: { field: 'stratum', perValue: 2, seed: 1, counts: { rare: 2 } } }
    });
  });

  it('keeps every mask of a value when no cap is given, and splits per value', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages(
      [frame('a')],
      [
        idmap('setA', 'a', [
          { id: 2, class: 'sign', stratum: 'rare' },
          { id: 1, class: 'sign', stratum: 'common' }
        ])
      ]
    );

    const result = await materializeTasks(makeJob(), { kind: 'filter', masks: { field: 'stratum' } });

    expect(result.masks).toEqual({ rare: 1, common: 1 });
    // Sampling shuffles; the workbench still walks masks in bundle id order.
    expect(mockedTask.insertMany.mock.calls[0][0][0].payload.maskMap.masks.map((m: { id: number }) => m.id)).toEqual([
      1, 2
    ]);
  });

  it('rejects a mask selection that matches nothing, or a job type without masks', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([frame('a')], [idmap('setA', 'a', [{ id: 1, class: 'sign', stratum: 'common' }])]);

    await expect(
      materializeTasks(makeJob(), { kind: 'filter', masks: { field: 'stratum', include: ['rare'] } })
    ).rejects.toThrow('No mask matches the selection on "stratum"');

    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([frame('a')], []);
    await expect(
      materializeTasks(makeJob({ taskType: 'single_choice', annotationSets: [] }), {
        kind: 'filter',
        masks: { field: 'stratum' }
      })
    ).rejects.toThrow('only applies to mask_toggle');
  });

  it('fails on an empty bundle', async () => {
    mockedBundle.findById.mockResolvedValue(readyBundle());
    stubImages([], []);

    await expect(
      materializeTasks(makeJob({ taskType: 'single_choice', annotationSets: [] }), { kind: 'filter' })
    ).rejects.toThrow(BadRequestError);
  });
});
