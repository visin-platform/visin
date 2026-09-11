import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, optionalAuth } from '@visin/backend-core';
import { LabelJob, JOB_STATUSES, JobStatus } from '../../models/LabelJob';
import { LabelTask } from '../../models/LabelTask';
import { LabelImage } from '../../models/LabelImage';
import { LabelBundle } from '../../models/LabelBundle';
import jobRoutes from '../../routes/jobRoutes';
import taskRoutes from '../../routes/taskRoutes';
import { checkMembership } from '../../clients/groupServiceClient';
import { getDownloadUrl } from '../../clients/fileServiceClient';
import { setJobVisibility } from '../../services/jobService';

jest.mock('../../clients/groupServiceClient', () => ({ checkMembership: jest.fn() }));
jest.mock('../../clients/fileServiceClient', () => ({ getDownloadUrl: jest.fn() }));
const membership = checkMembership as jest.Mock;
const sign = getDownloadUrl as jest.Mock;
const actors: Record<string, string> = { owner: '000000000000000000000001', member: '000000000000000000000002', stranger: '000000000000000000000003' };
const creator = { userId: 'owner', email: 'PRIVATE_CREATOR@example.test' };

describe('job publication and task access with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  const oldSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'label-visibility-test-secret';
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), optionalAuth);
    app.use('/jobs', jobRoutes);
    app.use('/tasks', taskRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 120_000);
  beforeEach(async () => {
    await mongoose.connection.collection('users').insertMany(Object.entries(actors).map(([name, id]) => ({ _id: new mongoose.Types.ObjectId(id), email: `${name}@example.test`, tokenVersion: 1 })));
    jest.clearAllMocks();
    membership.mockImplementation(async (groupId, userId) => ({ member: groupId === 'actual-group' && [actors.member, actors.owner].includes(userId), role: userId === actors.owner ? 'owner' : 'member' }));
    sign.mockResolvedValue({ url: 'SIGNED_IMAGE_URL' });
  });
  afterEach(async () => {
    await Promise.all([mongoose.connection.collection('users').deleteMany({}), LabelJob.deleteMany({}), LabelTask.deleteMany({}), LabelImage.deleteMany({}), LabelBundle.deleteMany({})]);
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  const request = (path: string, userId?: string, method = 'GET', body?: object) => fetch(`${base}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(userId ? { authorization: `Bearer ${jwt.sign({ id: actors[userId], tokenVersion: 1, email: `${userId}@example.test`, name: userId }, process.env.JWT_SECRET!)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const fixture = async (status: JobStatus = 'active', isPublic?: boolean) => {
    const bundle = await LabelBundle.create({ name: 'B', groupId: 'actual-group', createdBy: creator, status: 'ready' });
    const job = await LabelJob.create({ name: 'Private content', groupId: 'actual-group', createdBy: creator, status,
      bundleId: bundle.id, taskType: 'single_choice', question: { prompt: 'Private prompt', choices: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }, tasksCount: 1, ...(isPublic !== undefined ? { isPublic } : {}) });
    const image = await LabelImage.create({ bundleId: bundle.id, path: 'frame.png', stem: 'frame', kind: 'frame', fileId: 'frame-file', size: 1, mimetype: 'image/png' });
    const task = await LabelTask.create({ jobId: job.id, labelImageId: image.id, order: 0 });
    return { job, task };
  };
  const paths = (jobId: string, taskId: string) => [`/jobs/${jobId}`, `/jobs/${jobId}/stats`, `/tasks/${taskId}`, `/jobs/${jobId}/tasks/at/0`, `/jobs/${jobId}/tasks/at/999`];

  it.each(JOB_STATUSES)('requires group access for private %s jobs on every read route', async status => {
    const { job, task } = await fixture(status);
    for (const path of paths(job.id, task.id)) {
      expect((await request(path)).status).toBe(403);
      expect((await request(path, 'stranger')).status).toBe(403);
    }
    expect(sign).not.toHaveBeenCalled();
    for (const path of paths(job.id, task.id)) expect((await request(path, 'member')).status).toBe(200);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(membership).toHaveBeenCalledWith('actual-group', actors.member);
  });

  it.each(JOB_STATUSES)('exposes a published %s job outside its group only while active', async status => {
    const { job, task } = await fixture(status, true);
    const expected = status === 'active' ? 200 : 403;
    for (const path of paths(job.id, task.id)) expect((await request(path)).status).toBe(expected);
    if (expected === 403) expect(sign).not.toHaveBeenCalled();
    const list = await (await request('/jobs')).json() as { data: unknown[] };
    expect(list.data).toHaveLength(expected === 200 ? 1 : 0);
  });

  it('makes activation independent of publication and restricts visibility changes to group administrators', async () => {
    const { job, task } = await fixture('draft');
    expect((await request(`/jobs/${job.id}/activate`, 'owner', 'POST')).status).toBe(200);
    expect((await LabelJob.findById(job.id))!.isPublic).toBe(false);
    expect((await request(`/tasks/${task.id}`)).status).toBe(403);
    for (const userId of [undefined, 'stranger', 'member']) {
      expect((await request(`/jobs/${job.id}/visibility`, userId, 'PUT', { isPublic: true })).status).toBe(userId ? 403 : 401);
    }
    expect((await request(`/jobs/${job.id}/visibility`, 'owner', 'PUT', { isPublic: 'true' })).status).toBe(400);
    expect((await request(`/jobs/${job.id}/visibility`, 'owner', 'PUT', { isPublic: true })).status).toBe(200);
    const publicView = await (await request(`/jobs/${job.id}`, 'stranger')).json() as { data: { canLabel: boolean; createdBy?: unknown } };
    expect(publicView.data.canLabel).toBe(false);
    expect(publicView.data.createdBy).toBeUndefined();
    expect((await request(`/tasks/${task.id}`)).status).toBe(200);
    expect((await request(`/jobs/${job.id}/visibility`, 'owner', 'PUT', { isPublic: false })).status).toBe(200);
    sign.mockClear();
    expect((await request(`/tasks/${task.id}`)).status).toBe(403);
    expect(sign).not.toHaveBeenCalled();
  });

  it('rechecks membership and uses the task actual parent, even if another job is public', async () => {
    const { job, task } = await fixture();
    await fixture('active', true);
    expect((await request(`/tasks/${task.id}`, 'member')).status).toBe(200);
    membership.mockResolvedValue({ member: false, role: 'owner' });
    sign.mockClear();
    expect((await request(`/tasks/${task.id}?groupId=other-group&isPublic=true`, 'member')).status).toBe(403);
    expect(sign).not.toHaveBeenCalled();
    membership.mockRejectedValue(new Error('membership unavailable'));
    expect((await request(`/jobs/${job.id}/tasks/at/0`, 'member')).status).toBe(500);
    expect(sign).not.toHaveBeenCalled();
  });

  it('fails closed for missing publication state or missing parents', async () => {
    const { job, task } = await fixture('active', true);
    await LabelJob.collection.updateOne({ _id: job._id }, { $unset: { isPublic: '' } });
    expect((await request(`/tasks/${task.id}`)).status).toBe(403);
    await LabelJob.deleteOne({ _id: job.id });
    expect((await request(`/tasks/${task.id}`, 'member')).status).toBe(404);
    expect((await request(`/jobs/${job.id}/tasks/at/999`, 'member')).status).toBe(404);
    await expect(setJobVisibility(job.id, true)).rejects.toMatchObject({ statusCode: 404 });
    expect(sign).not.toHaveBeenCalled();
  });

  it('ignores publication fields during creation and grants labeling capability only to members', async () => {
    const response = await request('/jobs', 'owner', 'POST', { name: 'New job', groupId: 'actual-group', taskType: 'single_choice', question: { prompt: 'P' }, isPublic: true });
    expect(response.status).toBe(201);
    expect((await response.json() as { data: { isPublic: boolean } }).data.isPublic).toBe(false);
    const { job } = await fixture('completed');
    const detail = await (await request(`/jobs/${job.id}`, 'member')).json() as { data: { canLabel: boolean } };
    expect(detail.data.canLabel).toBe(true);
  });
  it('rejects revoked sessions before private frame signing or publication changes', async () => {
    const { job, task } = await fixture();
    expect((await request(`/tasks/${task.id}`, 'owner')).status).toBe(200);
    await mongoose.connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(actors.owner) }, { $inc: { tokenVersion: 1 } });
    sign.mockClear();
    expect((await request(`/tasks/${task.id}`, 'owner')).status).toBe(403);
    expect((await request(`/jobs/${job.id}/visibility`, 'owner', 'PUT', { isPublic: true })).status).toBe(401);
    expect(sign).not.toHaveBeenCalled();
  });

});
