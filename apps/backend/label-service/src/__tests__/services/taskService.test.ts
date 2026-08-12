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
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), findOneAndDelete: jest.fn() },
}));
jest.mock('../../models/LabelImage', () => ({
  LabelImage: { find: jest.fn() },
}));
jest.mock('../../clients/fileServiceClient', () => ({
  getDownloadUrl: jest.fn(),
}));

import * as svc from '../../services/taskService';
import { LabelTask } from '../../models/LabelTask';
import { LabelJob } from '../../models/LabelJob';
import { LabelAnswer } from '../../models/LabelAnswer';
import { LabelImage } from '../../models/LabelImage';
import * as files from '../../clients/fileServiceClient';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import type { ILabelJob } from '../../models/LabelJob';
import type { ILabelTask } from '../../models/LabelTask';

const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedAnswer = LabelAnswer as unknown as Record<string, jest.Mock>;
const mockedImage = LabelImage as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;

const user = { id: 'u1', email: 'Worker@X.com', name: 'Worker' };

const activeJob = (overrides: Record<string, unknown> = {}): ILabelJob =>
  ({
    _id: 'j1',
    status: 'active',
    redundancy: 2,
    taskType: 'mask_toggle',
    question: { prompt: 'p' },
    ...overrides,
  }) as unknown as ILabelJob;

const maskTask = (overrides: Record<string, unknown> = {}): ILabelTask =>
  ({
    _id: 't1',
    jobId: 'j1',
    labelImageId: 'img-frame',
    payload: {
      layers: [{ set: 'setA', imageId: 'img-layer' }],
      maskMap: { imageId: 'img-idmap', masks: [{ id: 1, class: 'vehicle' }, { id: 2, class: 'sign' }] },
    },
    ...overrides,
  }) as unknown as ILabelTask;

/** `LabelAnswer.find(...).sort(...)` — the answer-state read behind every task item. */
const answersOnTask = (answers: Record<string, unknown>[] = []) => {
  mockedAnswer.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(answers) });
};

beforeEach(() => {
  jest.clearAllMocks();
  answersOnTask();
  mockedAnswer.findOne.mockResolvedValue(null);
  mockedAnswer.findOneAndUpdate.mockResolvedValue(null);
  mockedTask.countDocuments.mockResolvedValue(0);
});

describe('nextTask', () => {
  it('atomically leases the first eligible task and signs its images', async () => {
    const task = maskTask();
    mockedTask.findOneAndUpdate.mockResolvedValue(task);
    mockedImage.find.mockResolvedValue([
      { _id: 'img-frame', fileId: 'f-frame', width: 100, height: 50 },
      { _id: 'img-layer', fileId: 'f-layer' },
      { _id: 'img-idmap', fileId: 'f-idmap' },
    ]);
    mockedFiles.getDownloadUrl.mockImplementation(async (fileId: string) => ({ url: `signed:${fileId}` }));

    const result = await svc.nextTask(activeJob({ tasksCount: 40 }), user);

    const [filter, update, options] = mockedTask.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ jobId: 'j1', answersCount: { $lt: 2 }, answeredBy: { $ne: 'u1' } });
    expect(filter.$or).toHaveLength(3);
    expect(update.$set.leasedBy).toBe('u1');
    expect(options).toMatchObject({ sort: { order: 1 }, new: true });

    expect(result?.images.frame).toEqual({ url: 'signed:f-frame', width: 100, height: 50 });
    expect(result?.images.layers).toEqual([{ set: 'setA', url: 'signed:f-layer' }]);
    expect(result?.images.idmap).toEqual({ url: 'signed:f-idmap' });
    // `total` rides along on the job rather than costing a count of its own.
    expect(result?.position).toEqual({ index: 0, total: 40 });
    expect(mockedTask.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('returns null when the user has nothing left', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(null);

    expect(await svc.nextTask(activeJob(), user)).toBeNull();
  });

  it('excludes tasks the client already holds (prefetch double-serve guard)', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(null);

    await svc.nextTask(activeJob(), user, ['abc123']);

    expect(mockedTask.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ _id: { $nin: ['abc123'] } });
  });

  it('fails loudly when a task image is missing from the bundle', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(maskTask());
    mockedImage.find.mockResolvedValue([]);

    await expect(svc.nextTask(activeJob(), user)).rejects.toThrow(NotFoundError);
  });
});

