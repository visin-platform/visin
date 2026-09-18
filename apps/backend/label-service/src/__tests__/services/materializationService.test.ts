jest.mock('../../clients/datasetServiceClient', () => ({
  getDataset: jest.fn(),
  listItems: jest.fn(),
  getManifest: jest.fn()
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { deleteMany: jest.fn(), insertMany: jest.fn() },
}));

import { materializeTasks } from '../../services/materializationService';
import * as datasets from '../../clients/datasetServiceClient';
import { LabelTask } from '../../models/LabelTask';
import { BadRequestError, ConflictError } from '@visin/backend-core';
import type { ILabelJob } from '../../models/LabelJob';

const mockedDatasets = datasets as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;

const frame = (stem: string) => ({
  _id: `frame-${stem}`,
  group: 'frames',
  path: `frames/${stem}.png`,
  stem,
  kind: 'image' as const,
  fileId: `file/frames/${stem}.png`,
  width: 4,
  height: 2
});
const layer = (set: string, stem: string) => ({
  _id: `layer-${set}-${stem}`,
  group: set,
  path: `${set}/${stem}.png`,
  stem,
  kind: 'image' as const,
  fileId: `file/${set}/${stem}.png`
});
const idmap = (set: string, stem: string) => ({
  _id: `idmap-${set}-${stem}`,
  group: set,
  path: `${set}/${stem}.ids.png`,
  stem,
  variant: 'ids',
  kind: 'image' as const,
  fileId: `file/${set}/${stem}.ids.png`
});
const masksOf = (set: string, stem: string, masks: unknown[] = [{ id: 1, class: 'vehicle' }]) => ({
  _id: `masks-${set}-${stem}`,
  group: set,
  path: `${set}/${stem}.masks.json`,
  stem,
  variant: 'masks',
  kind: 'json' as const,
  data: masks
});

const makeJob = (overrides: Partial<ILabelJob> = {}): ILabelJob =>
  ({
    _id: 'j1',
    status: 'draft',
    datasetId: 'd1',
    framesGroup: 'frames',
    taskType: 'mask_toggle',
    annotationSets: ['setA'],
    save: jest.fn(),
    ...overrides,
  }) as unknown as ILabelJob;

const dataset = (groups = ['frames', 'setA', 'setB']) => ({
  _id: 'd1',
  name: 'VLM',
  ownerId: 'u1',
  visibility: 'public' as const,
  groups: groups.map((name) => ({ name, images: 1, jsons: 0 })),
  imageCount: groups.length
});

/** Serve the dataset's items the way dataset-service would, per group and kind. */
const stubItems = (items: ReturnType<typeof frame | typeof layer | typeof idmap | typeof masksOf>[]) => {
  mockedDatasets.listItems.mockImplementation(async (_id: string, filter: { group: string; kind: string; variant?: string; noVariant?: boolean }) =>
    items.filter(
      (item) =>
        item.group === filter.group &&
        item.kind === filter.kind &&
        (filter.variant === undefined || ('variant' in item ? item.variant : undefined) === filter.variant) &&
        (!filter.noVariant || !('variant' in item && item.variant))
    )
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedDatasets.getDataset.mockResolvedValue(dataset());
  mockedDatasets.getManifest.mockResolvedValue([]);
  mockedTask.deleteMany.mockResolvedValue({});
  mockedTask.insertMany.mockResolvedValue([]);
  stubItems([]);
});

describe('materializeTasks guards', () => {
  it('requires a draft job with a dataset', async () => {
    await expect(materializeTasks(makeJob({ status: 'active' }), { kind: 'filter' })).rejects.toThrow(ConflictError);
    await expect(materializeTasks(makeJob({ datasetId: undefined }), { kind: 'filter' })).rejects.toThrow('no dataset');
  });

  it('rejects a frames group or annotation set the dataset does not have', async () => {
    await expect(materializeTasks(makeJob({ framesGroup: 'camera' }), { kind: 'filter' })).rejects.toThrow(
      'no image group "camera"'
    );
    await expect(materializeTasks(makeJob({ annotationSets: ['nope'] }), { kind: 'filter' })).rejects.toThrow(
      'Annotation sets not in dataset: nope'
    );
  });

  it('requires exactly one set for mask_toggle', async () => {
    await expect(materializeTasks(makeJob({ annotationSets: ['setA', 'setB'] }), { kind: 'filter' })).rejects.toThrow(
      'exactly one annotation set'
    );
  });

  it('requires an id map for every manifest-named frame in a mask_toggle job', async () => {
    mockedDatasets.getManifest.mockResolvedValue([
      { stem: 'a', attributes: {} },
      { stem: 'b', attributes: {} }
    ]);
    stubItems([frame('a'), frame('b'), layer('setA', 'a'), idmap('setA', 'a')]);

    await expect(materializeTasks(makeJob(), { kind: 'manifest' })).rejects.toThrow('missing for: b');
  });
});

