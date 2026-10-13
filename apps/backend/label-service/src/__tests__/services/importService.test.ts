jest.mock('../../models/LabelJob', () => ({
  MAX_CLASSES: 100,
  LabelJob: { updateOne: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { find: jest.fn(), updateOne: jest.fn(), countDocuments: jest.fn() },
}));
jest.mock('../../models/LabelAnnotation', () => ({
  LabelAnnotation: { findOneAndUpdate: jest.fn() },
}));
jest.mock('../../models/LabelSuggestion', () => ({
  LabelSuggestion: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock('../../clients/datasetServiceClient', () => ({}));
jest.mock('../../clients/fileServiceClient', () => ({
  putFile: jest.fn(),
  deleteFile: jest.fn(),
  jobFolder: (jobId: string) => `label/${jobId}/`,
}));

import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importLabels, normalizeNames } from '../../services/importService';
import { LabelJob } from '../../models/LabelJob';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import { LabelSuggestion } from '../../models/LabelSuggestion';
import * as files from '../../clients/fileServiceClient';
import { ZipWriter } from '../../utils/zip';
import { decodePng, encodeGrayscalePng } from '../../utils/png';
import type { ILabelJob } from '../../models/LabelJob';
import type { ImportQuery } from '../../validation/jobSchemas';

const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnnotation = LabelAnnotation as unknown as Record<string, jest.Mock>;
const mockedSuggestion = LabelSuggestion as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;

const user = { id: 'u1', email: 'Manager@X.com', name: 'Manager' };

const makeJob = (overrides: Record<string, unknown> = {}): ILabelJob =>
  ({
    _id: 'j1',
    status: 'draft',
    redundancy: 1,
    classes: [
      { key: 'car', name: 'Car', color: '#ff0000', tools: ['box', 'mask'], maskIndex: 1 },
      { key: 'road', name: 'Road', color: '#00ff00', tools: ['mask'], maskIndex: 2, modelClass: 'street' },
      { key: 'sign', name: 'Traffic sign', color: '#0000ff', tools: ['box'], maskIndex: 3 },
    ],
    ...overrides,
  }) as unknown as ILabelJob;

const taskDoc = (id: string, stem: string, size: Record<string, number> = { width: 8, height: 6 }) => ({
  _id: id,
  frame: { fileId: `f-${id}`, path: `camera/${stem}.jpg`, stem, ...size },
});

const query = (overrides: Partial<Record<keyof ImportQuery, unknown>> = {}): ImportQuery =>
  ({ dryRun: 'false', as: 'suggestions', classMap: {}, ...overrides }) as ImportQuery;

let folder: string;
beforeEach(async () => {
  jest.clearAllMocks();
  folder = await mkdtemp(join(tmpdir(), 'import-test-'));
  mockedTask.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([taskDoc('t1', '0001'), taskDoc('t2', '0002')]) });
  mockedTask.countDocuments.mockResolvedValue(1);
  mockedTask.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockedSuggestion.findOne.mockResolvedValue(null);
  mockedSuggestion.findOneAndUpdate.mockResolvedValue({});
  mockedAnnotation.findOneAndUpdate.mockResolvedValue(null);
  mockedFiles.putFile.mockResolvedValue(undefined);
  mockedFiles.deleteFile.mockResolvedValue(undefined);
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const zip = async (entries: Record<string, Buffer | string>): Promise<string> => {
  const path = join(folder, `${Math.random().toString(36).slice(2)}.zip`);
  const out = createWriteStream(path);
  const writer = new ZipWriter(out);
  for (const [name, data] of Object.entries(entries)) await writer.add(name, data);
  await writer.finish();
  await new Promise<void>((resolve) => out.end(resolve));
  return path;
};

const yoloArchive = () =>
  zip({
    'data.yaml': 'names: [Car, street, Pedestrian, Traffic sign]\n',
    'labels/0001.txt': '0 0.25 0.25 0.5 0.5\n2 0.5 0.5 0.25 0.25\n3 0.75 0.75 0.2 0.2\n1 0.5 0.5 0.5 0.5\n',
    'labels/0002.txt': '0 0.5 0.5 0.5 0.5\n',
    'labels/9999.txt': '0 0.5 0.5 0.5 0.5\n',
  });

describe('importing boxes', () => {
  it('previews what would happen without storing anything', async () => {
    const report = await importLabels(makeJob(), user, await yoloArchive(), query({ dryRun: 'true' }));

    expect(report).toMatchObject({
      format: 'yolo',
      formatName: 'YOLO',
      dryRun: true,
      as: 'suggestions',
      frames: { inFile: 3, matched: 2, unmatched: 1, unmatchedSample: ['9999'] },
      // Car ×2 and Traffic sign; street → road takes masks only, Pedestrian has no class.
      boxes: 3,
      maskFrames: 0,
      createdClasses: [],
    });
    expect(report.classes).toEqual([
      { name: 'Car', boxes: 2, maskFrames: 0, target: 'car', matched: true },
      { name: 'street', boxes: 1, maskFrames: 0, target: 'road', matched: true },
      { name: 'Pedestrian', boxes: 1, maskFrames: 0, target: null, matched: false },
      { name: 'Traffic sign', boxes: 1, maskFrames: 0, target: 'sign', matched: true },
    ]);
    expect(mockedSuggestion.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockedFiles.putFile).not.toHaveBeenCalled();
    expect(mockedJob.updateOne).not.toHaveBeenCalled();
  });

  it('stores each frame’s boxes as suggestions on the matching task, for classes with a box tool', async () => {
    const report = await importLabels(makeJob(), user, await yoloArchive(), query());

    expect(report.dryRun).toBe(false);
    expect(mockedSuggestion.findOneAndUpdate).toHaveBeenCalledTimes(2);
    const [filter, update, options] = mockedSuggestion.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ taskId: 't1', source: 'import' });
    // street → road is a mask-only class, so its box is not kept; Pedestrian has no class.
    expect(update.$set.objects.map((object: { classKey: string }) => object.classKey)).toEqual(['car', 'sign']);
    expect(update.$set.objects[0]).toMatchObject({ bbox: [0, 0, 4, 3], source: 'import' });
    expect(update.$set.objects[0].id).toEqual(expect.any(String));
    expect(update.$set.jobId).toBe('j1');
    expect(update.$unset).toEqual({ mask: '' });
    expect(options).toEqual({ upsert: true });
    expect(mockedAnnotation.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('counts frames in the file that the job does not have', async () => {
    mockedTask.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([taskDoc('t1', '0001')]) });

    const report = await importLabels(makeJob(), user, await yoloArchive(), query({ dryRun: 'true' }));

    expect(report.frames).toEqual({ inFile: 3, matched: 1, unmatched: 2, unmatchedSample: ['0002', '9999'] });
  });

  it('lists frames of a format that reads them without needing the job’s size', async () => {
    const archive = await zip({
      'job.json': JSON.stringify({ classes: [{ key: 'car', name: 'Car', maskIndex: 1 }] }),
      'annotations.jsonl': '{"stem":"0001","objects":[]}\n',
    });
    mockedTask.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([taskDoc('t1', '0001', {})]) });

    const report = await importLabels(makeJob(), user, archive, query({ dryRun: 'true' }));

    // The task has no recorded size, so the bundle's frame cannot be placed; it is still counted.
    expect(report.format).toBe('visin');
    expect(report.frames).toMatchObject({ inFile: 1, matched: 0, unmatched: 1 });
  });
});