describe('getTaskItem', () => {
  it('serves a named task with signed images and the frame stem', async () => {
    mockedTask.findById.mockResolvedValue(maskTask());
    mockedImage.find.mockResolvedValue([
      { _id: 'img-frame', fileId: 'f-frame', width: 100, height: 50, stem: 'frame_000012' },
      { _id: 'img-layer', fileId: 'f-layer' },
      { _id: 'img-idmap', fileId: 'f-idmap' },
    ]);
    mockedFiles.getDownloadUrl.mockImplementation(async (fileId: string) => ({ url: `signed:${fileId}` }));

    const result = await svc.getTaskItem('t1');

    expect(result.images.frame).toEqual({ url: 'signed:f-frame', width: 100, height: 50, stem: 'frame_000012' });
    expect(result.images.idmap).toEqual({ url: 'signed:f-idmap' });
  });

  // A shared link is a look at a frame, not a claim on it — leasing here would
  // take the task out of the queue for whoever was about to be handed it.
  it('takes no lease', async () => {
    mockedTask.findById.mockResolvedValue(maskTask());
    mockedImage.find.mockResolvedValue([
      { _id: 'img-frame', fileId: 'f' },
      { _id: 'img-layer', fileId: 'f' },
      { _id: 'img-idmap', fileId: 'f' },
    ]);
    mockedFiles.getDownloadUrl.mockResolvedValue({ url: 'signed' });

    await svc.getTaskItem('t1');

    expect(mockedTask.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockedTask.updateOne).not.toHaveBeenCalled();
  });

  it('404s on a link to a task that no longer exists', async () => {
    mockedTask.findById.mockResolvedValue(null);

    await expect(svc.getTaskItem('gone')).rejects.toThrow(NotFoundError);
  });
});

describe('getTaskWithJob', () => {
  it('returns the task alongside the job it belongs to', async () => {
    const task = maskTask();
    const job = activeJob();
    mockedTask.findById.mockResolvedValue(task);
    mockedJob.findById.mockResolvedValue(job);

    expect(await svc.getTaskWithJob('t1')).toEqual({ task, job });
  });

  it('throws NotFound for missing task or job', async () => {
    mockedTask.findById.mockResolvedValue(null);
    await expect(svc.getTaskWithJob('t1')).rejects.toThrow('Task not found');

    mockedTask.findById.mockResolvedValue(maskTask());
    mockedJob.findById.mockResolvedValue(null);
    await expect(svc.getTaskWithJob('t1')).rejects.toThrow('Job not found');
  });
});