describe('manifest path', () => {
  it("materializes from the dataset's manifest, copying what each task shows", async () => {
    mockedDatasets.getManifest.mockResolvedValue([
      { stem: 'a', attributes: { stratum: 'vehicle' } },
      { stem: 'ghost', attributes: {} }
    ]);
    stubItems([frame('a'), layer('setA', 'a'), idmap('setA', 'a'), masksOf('setA', 'a')]);
    const job = makeJob();

    const result = await materializeTasks(job, { kind: 'manifest' });

    expect(result).toEqual({ tasks: 1, missing: ['ghost'] });
    expect(mockedTask.deleteMany).toHaveBeenCalledWith({ jobId: 'j1' });
    expect(mockedTask.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        frame: { fileId: 'file/frames/a.png', path: 'frames/a.png', stem: 'a', width: 4, height: 2 },
        order: 0,
        stratum: 'vehicle',
        payload: {
          layers: [{ set: 'setA', fileId: 'file/setA/a.png' }],
          maskMap: { fileId: 'file/setA/a.ids.png', masks: [{ id: 1, class: 'vehicle' }] },
        },
      }),
    ]);
    expect(job.tasksCount).toBe(1);
    expect(job.selection).toMatchObject({ kind: 'manifest', spec: { source: 'dataset', rows: 1, missing: 1 } });
  });

  it('parses inline manifest content', async () => {
    stubItems([frame('a'), idmap('setA', 'a')]);

    const result = await materializeTasks(makeJob(), {
      kind: 'manifest',
      content: 'filename,stratum\na.png,s1',
      format: 'csv',
    });

    expect(result.tasks).toBe(1);
    expect(mockedDatasets.getManifest).not.toHaveBeenCalled();
  });

  it('fails without any manifest or when nothing matches', async () => {
    stubItems([frame('a')]);
    await expect(materializeTasks(makeJob({ taskType: 'single_choice' }), { kind: 'manifest' })).rejects.toThrow(
      'No manifest'
    );

    mockedDatasets.getManifest.mockResolvedValue([{ stem: 'ghost', attributes: {} }]);
    await expect(materializeTasks(makeJob({ taskType: 'single_choice' }), { kind: 'manifest' })).rejects.toThrow(
      'matches a frame'
    );
  });
});

