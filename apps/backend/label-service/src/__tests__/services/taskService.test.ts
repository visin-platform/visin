jest.mock('../../models/LabelTask', () => ({
  LabelTask: { findOneAndUpdate: jest.fn(), findById: jest.fn(), updateOne: jest.fn(), countDocuments: jest.fn() },
}));
jest.mock('../../models/LabelJob', () => ({
  LabelJob: { findById: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { create: jest.fn(), findOneAndDelete: jest.fn() },
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

beforeEach(() => {
  jest.clearAllMocks();
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

    const result = await svc.nextTask(activeJob(), user);

    const [filter, update, options] = mockedTask.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ jobId: 'j1', answersCount: { $lt: 2 }, answeredBy: { $ne: 'u1' } });
    expect(filter.$or).toHaveLength(3);
    expect(update.$set.leasedBy).toBe('u1');
    expect(options).toMatchObject({ sort: { order: 1 }, new: true });

    expect(result?.images.frame).toEqual({ url: 'signed:f-frame', width: 100, height: 50 });
    expect(result?.images.layers).toEqual([{ set: 'setA', url: 'signed:f-layer' }]);
    expect(result?.images.idmap).toEqual({ url: 'signed:f-idmap' });
  });

  it('returns null when the user has nothing left', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(null);

    expect(await svc.nextTask(activeJob(), user)).toBeNull();
  });

  it('fails loudly when a task image is missing from the bundle', async () => {
    mockedTask.findOneAndUpdate.mockResolvedValue(maskTask());
    mockedImage.find.mockResolvedValue([]);

    await expect(svc.nextTask(activeJob(), user)).rejects.toThrow(NotFoundError);
  });
});

describe('getTaskWithJob', () => {
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
    mockedAnswer.create.mockResolvedValue({ _id: 'a1' });
  });

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
    expect(mockedAnswer.create).toHaveBeenCalledWith(
      expect.objectContaining({ choiceKey: 'good', userId: 'u1', userEmail: 'worker@x.com', userName: 'Worker', elapsedMs: 900 })
    );
  });

  it('validates mask ids against the task maskMap and accepts empty rejections', async () => {
    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { choiceKey: 'x' })).rejects.toThrow(
      'rejectedMaskIds required'
    );
    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [99] })).rejects.toThrow(
      'Unknown mask ids: 99'
    );

    await svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [] });
    expect(mockedAnswer.create).toHaveBeenCalledWith(expect.objectContaining({ rejectedMaskIds: [] }));
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

  it('maps a duplicate answer to Conflict', async () => {
    mockedAnswer.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [] })).rejects.toThrow(
      ConflictError
    );
  });

  it('rethrows unexpected create errors', async () => {
    mockedAnswer.create.mockRejectedValue(new Error('io'));

    await expect(svc.submitAnswer(maskTask(), activeJob(), user, { rejectedMaskIds: [] })).rejects.toThrow('io');
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
