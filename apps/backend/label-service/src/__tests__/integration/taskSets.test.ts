jest.mock('../../clients/datasetServiceClient', () => ({ getDataset: jest.fn(), listItems: jest.fn(), getPermission: jest.fn() }));
jest.mock('../../clients/fileServiceClient', () => ({
  deleteFile: jest.fn(), getDownloadUrls: jest.fn(),
  jobFolder: (id: string) => `label/${id}/`
}));

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConflictError, NotFoundError } from '@visin/backend-core';
import { LabelJob } from '../../models/LabelJob';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import { LabelSuggestion } from '../../models/LabelSuggestion';
import * as datasets from '../../clients/datasetServiceClient';
import * as files from '../../clients/fileServiceClient';
import { materializeTasks } from '../../services/materializationService';
import { beginTaskSet, publishTaskSet, renewTaskSet, abandonTaskSet, recoverTaskSets, MATERIALIZATION_LEASE_MS, TASK_BATCH_SIZE } from '../../services/taskSetService';
import { taskSet } from '../../services/taskGeneration';
import { getJobProgress, transitionJob } from '../../services/jobService';
import { beginJobDeletion } from '../../services/jobLifecycleService';
import { getTaskWithJob, getTaskItemAtIndex, saveObjects, finishTask } from '../../services/taskService';
import { jobStats } from '../../services/exportService';

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri());
  await LabelTask.syncIndexes();
}, 120_000);
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(datasets.getDataset).mockResolvedValue({ _id: 'dataset', name: 'Drive', owner: { kind: 'user', id: 'owner' },
    visibility: 'public', groups: [{ name: 'camera', images: 1, jsons: 0 }], imageCount: 1 });
  jest.mocked(datasets.getPermission).mockResolvedValue('manage');
  jest.mocked(files.deleteFile).mockResolvedValue(undefined);
  jest.mocked(files.getDownloadUrls).mockImplementation(async (ids) => Object.fromEntries(ids.map((id) => [id, `signed:${id}`])));
  frames(2);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([LabelJob.deleteMany({}), LabelTask.deleteMany({}), LabelAnnotation.deleteMany({}), LabelSuggestion.deleteMany({})]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const user = { id: 'owner', email: 'owner@example.test' };
function frames(count: number) {
  jest.mocked(datasets.listItems).mockResolvedValue(Array.from({ length: count }, (_, i) => ({
    _id: `f${i}`, group: 'camera', path: `camera/${String(i).padStart(6, '0')}.png`, stem: `f${i}`, kind: 'image', fileId: `f${i}`
  })));
}
const fixture = async () => {
  const job = await LabelJob.create({ name: 'Drive', datasetId: 'dataset', createdBy: { userId: user.id, email: user.email },
    sensors: [{ key: 'camera', group: 'camera', kind: 'image' }], tasksCount: 1,
    selection: { kind: 'filter', spec: { rows: 1 } }, classes: [{ key: 'car', name: 'Car', color: '#000000', maskIndex: 1 }] });
  const old = await LabelTask.create({ jobId: job._id, order: 0, frame: { fileId: 'old', path: 'old.png', stem: 'old' } });
  await LabelAnnotation.create({ jobId: job._id, taskId: old._id, userId: user.id, userEmail: user.email, status: 'done',
    mask: { fileId: 'old-mask', width: 1, height: 1, pixels: { '1': 1 } } });
  await LabelSuggestion.create({ jobId: job._id, taskId: old._id, mask: { fileId: 'old-suggestion', width: 1, height: 1, pixels: {} } });
  return { job, old };
};

it('publishes metadata and tasks together, excludes obsolete labels, and cleans their files afterward', async () => {
  const { job, old } = await fixture();
  expect((await getJobProgress(job, user.id)).done).toBe(1);
  expect(await materializeTasks(job, { kind: 'filter' })).toMatchObject({ tasks: 2 });
  const stored = (await LabelJob.findById(job.id))!;
  expect(stored.tasksCount).toBe(2);
  expect(stored.selection!.spec).toMatchObject({ rows: 2 });
  expect(stored.materialization).toBeUndefined();
  expect(await LabelTask.countDocuments(taskSet(stored))).toBe(2);
  expect(await LabelTask.countDocuments({ jobId: job._id })).toBe(3);
  await expect(getTaskWithJob(old.id)).rejects.toThrow(NotFoundError);
  const item = (await getTaskItemAtIndex(job.id, 0, user.id))!;
  expect(item.images.frame.stem).toBe('f0');
  expect(item.position).toEqual({ index: 0, total: 2 });
  expect(await getJobProgress(stored, user.id)).toMatchObject({ tasks: 2, done: 0 });
  expect(await jobStats(stored)).toMatchObject({ tasks: 2, done: 0, objects: 0 });
  expect(await recoverTaskSets()).toBe(1);
  expect(files.deleteFile).toHaveBeenCalledWith('old-mask');
  expect(files.deleteFile).toHaveBeenCalledWith('old-suggestion');
  expect(await LabelAnnotation.countDocuments()).toBe(0);
  expect(await LabelSuggestion.countDocuments()).toBe(0);
  expect(await LabelTask.countDocuments()).toBe(2);
  expect(await recoverTaskSets()).toBe(0);
});

it.each(['insert', 'metadata'])('preserves the published task set after %s fails', async (stage) => {
  const { job, old } = await fixture();
  if (stage === 'insert') {
    const insert = LabelTask.insertMany.bind(LabelTask);
    jest.spyOn(LabelTask, 'insertMany').mockImplementationOnce((async (rows: unknown[]) => {
      await insert(rows.slice(0, 1)); throw new Error('partial insert');
    }) as unknown as typeof LabelTask.insertMany);
  } else {
    const update = LabelJob.updateOne.bind(LabelJob);
    jest.spyOn(LabelJob, 'updateOne').mockImplementation(((...args: Parameters<typeof LabelJob.updateOne>) => {
      if ((args[1] as { $set?: { taskGeneration?: string } }).$set?.taskGeneration) return Promise.reject(new Error('metadata failed'));
      return update(...args);
    }) as unknown as typeof LabelJob.updateOne);
  }
  await expect(materializeTasks(job, { kind: 'filter' })).rejects.toThrow();
  const stored = (await LabelJob.findById(job.id))!;
  expect(stored.taskGeneration).toBeUndefined();
  expect(stored.tasksCount).toBe(1);
  expect(await LabelTask.countDocuments(taskSet(stored))).toBe(1);
  expect((await getTaskWithJob(old.id)).task.id).toBe(old.id);
  expect((await getJobProgress(stored, user.id)).done).toBe(1);
  await recoverTaskSets();
  expect(await LabelTask.countDocuments()).toBe(1);
  expect(await LabelAnnotation.countDocuments()).toBe(1);
});

it('retains a successfully published task set after its acknowledgement is lost', async () => {
  const { job } = await fixture();
  const update = LabelJob.updateOne.bind(LabelJob);
  jest.spyOn(LabelJob, 'updateOne').mockImplementation(((...args: Parameters<typeof LabelJob.updateOne>) => {
    const write = update(...args);
    if ((args[1] as { $set?: { taskGeneration?: string } }).$set?.taskGeneration) return write.then(() => { throw new Error('ACK lost'); });
    return write;
  }) as unknown as typeof LabelJob.updateOne);
  await expect(materializeTasks(job, { kind: 'filter' })).rejects.toThrow('ACK lost');
  const stored = (await LabelJob.findById(job.id))!;
  expect(stored.taskGeneration).toBeDefined();
  await recoverTaskSets();
  expect(await LabelTask.countDocuments(taskSet(stored))).toBe(2);
});

it('bounds insert batches and enforces unique generation/order coordinates', async () => {
  const { job } = await fixture();
  frames(TASK_BATCH_SIZE * 2 + 1);
  const insert = jest.spyOn(LabelTask, 'insertMany');
  await materializeTasks(job, { kind: 'filter' });
  expect(insert.mock.calls.map(([batch]) => (batch as unknown[]).length)).toEqual([TASK_BATCH_SIZE, TASK_BATCH_SIZE, 1]);
  const task = (await LabelTask.findOne(taskSet(job)))!;
  await expect(LabelTask.create({ jobId: job._id, generation: task.generation, order: task.order, frame: task.frame })).rejects.toMatchObject({ code: 11000 });
});

it('serializes materialization against another build, activation and deletion', async () => {
  const { job } = await fixture();
  const generation = await beginTaskSet(job);
  await expect(beginTaskSet(job)).rejects.toThrow(ConflictError);
  await expect(transitionJob(job.id, 'activate')).rejects.toThrow(ConflictError);
  await expect(beginJobDeletion(job.id)).rejects.toThrow(ConflictError);
  await recoverTaskSets();
  expect((await LabelJob.findById(job.id))!.materialization!.generation).toBe(generation);
  await abandonTaskSet(job, generation);
  expect((await transitionJob(job.id, 'activate')).status).toBe('active');
  await expect(beginTaskSet(job)).rejects.toThrow(ConflictError);
});

it('allows only one concurrently built generation to publish', async () => {
  const { job } = await fixture();
  const other = (await LabelJob.findById(job.id))!;
  const attempts = await Promise.allSettled([materializeTasks(job, { kind: 'filter' }), materializeTasks(other, { kind: 'filter' })]);
  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const stored = (await LabelJob.findById(job.id))!;
  expect(await LabelTask.countDocuments(taskSet(stored))).toBe(stored.tasksCount);
});

it('rejects a stale draft after activation or deletion wins during dataset reads', async () => {
  const { job } = await fixture();
  jest.mocked(datasets.getDataset).mockImplementationOnce(async () => {
    await transitionJob(job.id, 'activate');
    return { _id: 'dataset', name: 'Drive', owner: { kind: 'user', id: 'owner' }, visibility: 'public', groups: [{ name: 'camera', images: 1, jsons: 0 }], imageCount: 1 };
  });
  await expect(materializeTasks(job, { kind: 'filter' })).rejects.toThrow(ConflictError);
  expect(await LabelTask.countDocuments()).toBe(1);
  await LabelJob.updateOne({ _id: job._id }, { $unset: { lifecycle: '' }, $set: { status: 'draft' } });
  await beginJobDeletion(job.id);
  await expect(materializeTasks(job, { kind: 'filter' })).rejects.toThrow(ConflictError);
  expect(await LabelTask.countDocuments()).toBe(1);
});

it('expires a crashed build, rejects late publication and discovers late inserted rows', async () => {
  const { job } = await fixture();
  const generation = await beginTaskSet(job);
  await LabelTask.create({ jobId: job._id, generation, order: 0, frame: { fileId: 'staged', path: 'staged.png', stem: 'staged' } });
  expect(await recoverTaskSets(new Date(Date.now() + MATERIALIZATION_LEASE_MS + 1))).toBe(1);
  await expect(renewTaskSet(job, generation)).rejects.toThrow(ConflictError);
  await expect(publishTaskSet(job, generation, 1, { kind: 'filter' })).rejects.toThrow(ConflictError);
  await LabelTask.create({ jobId: job._id, generation, order: 1, frame: { fileId: 'late', path: 'late.png', stem: 'late' } });
  expect(await recoverTaskSets()).toBe(1);
  expect(await LabelTask.countDocuments(taskSet(job))).toBe(1);
});

it('retries obsolete file cleanup and cleans sets whose job has disappeared', async () => {
  const { job } = await fixture();
  await materializeTasks(job, { kind: 'filter' });
  jest.mocked(files.deleteFile).mockRejectedValueOnce(new Error('files down'));
  expect(await recoverTaskSets()).toBe(0);
  expect(await LabelAnnotation.countDocuments()).toBe(1);
  expect(await recoverTaskSets()).toBe(1);
  await LabelJob.deleteOne({ _id: job._id });
  expect(await recoverTaskSets()).toBe(1);
  expect(await LabelTask.countDocuments()).toBe(0);
});

it('records new annotations in the published generation', async () => {
  const { job } = await fixture();
  await materializeTasks(job, { kind: 'filter' });
  const active = await transitionJob(job.id, 'activate');
  const task = (await LabelTask.findOne(taskSet(active)))!;
  const draft = await saveObjects(task, active, user, { objects: [] });
  expect(draft.generation).toBe(active.taskGeneration);
  await finishTask(task, active, user, 'done');
  expect((await getJobProgress(active, user.id)).done).toBe(1);
});

it('preserves the original build failure when releasing its lock also fails', async () => {
  const { job } = await fixture();
  jest.spyOn(LabelTask, 'insertMany').mockRejectedValueOnce(new Error('insert failed'));
  const update = LabelJob.updateOne.bind(LabelJob);
  jest.spyOn(LabelJob, 'updateOne').mockImplementation(((...args: Parameters<typeof LabelJob.updateOne>) => {
    if ((args[1] as { $unset?: unknown }).$unset) return Promise.reject(new Error('release failed'));
    return update(...args);
  }) as unknown as typeof LabelJob.updateOne);
  await expect(materializeTasks(job, { kind: 'filter' })).rejects.toThrow('insert failed');
  expect((await LabelJob.findById(job.id))!.materialization).toBeDefined();
  await recoverTaskSets(new Date(Date.now() + MATERIALIZATION_LEASE_MS + 1));
  expect((await LabelJob.findById(job.id))!.materialization).toBeUndefined();
  expect(await LabelTask.countDocuments(taskSet(job))).toBe(1);
});

it('discovers retired annotation-only generations without task rows', async () => {
  const { job, old } = await fixture();
  await LabelAnnotation.create({ jobId: job._id, taskId: old._id, generation: 'retired', userId: 'other', userEmail: 'other@example.test' });
  await LabelSuggestion.updateOne({ jobId: job._id }, { $set: { generation: 'retired' }, $unset: { mask: '' } });
  expect(await recoverTaskSets()).toBe(1);
  expect(await LabelAnnotation.countDocuments()).toBe(1);
  expect(await LabelSuggestion.countDocuments()).toBe(0);
  expect(await LabelTask.countDocuments()).toBe(1);
});
