// Reads go through the job's dataset; this caller contributes to it.
jest.mock('../../clients/datasetServiceClient', () => ({ getPermission: jest.fn(async () => 'contribute') }));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: {
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn(),
  },
}));
jest.mock('../../models/LabelJob', () => ({
  LabelJob: { findById: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../../models/LabelAnnotation', () => ({
  LabelAnnotation: { find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../../models/LabelSuggestion', () => ({
  LabelSuggestion: { findOne: jest.fn() },
}));
jest.mock('../../clients/fileServiceClient', () => ({
  getDownloadUrls: jest.fn(),
  putFile: jest.fn(),
  deleteFile: jest.fn(),
  jobFolder: (jobId: string) => `label/${jobId}/`,
}));

import * as svc from '../../services/taskService';
import { LabelTask } from '../../models/LabelTask';
import { LabelJob } from '../../models/LabelJob';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import { LabelSuggestion } from '../../models/LabelSuggestion';
import * as files from '../../clients/fileServiceClient';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import type { ILabelJob } from '../../models/LabelJob';
import type { ILabelTask } from '../../models/LabelTask';
import { encodeMaskRle } from '../../utils/mask';
import { decodePng } from '../../utils/png';

const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedAnnotation = LabelAnnotation as unknown as Record<string, jest.Mock>;
const mockedSuggestion = LabelSuggestion as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;

const user = { id: 'u1', email: 'Worker@X.com', name: 'Worker' };

const activeJob = (overrides: Record<string, unknown> = {}): ILabelJob =>
  ({
    _id: 'j1',
    datasetId: 'd1',
    status: 'active',
    isPublic: true,
    redundancy: 2,
    taskType: 'annotate',
    classes: [
      { key: 'car', name: 'Car', color: '#ff0000', tools: ['box', 'mask'], maskIndex: 1 },
      { key: 'road', name: 'Road', color: '#00ff00', tools: ['mask'], maskIndex: 2 },
      { key: 'sign', name: 'Sign', color: '#0000ff', tools: ['box'], maskIndex: 3 },
    ],
    ...overrides,
  }) as unknown as ILabelJob;

const frameTask = (overrides: Record<string, unknown> = {}): ILabelTask =>
  ({
    _id: 't1',
    jobId: 'j1',
    order: 4,
    stratum: 'night',
    frame: { fileId: 'f-frame', path: 'camera/frame_000012.png', stem: 'frame_000012', width: 4, height: 2 },
    sensors: [
      { key: 'lidar', kind: 'image', fileId: 'f-lidar' },
      { key: 'radar', kind: 'points', points: [{ u: 1, v: 1, value: 3 }] },
    ],
    ...overrides,
  }) as unknown as ILabelTask;

const annotationDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: 'a1',
  userId: 'u1',
  userEmail: 'worker@x.com',
  status: 'draft',
  objects: [{ id: 'o1', classKey: 'car', bbox: [0, 0, 2, 2], source: 'human' }],
  updatedAt: new Date('2026-10-01'),
  ...overrides,
});

/** `LabelAnnotation.find(...).sort(...)` — the labels read behind every task item. */
const annotationsOnTask = (docs: Record<string, unknown>[] = []) => {
  mockedAnnotation.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(docs) });
};

const signAll = () =>
  mockedFiles.getDownloadUrls.mockImplementation(async (fileIds: string[]) =>
    Object.fromEntries(fileIds.map((fileId) => [fileId, `signed:${fileId}`]))
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockedJob.findById.mockResolvedValue(activeJob());
  annotationsOnTask();
  mockedSuggestion.findOne.mockResolvedValue(null);
  mockedAnnotation.findOne.mockResolvedValue(null);
  mockedAnnotation.findOneAndUpdate.mockResolvedValue(annotationDoc());
  mockedTask.countDocuments.mockResolvedValue(0);
  mockedTask.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockedFiles.putFile.mockResolvedValue(undefined);
  mockedFiles.deleteFile.mockResolvedValue(undefined);
  signAll();
});