describe('submitAnswer', () => {
  beforeEach(() => {
    mockedTask.updateOne.mockResolvedValue({});
    mockedTask.countDocuments.mockResolvedValue(5); // not complete
    mockedAnswer.findOne.mockResolvedValue(null); // no answer of this user's yet
  });

  /** What `findOneAndUpdate` was asked to store, from the first call. */
  const storedFields = () => mockedAnswer.findOneAndUpdate.mock.calls.at(-1)![1].$set;

  it('rejects answers on a non-active job', async () => {
    await expect(
      svc.submitAnswer(maskTask(), activeJob({ status: 'paused' }), user, { rejectedMaskIds: [] })
    ).rejects.toThrow('paused');
  });

  it('validates single_choice keys against the job config', async () => {
    const job = activeJob({
      taskType: 'single_choice',
      question: { prompt: 'p', choices: [{ key: 'good', label: 'G' }, { key: 'bad', label: 'B' }] },
    });

    await expect(svc.submitAnswer(maskTask(), job, user, { rejectedMaskIds: [] })).rejects.toThrow(
      'choiceKey required'
    );
    await expect(svc.submitAnswer(maskTask(), job, user, { choiceKey: 'meh' })).rejects.toThrow('Unknown choiceKey');

    await svc.submitAnswer(maskTask(), job, user, { choiceKey: 'good', elapsedMs: 900 });
    expect(mockedAnswer.findOneAndUpdate.mock.calls.at(-1)![0]).toEqual({ taskId: 't1', userId: 'u1' });
    expect(storedFields()).toMatchObject({
      choiceKey: 'good',
      userEmail: 'worker@x.com',
      userName: 'Worker',
      elapsedMs: 900,
    });
  });

  it('validates mask ids against the task maskMap and accepts empty rejections', async () => {
    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { choiceKey: 'x' })).rejects.toThrow(
      'rejectedMaskIds required'
    );
    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [99] })).rejects.toThrow(
      'Unknown mask ids: 99'
    );

    await svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [] });
    expect(storedFields()).toMatchObject({ rejectedMaskIds: [] });
  });

  it('updates the task counters and clears the lease', async () => {
    await svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [1] });

    expect(mockedTask.updateOne).toHaveBeenCalledWith(
      { _id: 't1' },
      { $inc: { answersCount: 1 }, $addToSet: { answeredBy: 'u1' }, $unset: { leasedBy: '', leaseExpiresAt: '' } }
    );
  });

  it('completes the job when every task reached K', async () => {
    mockedTask.countDocuments.mockResolvedValue(0);

    await svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [] });

    expect(mockedJob.updateOne).toHaveBeenCalledWith({ _id: 'j1', status: 'active' }, { $set: { status: 'completed' } });
  });

  // The JWT carries a display name for a Google sign-in but need not always,
  // and the email is what the export identifies a labeler by.
  it('stores what it has when the caller has no display name', async () => {
    await svc.submitAnswer(maskTask(), activeJob(), { id: 'u2' } as never, { rejectedMaskIds: [1] });

    expect(storedFields()).toMatchObject({ userEmail: '' });
    expect(storedFields().userName).toBeUndefined();
  });

  // Two submits for the same task racing each other, not a labeler revising:
  // a revision finds the existing answer and updates it.
  it('maps a racing duplicate insert to Conflict', async () => {
    mockedAnswer.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [] })).rejects.toThrow(
      ConflictError
    );
  });

  it('rethrows unexpected write errors', async () => {
    mockedAnswer.findOneAndUpdate.mockRejectedValue(new Error('io'));

    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [] })).rejects.toThrow('io');
  });

  describe('revising an answer already given', () => {
    beforeEach(() => {
      mockedAnswer.findOne.mockResolvedValue({ _id: 'a1', rejectedMaskIds: [1] });
      // A pre-update document came back, so the upsert updated rather than inserted.
      mockedAnswer.findOneAndUpdate.mockResolvedValue({ _id: 'a1' });
    });

    it('overwrites in place and leaves the task counters alone', async () => {
      await svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [1, 2] });

      expect(storedFields()).toMatchObject({ rejectedMaskIds: [1, 2] });
      // The frame was already counted as answered by this user; only the lease clears.
      expect(mockedTask.updateOne).toHaveBeenCalledWith(
        { _id: 't1' },
        { $unset: { leasedBy: '', leaseExpiresAt: '' } }
      );
      expect(mockedJob.updateOne).not.toHaveBeenCalled();
    });

    // The job only completed because this answer was counted; refusing the edit
    // would make the frames that finished it the ones that can never be fixed.
    it('is still allowed once the job has completed', async () => {
      await expect(
        svc.submitAnswer(maskTask(), activeJob({ status: 'completed' }), user, { rejectedMaskIds: [2] })
      ).resolves.not.toThrow();
    });

    it('is not allowed once the job is paused or archived', async () => {
      await expect(
        svc.submitAnswer(maskTask(), activeJob({ status: 'paused' }), user, { rejectedMaskIds: [2] })
      ).rejects.toThrow('paused');
    });
  });
});

