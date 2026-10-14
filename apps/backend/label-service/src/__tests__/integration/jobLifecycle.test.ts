jest.mock('../../clients/datasetServiceClient', () => ({
  getDataset: jest.fn(), getPermission: jest.fn(), datasetIdsFor: jest.fn(), addHold: jest.fn(), removeHold: jest.fn()
}));
jest.mock('../../clients/fileServiceClient', () => ({ deleteFolder: jest.fn(), jobFolder: (id: string) => `label/${id}/` }));

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConflictError, NotFoundError } from '@visin/backend-core';
import { LabelJob } from '../../models/LabelJob';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import { LabelSuggestion } from '../../models/LabelSuggestion';
import * as datasets from '../../clients/datasetServiceClient';
import * as files from '../../clients/fileServiceClient';
import { createJob, deleteJob, getJob, listJobsForUser, listPublicJobs, setJobVisibility } from '../../services/jobService';
import { beginJobDeletion, finishJobCreation, finishJobDeletion, LIFECYCLE_LEASE_MS, newLifecycleLease, recoverJobLifecycles, releaseLifecycleLease } from '../../services/jobLifecycleService';
import { materializeTasks } from '../../services/materializationService';
import { getTaskWithJob, saveObjects } from '../../services/taskService';

let mongo: MongoMemoryServer;
const holds = new Set<string>();
const user = { id: 'owner', email: 'owner@example.test' };
const body = { name: 'Street', datasetId: 'dataset', taskType: 'annotate' as const,
  sensors: [{ key: 'camera' as const, group: 'frames', kind: 'image' as const }],
  classes: [{ name: 'Car', tools: ['box' as const] }], redundancy: 1 };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);