describe('nextTask', () => {
  it('atomically leases the first eligible task and signs everything it shows', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(frameTask());
    mockedTask.countDocuments.mockResolvedValueOnce(4);

    const item = await svc.nextTask(activeJob({ tasksCount: 9 }), user);

    expect(mockedTask.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = mockedTask.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({
      jobId: 'j1',
      answersCount: { $lt: 2 },
      answeredBy: { $ne: 'u1' },
      skippedBy: { $ne: 'u1' },
    });
    // Free, expired, or already leased to this caller.
    expect(filter.$or).toHaveLength(3);
    expect(filter.$or[2]).toEqual({ leasedBy: 'u1' });
    expect(update.$set.leasedBy).toBe('u1');
    expect(update.$set.leaseExpiresAt).toBeInstanceOf(Date);
    expect(options).toMatchObject({ sort: { order: 1 }, returnDocument: 'after' });

    expect(mockedFiles.getDownloadUrls).toHaveBeenCalledWith(['f-frame', 'f-lidar']);
    expect(item!.images.frame).toEqual({ url: 'signed:f-frame', width: 4, height: 2, stem: 'frame_000012' });
    expect(item!.images.sensors).toEqual([
      { key: 'lidar', kind: 'image', url: 'signed:f-lidar' },
      { key: 'radar', kind: 'points', points: [{ u: 1, v: 1, value: 3 }] },
    ]);
    expect(item!.position).toEqual({ index: 4, total: 9 });
  });

  it('passes the tasks the client already holds so they are not handed out twice', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(frameTask());

    await svc.nextTask(activeJob(), user, ['t0', 't9']);

    expect(mockedTask.findOneAndUpdate.mock.calls[0][0]._id).toEqual({ $nin: ['t0', 't9'] });
  });

  it('returns null when nothing is left for this user', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(null);
    expect(await svc.nextTask(activeJob(), user)).toBeNull();
    expect(mockedFiles.getDownloadUrls).not.toHaveBeenCalled();
  });

  it('exposes only what the editor acts on, never storage ids or leases', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(frameTask({ leasedBy: 'u1', answeredBy: ['x'] }));

    const { task } = (await svc.nextTask(activeJob(), user))!;

    expect(task).toEqual({
      _id: 't1',
      jobId: 'j1',
      order: 4,
      stratum: 'night',
      sensors: [
        { key: 'lidar', kind: 'image' },
        { key: 'radar', kind: 'points' },
      ],
    });
    expect(JSON.stringify(task)).not.toContain('f-lidar');
  });

  it('serves a camera-only frame with no sensors', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(frameTask({ sensors: undefined }));

    const item = (await svc.nextTask(activeJob(), user))!;

    expect(item.images.sensors).toEqual([]);
    expect(item.task).not.toHaveProperty('sensors');
  });

  it('fails when a file cannot be signed', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(frameTask());
    mockedFiles.getDownloadUrls.mockResolvedValue({ 'f-frame': 'u' });

    await expect(svc.nextTask(activeJob(), user)).rejects.toThrow(NotFoundError);
  });
});

describe('what has been labeled on the frame', () => {
  const maskedMine = annotationDoc({ mask: { fileId: 'f-mine', width: 4, height: 2 }, status: 'draft' });
  const doneByOther = annotationDoc({
    _id: 'a2',
    userId: 'u2',
    userEmail: 'private@example.test',
    userName: 'Private Person',
    status: 'done',
    mask: { fileId: 'f-theirs', width: 4, height: 2 },
    updatedAt: new Date('2026-10-02'),
  });

  beforeEach(() => mockedTask.findOneAndUpdate.mockResolvedValue(frameTask()));

  it('gives the caller their own labels and the latest finished ones, signed', async () => {
    annotationsOnTask([doneByOther, maskedMine]);

    const { annotation } = (await svc.nextTask(activeJob(), user))!;

    expect(annotation.count).toBe(1);
    expect(annotation.mine).toMatchObject({
      status: 'draft',
      objects: [{ id: 'o1', classKey: 'car', bbox: [0, 0, 2, 2], source: 'human' }],
      mask: { url: 'signed:f-mine', width: 4, height: 2 },
    });
    expect(annotation.latest).toMatchObject({ status: 'done', mask: { url: 'signed:f-theirs' } });
    expect(mockedFiles.getDownloadUrls).toHaveBeenCalledWith(
      expect.arrayContaining(['f-frame', 'f-mine', 'f-theirs'])
    );
  });

  it('never carries who made the labels', async () => {
    annotationsOnTask([doneByOther]);

    const { annotation } = (await svc.nextTask(activeJob(), { id: 'someone-else' } as never))!;

    expect(annotation.mine).toBeNull();
    expect(JSON.stringify(annotation)).not.toMatch(/private@example.test|Private Person|u2/);
  });

  it('offers a suggestion only to a signed-in caller with no labels of their own', async () => {
    const suggestion = {
      objects: [{ id: 's1', classKey: 'car', bbox: [0, 0, 1, 1], source: 'import', score: 0.5 }],
      mask: { fileId: 'f-suggest', width: 4, height: 2 },
    };
    mockedSuggestion.findOne.mockResolvedValue(suggestion);

    const fresh = (await svc.nextTask(activeJob(), user))!;
    expect(fresh.suggestions).toEqual({
      objects: [{ id: 's1', classKey: 'car', bbox: [0, 0, 1, 1], source: 'import', score: 0.5 }],
      mask: { url: 'signed:f-suggest', width: 4, height: 2 },
    });

    annotationsOnTask([maskedMine]);
    const started = (await svc.nextTask(activeJob(), user))!;
    expect(started.suggestions).toBeNull();
  });

  it('does not look for suggestions for an anonymous visitor', async () => {
    mockedAnnotation.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    mockedJob.findById.mockResolvedValue(activeJob());
    mockedTask.findById.mockResolvedValue(frameTask());

    const item = await svc.getTaskItem('t1');

    expect(mockedSuggestion.findOne).not.toHaveBeenCalled();
    expect(item.suggestions).toBeNull();
    expect(item.annotation).toEqual({ count: 0, mine: null, latest: null });
  });

  it('serves a suggestion that has boxes only', async () => {
    mockedSuggestion.findOne.mockResolvedValue({ objects: [{ id: 's', classKey: 'car', bbox: [0, 0, 1, 1], source: 'import' }] });

    const item = (await svc.nextTask(activeJob(), user))!;

    expect(item.suggestions).toEqual({ objects: [{ id: 's', classKey: 'car', bbox: [0, 0, 1, 1], source: 'import' }] });
  });
});