describe('filter path', () => {
  it('takes all frames when sampleN is absent, in path order', async () => {
    stubItems([frame('b'), frame('a')]);
    const job = makeJob({ taskType: 'single_choice', annotationSets: [] });

    const result = await materializeTasks(job, { kind: 'filter' });

    expect(result.tasks).toBe(2);
    expect(mockedTask.insertMany.mock.calls[0][0].map((task: { frame: { stem: string } }) => task.frame.stem)).toEqual(['a', 'b']);
    // No layers and no maskMap → tasks carry no payload at all.
    expect(mockedTask.insertMany.mock.calls[0][0][0].payload).toBeUndefined();
  });

  it('samples deterministically with a seed', async () => {
    const frames = ['a', 'b', 'c', 'd', 'e'].map(frame);
    stubItems(frames);
    const job = makeJob({ taskType: 'single_choice', annotationSets: [] });

    await materializeTasks(job, { kind: 'filter', sampleN: 2, seed: 7 });
    const firstPick = mockedTask.insertMany.mock.calls[0][0].map((task: { frame: { stem: string } }) => task.frame.stem);

    await materializeTasks(job, { kind: 'filter', sampleN: 2, seed: 7 });
    const secondPick = mockedTask.insertMany.mock.calls[1][0].map((task: { frame: { stem: string } }) => task.frame.stem);

    expect(firstPick).toHaveLength(2);
    expect(secondPick).toEqual(firstPick);
  });

  it('scopes a mask_toggle job to the frames its own set covers', async () => {
    // One dataset, two sets painted on different frames — a job on setA gets
    // setA's frames and ignores the ones only setB annotates.
    stubItems([frame('a'), frame('b'), frame('c'), idmap('setA', 'a'), idmap('setB', 'b'), idmap('setB', 'c')]);

    const result = await materializeTasks(makeJob(), { kind: 'filter' });

    expect(result.tasks).toBe(1);
    expect(mockedTask.insertMany.mock.calls[0][0][0].frame.stem).toBe('a');
  });

  it('fails when no frame carries the mask_toggle set', async () => {
    stubItems([frame('a'), idmap('setB', 'a')]);

    await expect(materializeTasks(makeJob(), { kind: 'filter' })).rejects.toThrow(
      'No frame in the dataset has an id map in "setA"'
    );
  });

  it('caps masks per field value across the whole dataset and drops emptied frames', async () => {
    // Three frames, one 'rare' mask scattered one per frame plus 'common' ones:
    // a per-frame cap could never reach a target count for 'rare', so the cap is
    // global. Frame c contributes no selected mask and gets no task.
    stubItems([
      frame('a'),
      frame('b'),
      frame('c'),
      idmap('setA', 'a'),
      idmap('setA', 'b'),
      idmap('setA', 'c'),
      masksOf('setA', 'a', [
        { id: 1, class: 'sign', stratum: 'rare' },
        { id: 2, class: 'sign', stratum: 'common' }
      ]),
      masksOf('setA', 'b', [
        { id: 1, class: 'sign', stratum: 'rare' },
        { id: 2, class: 'sign', stratum: 'common' }
      ]),
      masksOf('setA', 'c', [{ id: 1, class: 'sign', stratum: 'common' }])
    ]);
    const job = makeJob();

    const result = await materializeTasks(job, {
      kind: 'filter',
      masks: { field: 'stratum', include: ['rare'], perValue: 2, seed: 1 }
    });

    expect(result.tasks).toBe(2);
    expect(result.masks).toEqual({ rare: 2 });
    const tasks = mockedTask.insertMany.mock.calls[0][0];
    expect(tasks.map((task: { frame: { stem: string } }) => task.frame.stem).sort()).toEqual(['a', 'b']);
    // Only the selected masks reach the workbench, not every mask in the frame.
    expect(tasks[0].payload.maskMap.masks).toEqual([{ id: 1, class: 'sign', stratum: 'rare' }]);
    expect(job.selection).toMatchObject({
      kind: 'filter',
      spec: { masks: { field: 'stratum', perValue: 2, seed: 1, counts: { rare: 2 } } }
    });
  });

  it('keeps every mask of a value when no cap is given, and splits per value', async () => {
    stubItems([
      frame('a'),
      idmap('setA', 'a'),
      masksOf('setA', 'a', [
        { id: 2, class: 'sign', stratum: 'rare' },
        { id: 1, class: 'sign', stratum: 'common' }
      ])
    ]);

    const result = await materializeTasks(makeJob(), { kind: 'filter', masks: { field: 'stratum' } });

    expect(result.masks).toEqual({ rare: 1, common: 1 });
    // Sampling shuffles; the workbench still walks masks in dataset id order.
    expect(mockedTask.insertMany.mock.calls[0][0][0].payload.maskMap.masks.map((m: { id: number }) => m.id)).toEqual([1, 2]);
  });

  it('rejects a mask selection that matches nothing, or a job type without masks', async () => {
    stubItems([frame('a'), idmap('setA', 'a'), masksOf('setA', 'a', [{ id: 1, class: 'sign', stratum: 'common' }])]);

    await expect(
      materializeTasks(makeJob(), { kind: 'filter', masks: { field: 'stratum', include: ['rare'] } })
    ).rejects.toThrow('No mask matches the selection on "stratum"');

    stubItems([frame('a')]);
    await expect(
      materializeTasks(makeJob({ taskType: 'single_choice', annotationSets: [] }), {
        kind: 'filter',
        masks: { field: 'stratum' }
      })
    ).rejects.toThrow('only applies to mask_toggle');
  });

  it('copies only the layers a frame actually has, and omits absent image sizes', async () => {
    const bare = { ...frame('a'), width: undefined, height: undefined };
    stubItems([bare, frame('b'), layer('setA', 'a'), layer('setB', 'b')]);
    const job = makeJob({ taskType: 'single_choice', annotationSets: ['setA', 'setB'] });

    await materializeTasks(job, { kind: 'filter' });

    const [first, second] = mockedTask.insertMany.mock.calls[0][0];
    expect(first.frame).toEqual({ fileId: 'file/frames/a.png', path: 'frames/a.png', stem: 'a' });
    expect(first.payload).toEqual({ layers: [{ set: 'setA', fileId: 'file/setA/a.png' }] });
    expect(second.payload).toEqual({ layers: [{ set: 'setB', fileId: 'file/setB/b.png' }] });
  });

  it('ignores masks whose selector field is missing or null', async () => {
    stubItems([
      frame('a'),
      idmap('setA', 'a'),
      masksOf('setA', 'a', [
        { id: 1, class: 'sign', stratum: null },
        { id: 2, class: 'sign' },
        { id: 3, class: 'sign', stratum: 'rare' }
      ])
    ]);

    const result = await materializeTasks(makeJob(), { kind: 'filter', masks: { field: 'stratum' } });

    expect(result.masks).toEqual({ rare: 1 });
    expect(mockedTask.insertMany.mock.calls[0][0][0].payload.maskMap.masks).toEqual([{ id: 3, class: 'sign', stratum: 'rare' }]);
  });

  it('gives a mask_toggle frame an empty mask list when the set ships no masks.json', async () => {
    stubItems([frame('a'), idmap('setA', 'a')]);

    await materializeTasks(makeJob(), { kind: 'filter' });

    expect(mockedTask.insertMany.mock.calls[0][0][0].payload.maskMap).toEqual({ fileId: 'file/setA/a.ids.png', masks: [] });
  });

  it('fails on a dataset with no frames', async () => {
    await expect(
      materializeTasks(makeJob({ taskType: 'single_choice', annotationSets: [] }), { kind: 'filter' })
    ).rejects.toThrow(BadRequestError);
  });
});