describe('class choices', () => {
  it('lets the caller map a class to another, skip it, or create it', async () => {
    const report = await importLabels(
      makeJob(),
      user,
      await yoloArchive(),
      query({
        dryRun: 'true',
        classMap: { Car: 'sign', street: null, Pedestrian: '+' },
      })
    );

    expect(report.classes.map((plan) => [plan.name, plan.target, plan.matched])).toEqual([
      ['Car', 'sign', false],
      ['street', null, false],
      ['Pedestrian', '+', false],
      ['Traffic sign', 'sign', true],
    ]);
    // Counts what will be brought in: Car→sign (2) + Pedestrian (1, as a new class) + Traffic sign (1).
    expect(report.boxes).toBe(4);
    expect(mockedJob.updateOne).not.toHaveBeenCalled();
  });

  it('adds the classes asked for to the job, numbering them after the existing ones', async () => {
    const report = await importLabels(
      makeJob(),
      user,
      await yoloArchive(),
      query({ classMap: { Pedestrian: '+' } })
    );

    expect(report.createdClasses).toEqual(['pedestrian']);
    const [filter, update] = mockedJob.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'j1' });
    expect(update.$push.classes.$each).toEqual([
      { key: 'pedestrian', name: 'Pedestrian', color: '#eda100', hotkey: '4', tools: ['box', 'mask'], maskIndex: 4 },
    ]);
    const stored = mockedSuggestion.findOneAndUpdate.mock.calls[0][1].$set.objects;
    expect(stored.map((object: { classKey: string }) => object.classKey)).toEqual(['car', 'pedestrian', 'sign']);
  });

  it('refuses a class key the job does not have', async () => {
    await expect(
      importLabels(makeJob(), user, await yoloArchive(), query({ classMap: { Car: 'tractor' } }))
    ).rejects.toThrow('"tractor" is not a class of this job');
    expect(mockedSuggestion.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('importing masks', () => {
  const maskArchive = async (extra: Record<string, Buffer | string> = {}) => {
    const data = new Uint8Array(8 * 6);
    data[0] = 1; // car
    data[1] = 1;
    data[2] = 2; // road
    data[3] = 3; // sign: a box-only class in the job, so its pixels are dropped
    return zip({
      'classes.json': JSON.stringify([
        { index: 1, name: 'Car' },
        { index: 2, name: 'Road' },
        { index: 3, name: 'Traffic sign' },
      ]),
      'masks/0001.png': encodeGrayscalePng(8, 6, data),
      ...extra,
    });
  };

  it('reports how many frames paint each class, counting only classes that take a mask', async () => {
    const report = await importLabels(makeJob(), user, await maskArchive(), query({ dryRun: 'true' }));

    expect(report.format).toBe('semantic-png');
    expect(report.maskFrames).toBe(1);
    expect(report.classes.map((plan) => [plan.name, plan.maskFrames, plan.target])).toEqual([
      ['Car', 1, 'car'],
      ['Road', 1, 'road'],
      ['Traffic sign', 1, 'sign'],
    ]);
  });

  it('stores the mask as a PNG remapped to the job’s mask values, as a suggestion', async () => {
    await importLabels(makeJob(), user, await maskArchive(), query());

    const [fileId, png] = mockedFiles.putFile.mock.calls[0];
    expect(fileId).toMatch(/^label\/j1\/suggestions\/t1-[0-9a-f-]+\.png$/);
    const decoded = decodePng(png);
    // Sign pixels (3) are not a mask class in this job, so they are unlabeled.
    expect(Array.from(decoded.data.slice(0, 4))).toEqual([1, 1, 2, 0]);
    const update = mockedSuggestion.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.mask).toEqual({ fileId, width: 8, height: 6, pixels: { '1': 2, '2': 1 } });
    expect(update.$unset).toBeUndefined();
  });

  it('replaces the previous suggestion for the frame, and removes its file', async () => {
    mockedSuggestion.findOne.mockResolvedValue({ mask: { fileId: 'label/j1/suggestions/old.png' } });

    await importLabels(makeJob(), user, await maskArchive(), query());

    expect(mockedFiles.deleteFile).toHaveBeenCalledWith('label/j1/suggestions/old.png');
  });

  it('keeps going when removing the old file fails', async () => {
    mockedSuggestion.findOne.mockResolvedValue({ mask: { fileId: 'old' } });
    mockedFiles.deleteFile.mockRejectedValue(new Error('down'));

    await expect(importLabels(makeJob(), user, await maskArchive(), query())).resolves.toBeDefined();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('leaves out a mask whose size is not the frame’s', async () => {
    mockedTask.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([taskDoc('t1', '0001', { width: 16, height: 12 })]),
    });

    const report = await importLabels(makeJob(), user, await maskArchive(), query());

    // The reader itself refuses a size that differs from the job's frame.
    expect(report.maskFrames).toBe(0);
    expect(report.warnings).toEqual(['masks/0001.png: mask size differs from the frame']);
    expect(mockedFiles.putFile).not.toHaveBeenCalled();
  });

  it('leaves out a bundle mask that is not the frame’s size', async () => {
    const archive = await zip({
      'job.json': JSON.stringify({ classes: [{ key: 'car', name: 'Car', maskIndex: 1 }] }),
      'annotations.jsonl': '{"stem":"0001","mask":"masks/0001.png","objects":[]}\n',
      'masks/0001.png': encodeGrayscalePng(4, 3, new Uint8Array(12).fill(1)),
    });

    const report = await importLabels(makeJob(), user, archive, query());

    expect(report.maskFrames).toBe(0);
    expect(report.warnings).toEqual(['0001: mask is 4×3, the frame is 8×6']);
    expect(mockedFiles.putFile).not.toHaveBeenCalled();
  });

  it('leaves out a mask that holds nothing for this job’s classes', async () => {
    const archive = await zip({
      'classes.json': JSON.stringify([{ index: 1, name: 'Unrelated' }]),
      'masks/0001.png': encodeGrayscalePng(8, 6, new Uint8Array(48).fill(1)),
    });

    const report = await importLabels(makeJob(), user, archive, query());

    expect(report.maskFrames).toBe(0);
    expect(mockedSuggestion.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('importing as finished labels', () => {
  it('keeps explicit negative frames, without turning rejected or malformed labels into negatives', async () => {
    const archive = await zip({
      'data.yaml': 'names: [Unknown]\n',
      'labels/0001.txt': '',
      'labels/0002.txt': '0 0.5 0.5 0.5 0.5\n',
    });
    await importLabels(makeJob(), user, archive, query({ as: 'done' }));
    expect(mockedAnnotation.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockedAnnotation.findOneAndUpdate.mock.calls[0][0].taskId).toBe('t1');
    expect(mockedAnnotation.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ status: 'done', objects: [] });

    mockedAnnotation.findOneAndUpdate.mockClear();
    const malformed = await zip({ 'data.yaml': 'names: [Car]\n', 'labels/0001.txt': 'not valid labels' });
    await importLabels(makeJob(), user, malformed, query({ as: 'done' }));
    expect(mockedAnnotation.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('stores them as the importer’s own done annotation and counts the frame once', async () => {
    const report = await importLabels(makeJob({ status: 'draft' }), user, await yoloArchive(), query({ as: 'done' }));

    expect(report.as).toBe('done');
    expect(mockedSuggestion.findOneAndUpdate).not.toHaveBeenCalled();
    const [filter, update, options] = mockedAnnotation.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ taskId: 't1', userId: 'u1' });
    expect(update.$set).toMatchObject({ jobId: 'j1', userEmail: 'manager@x.com', userName: 'Manager', status: 'done' });
    expect(update.$set.doneAt).toBeInstanceOf(Date);
    expect(options).toEqual({ upsert: true, returnDocument: 'before' });
    expect(mockedTask.updateOne).toHaveBeenCalledWith(
      { _id: 't1', answeredBy: { $ne: 'u1' } },
      {
        $inc: { answersCount: 1 },
        $addToSet: { answeredBy: 'u1' },
        $pull: { skippedBy: 'u1' },
        $unset: { leasedBy: '', leaseExpiresAt: '' },
      }
    );
    // A draft job is not completed by importing into it.
    expect(mockedJob.updateOne).not.toHaveBeenCalled();
  });

  it('does not count a frame the importer had already finished, and removes the mask it replaces', async () => {
    mockedAnnotation.findOneAndUpdate.mockResolvedValue({ status: 'done', mask: { fileId: 'label/j1/masks/old.png' } });
    mockedTask.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    const archive = await zip({
      'classes.json': JSON.stringify([{ index: 1, name: 'Car' }]),
      'masks/0001.png': encodeGrayscalePng(8, 6, new Uint8Array(48).fill(1)),
    });

    await importLabels(makeJob(), user, archive, query({ as: 'done' }));

    expect(mockedTask.updateOne.mock.calls[0][0]).toEqual({ _id: 't1', answeredBy: { $ne: 'u1' } });
    expect(mockedTask.updateOne.mock.calls[1][1]).not.toHaveProperty('$inc');
    expect(mockedFiles.deleteFile).toHaveBeenCalledWith('label/j1/masks/old.png');
    const update = mockedAnnotation.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.mask.fileId).toMatch(/^label\/j1\/masks\/t1-/);
  });

  it('completes an active job once the import has finished every frame', async () => {
    mockedTask.countDocuments.mockResolvedValue(0);

    await importLabels(makeJob({ status: 'active' }), user, await yoloArchive(), query({ as: 'done' }));

    expect(mockedJob.updateOne).toHaveBeenCalledWith({ _id: 'j1', status: 'active' }, { $set: { status: 'completed' } });
  });

  it('does not touch labels on a dry run', async () => {
    await importLabels(makeJob(), user, await yoloArchive(), query({ as: 'done', dryRun: 'true' }));

    expect(mockedAnnotation.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockedTask.updateOne).not.toHaveBeenCalled();
  });

  it('records no email address when the importer has none', async () => {
    await importLabels(makeJob(), { id: 'u1' } as never, await yoloArchive(), query({ as: 'done' }));
    const set = mockedAnnotation.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.userEmail).toBe('');
    expect(set).not.toHaveProperty('userName');
  });
});

describe('what it refuses', () => {
  it('says so when it cannot tell what the archive is', async () => {
    await expect(importLabels(makeJob(), user, await zip({ 'readme.md': 'hi' }), query())).rejects.toThrow(
      'Could not recognise these labels'
    );
  });

  it('reads the format the caller named, rather than guessing', async () => {
    const archive = await zip({ 'a/0001.txt': '0 0.5 0.5 0.5 0.5\n', 'classes.txt': 'Car\n' });

    const report = await importLabels(makeJob(), user, archive, query({ dryRun: 'true', format: 'yolo' }));

    expect(report.format).toBe('yolo');
    expect(report.boxes).toBe(1);
  });

  it('rejects a file that is not a zip', async () => {
    const path = join(folder, 'not.zip');
    await (await import('node:fs/promises')).writeFile(path, 'definitely not a zip file at all, no.');
    await expect(importLabels(makeJob(), user, path, query())).rejects.toThrow('Not a zip archive');
  });

  it('closes the archive when a format fails to read it', async () => {
    const archive = await zip({
      'job.json': '{}',
      'annotations.jsonl': '{"stem":"0001","mask":"masks/0001.png","objects":[]}\n',
      'masks/0001.png': 'not a png',
    });

    await expect(importLabels(makeJob(), user, archive, query())).rejects.toThrow('Not a PNG');
  });
});

describe('normalizeNames', () => {
  it('removes a single wrapping folder, macOS metadata and directory entries', () => {
    expect(normalizeNames(['export/', 'export/labels/a.txt', 'export/data.yaml', '__MACOSX/export/._a.txt', 'export/.DS_Store'])).toEqual({
      names: ['labels/a.txt', 'data.yaml'],
      strip: 'export/',
    });
  });

  it('keeps names as they are when files sit at the root or in several folders', () => {
    expect(normalizeNames(['data.yaml', 'labels/a.txt']).strip).toBe('');
    expect(normalizeNames(['images/a.png', 'labels/a.txt']).strip).toBe('');
    expect(normalizeNames(['a.txt']).names).toEqual(['a.txt']);
  });
});