describe('reading one frame', () => {
  it('opens a frame by id without taking a lease', async () => {
    mockedTask.findById.mockResolvedValue(frameTask());

    const item = await svc.getTaskItem('t1', 'u1');

    expect(item.task._id).toBe('t1');
    expect(mockedTask.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockedTask.updateOne).not.toHaveBeenCalled();
  });

  it('refuses a frame of a job the caller may not read', async () => {
    mockedTask.findById.mockResolvedValue(frameTask());
    mockedJob.findById.mockResolvedValue(activeJob({ isPublic: false, datasetId: undefined, createdBy: { userId: 'other' } }));

    await expect(svc.getTaskItem('t1', 'u1')).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedFiles.getDownloadUrls).not.toHaveBeenCalled();
  });

  it('steps to the frame at a position, and answers null past the end', async () => {
    const skip = jest.fn().mockResolvedValue(frameTask({ order: 3 }));
    mockedTask.findOne.mockReturnValue({ sort: () => ({ skip }) });

    expect((await svc.getTaskItemAtIndex('j1', 3, 'u1'))!.task.order).toBe(3);
    expect(skip).toHaveBeenCalledWith(3);

    skip.mockResolvedValue(null);
    expect(await svc.getTaskItemAtIndex('j1', 99, 'u1')).toBeNull();
  });

  it('reports a missing task or job', async () => {
    mockedTask.findById.mockResolvedValue(null);
    await expect(svc.getTaskWithJob('nope')).rejects.toThrow(NotFoundError);

    mockedTask.findById.mockResolvedValue(frameTask());
    mockedJob.findById.mockResolvedValue(null);
    await expect(svc.getTaskWithJob('t1')).rejects.toThrow('Job not found');
  });
});

describe('clampBox', () => {
  it('keeps a box inside the frame', () => {
    expect(svc.clampBox([10, 10, 20, 20], 100, 100)).toEqual([10, 10, 20, 20]);
    expect(svc.clampBox([-5, -5, 20, 20], 100, 100)).toEqual([0, 0, 15, 15]);
    expect(svc.clampBox([90, 90, 30, 30], 100, 100)).toEqual([90, 90, 10, 10]);
  });

  it('drops a box that is outside the frame or smaller than a pixel', () => {
    expect(svc.clampBox([200, 0, 10, 10], 100, 100)).toBeNull();
    expect(svc.clampBox([0, 0, 0.5, 10], 100, 100)).toBeNull();
    expect(svc.clampBox([0, 0, -4, 10], 100, 100)).toBeNull();
  });

  it('cannot clamp to a frame whose size is unknown, and keeps the box', () => {
    expect(svc.clampBox([-5, 0, 20, 20])).toEqual([-5, 0, 20, 20]);
  });
});