beforeEach(() => {
  jest.resetAllMocks();
  holds.clear();
  jest.mocked(datasets.getDataset).mockResolvedValue({ _id: 'dataset', name: 'Street', owner: { kind: 'user', id: user.id },
    visibility: 'public', groups: [{ name: 'frames', images: 1, jsons: 0 }], imageCount: 1 });
  jest.mocked(datasets.getPermission).mockResolvedValue('manage');
  jest.mocked(datasets.datasetIdsFor).mockResolvedValue(['dataset']);
  jest.mocked(datasets.addHold).mockImplementation(async (_id, ref) => { holds.add(ref); });
  jest.mocked(datasets.removeHold).mockImplementation(async (_id, ref) => { holds.delete(ref); });
  jest.mocked(files.deleteFolder).mockResolvedValue(undefined);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([LabelJob.deleteMany({}), LabelTask.deleteMany({}), LabelAnnotation.deleteMany({}), LabelSuggestion.deleteMany({})]);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

const fixture = async () => {
  const job = await createJob(user, body);
  const task = await LabelTask.create({ jobId: job._id, order: 0, frame: { fileId: 'frame', stem: 'frame', path: 'frames/frame.png' } });
  await LabelAnnotation.create({ jobId: job._id, taskId: task._id, userId: user.id, userEmail: user.email });
  await LabelSuggestion.create({ jobId: job._id, taskId: task._id });
  return job;
};

it('publishes only jobs whose hold has been acknowledged', async () => {
  const job = await createJob(user, body);
  expect(holds.has(job.id)).toBe(true);
  expect(job.lifecycle).toBeUndefined();
  expect(job.lifecycleToken).toBeUndefined();
  expect(await getJob(job.id)).toBeTruthy();
});

it.each([false, true])('recovers uncertain hold delivery (remote write succeeded: %s)', async (written) => {
  jest.mocked(datasets.addHold).mockImplementationOnce(async (_id, ref) => {
    if (written) holds.add(ref);
    throw new Error('ACK lost');
  });
  await expect(createJob(user, body)).rejects.toThrow('ACK lost');
  const pending = (await LabelJob.findOne())!;
  expect(pending.lifecycle).toBe('creating');
  await expect(getJob(pending.id)).rejects.toThrow(NotFoundError);
  expect(await listJobsForUser(user.id, 'admin')).toEqual([]);
  expect(await listJobsForUser(user.id, 'worker')).toEqual([]);
  expect(await listPublicJobs()).toEqual([]);
  await expect(setJobVisibility(pending.id, true)).rejects.toThrow(NotFoundError);
  expect(await recoverJobLifecycles()).toBe(1);
  expect((await getJob(pending.id)).lifecycle).toBeUndefined();
  expect([...holds]).toEqual([pending.id]);
  expect(await recoverJobLifecycles()).toBe(0);
});

it.each([new ConflictError('import won'), new NotFoundError('purge won')])('cleans up a definitively refused creation: %s', async (error) => {
  jest.mocked(datasets.addHold).mockRejectedValueOnce(error);
  await expect(createJob(user, body)).rejects.toThrow(error);
  expect(await LabelJob.countDocuments()).toBe(0);
  expect(holds.size).toBe(0);
});

it('retains a failed creation cleanup and resumes it', async () => {
  jest.mocked(datasets.addHold).mockRejectedValueOnce(new ConflictError('import won'));
  jest.mocked(files.deleteFolder).mockRejectedValueOnce(new Error('files unavailable'));
  await expect(createJob(user, body)).rejects.toThrow('import won');
  expect((await LabelJob.findOne())!.lifecycle).toBe('deleting');
  expect(await recoverJobLifecycles()).toBe(1);
  expect(await LabelJob.countDocuments()).toBe(0);
});

it('reclaims an expired creation lease after a crash, and skips live leases', async () => {
  const job = await LabelJob.create({ ...body, classes: [], createdBy: { userId: user.id, email: user.email },
    lifecycle: 'creating', ...newLifecycleLease() });
  expect(await recoverJobLifecycles()).toBe(0);
  expect(await recoverJobLifecycles(new Date(Date.now() + LIFECYCLE_LEASE_MS + 1))).toBe(1);
  expect(holds.has(job.id)).toBe(true);
});

it.each(['files', 'annotations', 'suggestions', 'tasks', 'hold', 'job'])('recovers deletion interrupted at %s', async (stage) => {
  const job = await fixture();
  const failure = new Error(`failed at ${stage}`);
  if (stage === 'files') jest.mocked(files.deleteFolder).mockRejectedValueOnce(failure);
  if (stage === 'annotations') jest.spyOn(LabelAnnotation, 'deleteMany').mockRejectedValueOnce(failure);
  if (stage === 'suggestions') jest.spyOn(LabelSuggestion, 'deleteMany').mockRejectedValueOnce(failure);
  if (stage === 'tasks') jest.spyOn(LabelTask, 'deleteMany').mockRejectedValueOnce(failure);
  if (stage === 'hold') jest.mocked(datasets.removeHold).mockRejectedValueOnce(failure);
  if (stage === 'job') jest.spyOn(LabelJob, 'deleteOne').mockRejectedValueOnce(failure);
  await expect(deleteJob(job.id)).rejects.toThrow(failure);
  expect((await LabelJob.findById(job.id))!.lifecycle).toBe('deleting');
  await expect(getJob(job.id)).rejects.toThrow(NotFoundError);
  if (await LabelTask.countDocuments({ jobId: job._id })) expect(holds.has(job.id)).toBe(true);
  expect(await recoverJobLifecycles()).toBe(1);
  expect(await LabelJob.countDocuments()).toBe(0);
  expect(await LabelTask.countDocuments()).toBe(0);
  expect(await LabelAnnotation.countDocuments()).toBe(0);
  expect(await LabelSuggestion.countDocuments()).toBe(0);
  expect(holds.size).toBe(0);
  expect(await deleteJob(job.id)).toEqual({ tasks: 0, annotations: 0, suggestions: 0 });
});

it('retries a lost release ACK without orphaning the deletion intent', async () => {
  const job = await fixture();
  jest.mocked(datasets.removeHold).mockImplementationOnce(async (_id, ref) => { holds.delete(ref); throw new Error('ACK lost'); });
  await expect(deleteJob(job.id)).rejects.toThrow('ACK lost');
  expect(await LabelTask.countDocuments()).toBe(0);
  expect(await recoverJobLifecycles()).toBe(1);
  expect(await LabelJob.countDocuments()).toBe(0);
});

it('accepts an already removed dataset and cleans up a legacy job without a dataset', async () => {
  const job = await fixture();
  holds.clear();
  jest.mocked(datasets.removeHold).mockRejectedValueOnce(new NotFoundError('gone'));
  expect(await deleteJob(job.id)).toEqual({ tasks: 1, annotations: 1, suggestions: 1 });
  const legacy = await LabelJob.create({ name: 'Legacy', createdBy: { userId: user.id, email: user.email } });
  expect(await deleteJob(legacy.id)).toEqual({ tasks: 0, annotations: 0, suggestions: 0 });
});

it('rejects concurrent deletion and prevents stale lease holders from cleaning or publishing', async () => {
  const job = await fixture();
  const deleting = (await beginJobDeletion(job.id))!;
  await expect(beginJobDeletion(job.id)).rejects.toThrow(ConflictError);
  await LabelJob.updateOne({ _id: job._id }, { $set: newLifecycleLease() });
  await expect(finishJobDeletion(deleting)).rejects.toThrow(ConflictError);
  await releaseLifecycleLease(deleting);
  expect((await LabelJob.findById(job._id))!.lifecycleToken).not.toBe(deleting.lifecycleToken);
  expect(holds.has(job.id)).toBe(true);
  job.lifecycle = 'creating';
  job.lifecycleToken = 'stale';
  await expect(finishJobCreation(job)).rejects.toThrow(ConflictError);
});

it('refuses deletion while creation is unfinished and recovers a legacy intent without a lease', async () => {
  const job = await LabelJob.create({ name: 'Legacy', createdBy: { userId: user.id, email: user.email }, lifecycle: 'creating', datasetId: 'dataset' });
  await expect(beginJobDeletion(job.id)).rejects.toThrow(ConflictError);
  expect(await recoverJobLifecycles()).toBe(1);
});

it('continues recovery after one remote failure', async () => {
  await LabelJob.create([0, 1].map((i) => ({ name: `Pending ${i}`, datasetId: 'dataset',
    createdBy: { userId: user.id, email: user.email }, lifecycle: 'creating' })));
  jest.mocked(datasets.addHold).mockRejectedValueOnce(new Error('temporary outage'));
  expect(await recoverJobLifecycles()).toBe(1);
  expect(await LabelJob.countDocuments({ lifecycle: 'creating' })).toBe(1);
  expect(await recoverJobLifecycles()).toBe(1);
});

it('claims one pending job once across concurrent reconcilers', async () => {
  const job = await LabelJob.create({ name: 'Pending', datasetId: 'dataset',
    createdBy: { userId: user.id, email: user.email }, lifecycle: 'creating' });
  const recovered = await Promise.all([recoverJobLifecycles(), recoverJobLifecycles()]);
  expect(recovered.reduce((sum, count) => sum + count, 0)).toBe(1);
  expect(datasets.addHold).toHaveBeenCalledTimes(1);
  expect(holds.has(job.id)).toBe(true);
});

it('does not publish after losing ownership during a hold request', async () => {
  jest.mocked(datasets.addHold).mockImplementationOnce(async (_id, ref) => {
    holds.add(ref);
    await LabelJob.updateOne({ _id: ref }, { $set: newLifecycleLease() });
  });
  await expect(createJob(user, body)).rejects.toThrow(ConflictError);
  const pending = (await LabelJob.findOne())!;
  expect(pending.lifecycle).toBe('creating');
  expect(holds.has(pending.id)).toBe(true);
  // A future owner can confirm that exact hold instead of stranding it.
  expect(await recoverJobLifecycles(new Date(Date.now() + LIFECYCLE_LEASE_MS + 1))).toBe(1);
});

it('does not compensate another owner after a refused hold request', async () => {
  jest.mocked(datasets.addHold).mockImplementationOnce(async (_id, ref) => {
    await LabelJob.updateOne({ _id: ref }, { $set: newLifecycleLease() });
    throw new ConflictError('hold refused');
  });
  await expect(createJob(user, body)).rejects.toThrow('hold refused');
  expect(files.deleteFolder).not.toHaveBeenCalled();
  expect((await LabelJob.findOne())!.lifecycle).toBe('creating');
});

it('blocks task access, labeling and materialization while cleanup is pending', async () => {
  const job = await fixture();
  const task = (await LabelTask.findOne({ jobId: job._id }))!;
  const deleting = (await beginJobDeletion(job.id))!;
  await expect(getTaskWithJob(task.id)).rejects.toThrow(NotFoundError);
  await expect(materializeTasks(deleting, { kind: 'filter' })).rejects.toThrow(ConflictError);
  await expect(saveObjects(task, deleting, user, { objects: [] })).rejects.toThrow(ConflictError);
  expect(holds.has(job.id)).toBe(true);
});