describe('getTaskItemAtIndex', () => {
  const atIndex = (task: unknown) => {
    mockedTask.findOne.mockReturnValue({ sort: () => ({ skip: jest.fn().mockResolvedValue(task) }) });
  };

  it('serves the frame at a position, with its answer state', async () => {
    atIndex(maskTask());
    mockedImage.find.mockResolvedValue([
      { _id: 'img-frame', fileId: 'f' },
      { _id: 'img-layer', fileId: 'f' },
      { _id: 'img-idmap', fileId: 'f' },
    ]);
    mockedFiles.getDownloadUrl.mockResolvedValue({ url: 'signed' });
    mockedTask.countDocuments.mockResolvedValueOnce(6).mockResolvedValueOnce(40);
    answersOnTask([
      { userId: 'u2', rejectedMaskIds: [4], updatedAt: new Date('2026-08-02') },
      { userId: 'u1', rejectedMaskIds: [1], updatedAt: new Date('2026-08-01') },
    ]);

    const result = await svc.getTaskItemAtIndex('j1', 6, 'u1');

    expect(result?.position).toEqual({ index: 6, total: 40 });
    expect(result?.answer.count).toBe(2);
    expect(result?.answer.mine).toMatchObject({ rejectedMaskIds: [1] });
    // Newest first, and stripped of who gave it.
    expect(result?.answer.latest).toEqual({ rejectedMaskIds: [4], updatedAt: new Date('2026-08-02') });
  });

  // Walking forwards past the end is how a reader finds the end, not an error.
  it('returns null past the last frame', async () => {
    atIndex(null);

    expect(await svc.getTaskItemAtIndex('j1', 999)).toBeNull();
  });

  it('carries a single_choice verdict through as the choice key', async () => {
    atIndex(maskTask());
    mockedImage.find.mockResolvedValue([
      { _id: 'img-frame', fileId: 'f' },
      { _id: 'img-layer', fileId: 'f' },
      { _id: 'img-idmap', fileId: 'f' },
    ]);
    mockedFiles.getDownloadUrl.mockResolvedValue({ url: 'signed' });
    answersOnTask([{ userId: 'u1', choiceKey: 'good', updatedAt: new Date('2026-08-01') }]);

    const result = await svc.getTaskItemAtIndex('j1', 0, 'u1');

    expect(result?.answer.mine).toEqual({ choiceKey: 'good', updatedAt: new Date('2026-08-01') });
  });

  it('has no answer of its own for an anonymous reader', async () => {
    atIndex(maskTask());
    mockedImage.find.mockResolvedValue([
      { _id: 'img-frame', fileId: 'f' },
      { _id: 'img-layer', fileId: 'f' },
      { _id: 'img-idmap', fileId: 'f' },
    ]);
    mockedFiles.getDownloadUrl.mockResolvedValue({ url: 'signed' });
    answersOnTask([{ userId: 'u1', rejectedMaskIds: [1], updatedAt: new Date('2026-08-01') }]);

    const result = await svc.getTaskItemAtIndex('j1', 0);

    expect(result?.answer.mine).toBeNull();
    expect(result?.answer.latest).toMatchObject({ rejectedMaskIds: [1] });
  });
});

describe('undoAnswer', () => {
  it('removes the answer, decrements counters, and reopens a completed job', async () => {
    mockedAnswer.findOneAndDelete.mockResolvedValue({ _id: 'a1' });
    mockedTask.updateOne.mockResolvedValue({});

    await svc.undoAnswer(maskTask(), activeJob({ status: 'completed' }), user);

    expect(mockedAnswer.findOneAndDelete).toHaveBeenCalledWith({ taskId: 't1', userId: 'u1' });
    expect(mockedTask.updateOne).toHaveBeenCalledWith(
      { _id: 't1' },
      { $inc: { answersCount: -1 }, $pull: { answeredBy: 'u1' } }
    );
    expect(mockedJob.updateOne).toHaveBeenCalledWith({ _id: 'j1', status: 'completed' }, { $set: { status: 'active' } });
  });

  it('404s when the user has no answer on the task', async () => {
    mockedAnswer.findOneAndDelete.mockResolvedValue(null);

    await expect(svc.undoAnswer(maskTask(), activeJob(), user)).rejects.toThrow(NotFoundError);
  });
});

describe('answer schema/type mismatch', () => {
  it('rejects a mask_toggle answer without maskMap masks', async () => {
    const task = maskTask({ payload: undefined });

    await expect(svc.submitAnswer(task, activeJob(), user, { rejectedMaskIds: [1] })).rejects.toThrow(
      BadRequestError
    );
  });
});