describe('saveObjects', () => {
  const body = (objects: unknown[], extra: Record<string, unknown> = {}) =>
    ({ objects, ...extra }) as Parameters<typeof svc.saveObjects>[3];

  it('stores the boxes the editor sent, clamped, as the whole list', async () => {
    await svc.saveObjects(
      frameTask(),
      activeJob(),
      user,
      body(
        [
          { id: 'a', classKey: 'car', bbox: [-1, 0, 3, 3], source: 'human' },
          { id: 'b', classKey: 'sign', bbox: [1, 1, 2, 1], source: 'model', score: 0.7 },
          { id: 'c', classKey: 'car', bbox: [50, 50, 5, 5], source: 'human' },
        ],
        { elapsedMs: 900 }
      )
    );

    const [filter, update, options] = mockedAnnotation.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ taskId: 't1', userId: 'u1' });
    expect(update.$set).toMatchObject({
      jobId: 'j1',
      userEmail: 'worker@x.com',
      userName: 'Worker',
      elapsedMs: 900,
      objects: [
        { id: 'a', classKey: 'car', bbox: [0, 0, 2, 2], source: 'human' },
        { id: 'b', classKey: 'sign', bbox: [1, 1, 2, 1], source: 'model', score: 0.7 },
      ],
    });
    expect(update.$setOnInsert).toEqual({ status: 'draft' });
    expect(options).toMatchObject({ upsert: true, returnDocument: 'after' });
  });

  it('refuses a class the job does not have, and a box on a mask-only class', async () => {
    await expect(
      svc.saveObjects(frameTask(), activeJob(), user, body([{ id: 'a', classKey: 'ghost', bbox: [0, 0, 1, 1], source: 'human' }]))
    ).rejects.toThrow('Unknown class "ghost"');
    await expect(
      svc.saveObjects(frameTask(), activeJob(), user, body([{ id: 'a', classKey: 'road', bbox: [0, 0, 1, 1], source: 'human' }]))
    ).rejects.toThrow(BadRequestError);
    expect(mockedAnnotation.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses writes while the job is not active, except revising a completed one', async () => {
    mockedAnnotation.findOne.mockResolvedValue(null);
    await expect(svc.saveObjects(frameTask(), activeJob({ status: 'paused' }), user, body([]))).rejects.toThrow(ConflictError);
    await expect(svc.saveObjects(frameTask(), activeJob({ status: 'completed' }), user, body([]))).rejects.toThrow(
      'Job is completed'
    );

    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ status: 'done' }));
    await expect(svc.saveObjects(frameTask(), activeJob({ status: 'completed' }), user, body([]))).resolves.toBeDefined();
    await expect(svc.saveObjects(frameTask(), activeJob({ status: 'archived' }), user, body([]))).rejects.toThrow(ConflictError);
  });

  it('reopens a skipped frame the annotator starts drawing on', async () => {
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ status: 'skipped' }));

    await svc.saveObjects(frameTask(), activeJob(), user, body([]));

    expect(mockedAnnotation.findOneAndUpdate.mock.calls[0][1].$set.status).toBe('draft');
    expect(mockedAnnotation.findOneAndUpdate.mock.calls[0][1]).not.toHaveProperty('$setOnInsert');
    expect(mockedTask.updateOne).toHaveBeenCalledWith({ _id: 't1' }, { $pull: { skippedBy: 'u1' } });
  });

  it('leaves a done frame done when its labels are edited', async () => {
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ status: 'done' }));

    await svc.saveObjects(frameTask(), activeJob(), user, body([]));

    expect(mockedAnnotation.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('status');
    expect(mockedTask.updateOne).not.toHaveBeenCalled();
  });

  it('retries once when two first saves race and the other one wins', async () => {
    mockedAnnotation.findOneAndUpdate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));

    await expect(svc.saveObjects(frameTask(), activeJob(), user, body([]))).resolves.toBeDefined();
    expect(mockedAnnotation.findOneAndUpdate).toHaveBeenCalledTimes(2);

    mockedAnnotation.findOneAndUpdate.mockRejectedValue(new Error('db down'));
    await expect(svc.saveObjects(frameTask(), activeJob(), user, body([]))).rejects.toThrow('db down');
  });

  it('keeps what a user is called out of the stored email when they have no name', async () => {
    await svc.saveObjects(frameTask(), activeJob(), { id: 'u1', email: 'A@B.com' } as never, body([]));
    const set = mockedAnnotation.findOneAndUpdate.mock.calls[0][1].$set;
    expect(set.userEmail).toBe('a@b.com');
    expect(set).not.toHaveProperty('userName');

    await svc.saveObjects(frameTask(), activeJob(), { id: 'u1' } as never, body([]));
    expect(mockedAnnotation.findOneAndUpdate.mock.calls[1][1].$set.userEmail).toBe('');
  });
});

describe('saveMask', () => {
  const upload = (data: number[], width = 4, height = 2) =>
    encodeMaskRle({ width, height, data: Uint8Array.from(data) });

  beforeEach(() => {
    mockedAnnotation.findOneAndUpdate.mockResolvedValue(annotationDoc());
  });

  it('checks the mask, writes it as a grayscale PNG and points the annotation at it', async () => {
    mockedAnnotation.findOneAndUpdate.mockResolvedValueOnce(annotationDoc({ mask: { fileId: 'label/j1/masks/old.png' } }));
    mockedAnnotation.findOneAndUpdate.mockResolvedValueOnce(annotationDoc({ mask: { fileId: 'new' } }));

    await svc.saveMask(frameTask(), activeJob(), user, upload([0, 1, 1, 0, 2, 2, 2, 0]));

    const [fileId, png] = mockedFiles.putFile.mock.calls[0];
    expect(fileId).toMatch(/^label\/j1\/masks\/a1-[a-z0-9]+\.png$/);
    const decoded = decodePng(png);
    expect(Array.from(decoded.data)).toEqual([0, 1, 1, 0, 2, 2, 2, 0]);
    expect(mockedAnnotation.findOneAndUpdate.mock.calls[1][1]).toEqual({
      $set: { mask: { fileId, width: 4, height: 2, pixels: { '1': 2, '2': 3 } } },
    });
    // The file it replaced is removed, after the new one is in place.
    expect(mockedFiles.deleteFile).toHaveBeenCalledWith('label/j1/masks/old.png');
  });

  it('is not undone by a failure to remove the old file', async () => {
    mockedAnnotation.findOneAndUpdate.mockResolvedValueOnce(annotationDoc({ mask: { fileId: 'old' } }));
    mockedFiles.deleteFile.mockRejectedValue(new Error('file-service down'));

    await expect(svc.saveMask(frameTask(), activeJob(), user, upload([1, 1, 1, 1, 1, 1, 1, 1]))).resolves.toBeDefined();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('refuses a mask of another size than the frame', async () => {
    await expect(svc.saveMask(frameTask(), activeJob(), user, upload([0, 1], 2, 1))).rejects.toThrow('mask is 2×1 but the frame is 4×2');
    expect(mockedFiles.putFile).not.toHaveBeenCalled();
  });

  it('accepts any size for a frame whose size is unknown', async () => {
    const task = frameTask({ frame: { fileId: 'f', path: 'p', stem: 's' } });
    await expect(svc.saveMask(task, activeJob(), user, upload([0, 1], 2, 1))).resolves.toBeDefined();
  });

  it('refuses values that are not mask classes of the job', async () => {
    // 3 is a box-only class here, 9 is not a class at all.
    await expect(svc.saveMask(frameTask(), activeJob(), user, upload([0, 3, 9, 0, 0, 0, 0, 0]))).rejects.toThrow(
      'not mask classes of this job: 3, 9'
    );
    expect(mockedFiles.putFile).not.toHaveBeenCalled();
  });

  it('refuses bytes that are not a mask', async () => {
    await expect(svc.saveMask(frameTask(), activeJob(), user, Buffer.from('nope'))).rejects.toThrow('Not a Visin mask');
  });

  it('needs the job to be taking labels', async () => {
    await expect(svc.saveMask(frameTask(), activeJob({ status: 'paused' }), user, upload([0, 0, 0, 0, 0, 0, 0, 0]))).rejects.toThrow(
      ConflictError
    );
    expect(mockedFiles.putFile).not.toHaveBeenCalled();
  });
});

describe('clearMask', () => {
  it('removes the reference and the file', async () => {
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ mask: { fileId: 'f-mask' } }));

    await svc.clearMask(frameTask(), activeJob(), user);

    expect(mockedAnnotation.updateOne).toHaveBeenCalledWith({ _id: 'a1' }, { $unset: { mask: '' } });
    expect(mockedFiles.deleteFile).toHaveBeenCalledWith('f-mask');
  });

  it('does nothing when there is no mask, and survives a failed file delete', async () => {
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc());
    await svc.clearMask(frameTask(), activeJob(), user);
    expect(mockedAnnotation.updateOne).not.toHaveBeenCalled();

    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ mask: { fileId: 'f-mask' } }));
    mockedFiles.deleteFile.mockRejectedValue(new Error('down'));
    await expect(svc.clearMask(frameTask(), activeJob(), user)).resolves.toBeUndefined();
  });

  it('refuses while the job is paused', async () => {
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ mask: { fileId: 'f-mask' } }));
    await expect(svc.clearMask(frameTask(), activeJob({ status: 'paused' }), user)).rejects.toThrow(ConflictError);
  });
});

describe('finishTask', () => {
  it('marks a first finish done and counts it once', async () => {
    mockedTask.countDocuments.mockResolvedValue(3);

    await svc.finishTask(frameTask(), activeJob(), user, 'done', 4200);

    const [filter, update, options] = mockedAnnotation.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ taskId: 't1', userId: 'u1' });
    expect(update.$set).toMatchObject({ jobId: 'j1', status: 'done', elapsedMs: 4200 });
    expect(update.$set.doneAt).toBeInstanceOf(Date);
    expect(options).toMatchObject({ upsert: true });
    expect(mockedTask.updateOne).toHaveBeenCalledWith(
      { _id: 't1', answeredBy: { $ne: 'u1' } },
      {
        $inc: { answersCount: 1 },
        $addToSet: { answeredBy: 'u1' },
        $pull: { skippedBy: 'u1' },
        $unset: { leasedBy: '', leaseExpiresAt: '' },
      }
    );
    expect(mockedJob.updateOne).not.toHaveBeenCalled();
  });

  it('completes the job when the last frame is finished', async () => {
    mockedTask.countDocuments.mockResolvedValue(0);

    await svc.finishTask(frameTask(), activeJob(), user, 'done');

    expect(mockedTask.countDocuments).toHaveBeenCalledWith({ jobId: 'j1', answersCount: { $lt: 2 } });
    expect(mockedJob.updateOne).toHaveBeenCalledWith({ _id: 'j1', status: 'active' }, { $set: { status: 'completed' } });
  });

  it('does not count a frame again when it is finished a second time', async () => {
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ status: 'done' }));
    mockedTask.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });

    await svc.finishTask(frameTask(), activeJob(), user, 'done');

    expect(mockedTask.updateOne.mock.calls[0][0]).toEqual({ _id: 't1', answeredBy: { $ne: 'u1' } });
    const update = mockedTask.updateOne.mock.calls[1][1];
    expect(update).not.toHaveProperty('$inc');
    expect(update.$pull).toEqual({ skippedBy: 'u1' });
    expect(mockedTask.countDocuments).not.toHaveBeenCalled();
  });

  it('allows revising a finished frame after the job completed, but not finishing a new one', async () => {
    const completed = activeJob({ status: 'completed' });
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ status: 'done' }));
    await expect(svc.finishTask(frameTask(), completed, user, 'done')).resolves.toBeDefined();

    mockedAnnotation.findOne.mockResolvedValue(null);
    await expect(svc.finishTask(frameTask(), completed, user, 'done')).rejects.toThrow('Job is completed');
  });

  it('skips a frame without counting it, so it is not offered to this annotator again', async () => {
    await svc.finishTask(frameTask(), activeJob(), user, 'skipped');

    expect(mockedAnnotation.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ status: 'skipped' });
    expect(mockedAnnotation.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('doneAt');
    expect(mockedTask.updateOne).toHaveBeenCalledWith(
      { _id: 't1' },
      { $addToSet: { skippedBy: 'u1' }, $unset: { leasedBy: '', leaseExpiresAt: '' } }
    );
    expect(mockedTask.countDocuments).not.toHaveBeenCalled();
  });

  it('refuses to skip a frame already finished', async () => {
    mockedAnnotation.findOne.mockResolvedValue(annotationDoc({ status: 'done' }));
    await expect(svc.finishTask(frameTask(), activeJob(), user, 'skipped')).rejects.toThrow('already done');
    expect(mockedTask.updateOne).not.toHaveBeenCalled();
  });

  it('refuses while the job is paused', async () => {
    await expect(svc.finishTask(frameTask(), activeJob({ status: 'paused' }), user, 'done')).rejects.toThrow(ConflictError);
  });
});
