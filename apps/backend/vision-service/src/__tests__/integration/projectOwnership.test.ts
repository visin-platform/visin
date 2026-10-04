import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, ResourceEvent } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { deleteFiles } from '../../clients/fileServiceClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Comparison from '../../models/Comparison';
import Config from '../../models/Config';
import Epoch from '../../models/Epoch';
import EpochVisualization from '../../models/EpochVisualization';
import Finding from '../../models/Finding';
import Project from '../../models/Project';
import Evaluation from '../../models/Evaluation';
import { recordTest } from '../fixtures/recordedTest';
import Training from '../../models/Training';
import comparisonRoutes from '../../routes/comparisonRoutes';
import projectRoutes from '../../routes/projectRoutes';
import trainingRoutes from '../../routes/trainingRoutes';
import { purgeExpiredTrash } from '../../services/purgeService';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
jest.mock('../../clients/fileServiceClient', () => ({
  ...jest.requireActual('../../clients/fileServiceClient'),
  deleteFiles: jest.fn()
}));
const otherMembership = jest.fn();
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  createGroupServiceClient: () => ({ checkMembership: otherMembership, getMyGroups: jest.fn() })
}));

const OWNER = '000000000000000000000001';
const ADMIN = '000000000000000000000002';
const MEMBER = '000000000000000000000003';
const STRANGER = '000000000000000000000004';
const GROUP = '0000000000000000000000aa';
const OTHER_GROUP = '0000000000000000000000bb';
const ROLES: Record<string, { id: string; name: string; role: 'owner' | 'admin' | 'member' }[]> = {
  [OWNER]: [{ id: GROUP, name: 'Team', role: 'owner' }, { id: OTHER_GROUP, name: 'Lab', role: 'member' }],
  [ADMIN]: [{ id: GROUP, name: 'Team', role: 'admin' }],
  [MEMBER]: [{ id: GROUP, name: 'Team', role: 'member' }]
};

/**
 * Projects have an owner (a person or a group), a visibility, a trash and a
 * transfer: the rules end to end, against a real database.
 */
describe('project ownership with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'project-ownership-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/projects', projectRoutes);
    app.use('/trainings', trainingRoutes);
    app.use('/comparisons', comparisonRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    const ids = [OWNER, ADMIN, MEMBER, STRANGER].map(id => new mongoose.Types.ObjectId(id));
    await mongoose.connection.collection('users').insertMany(ids.map(_id => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection.collection('user_sessions').insertMany(ids.map(_id => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    jest.mocked(getUserGroups).mockImplementation(async userId => ROLES[userId ?? ''] ?? []);
    jest.mocked(deleteFiles).mockReset().mockResolvedValue(undefined);
    otherMembership.mockReset().mockResolvedValue({ member: false, role: null });
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.disconnect(); } finally { await mongo?.stop(); }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Body = { data: any; error?: string; message?: string };
  const call = async (path: string, { method = 'GET', user = OWNER, body }: { method?: string; user?: string; body?: unknown } = {}) => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: user, email: `${user}@example.test`, tokenVersion: 1, sid: user, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
  };
  const teamProject = async (fields: Record<string, unknown> = {}) =>
    String((await Project.create({ name: 'Team project', owner: { kind: 'group', id: GROUP }, createdBy: MEMBER, ...fields }))._id);
  const names = async (path: string, user?: string) =>
    ((await call(path, { user })).body.data as { name: string }[]).map(project => project.name).sort();
  const events = () => ResourceEvent.find({ resourceType: 'project' }).sort({ at: 1 }).lean();

  describe('who sees and changes a project', () => {
    it("follows the owning group's roles: members contribute, admins manage, its owner owns", async () => {
      const id = await teamProject();
      const permissions = async (user: string) => (await call(`/projects/${id}`, { user })).body.data?.permissions;
      expect(await permissions(OWNER)).toEqual({ read: true, contribute: true, manage: true, own: true });
      expect(await permissions(ADMIN)).toEqual({ read: true, contribute: true, manage: true, own: false });
      expect(await permissions(MEMBER)).toEqual({ read: true, contribute: true, manage: false, own: false });
      expect((await call(`/projects/${id}`, { user: STRANGER })).status).toBe(403);
      expect((await call(`/projects/${id}`, { user: '' })).status).toBe(403);
      expect((await call(`/projects/${id}`, { user: MEMBER })).body.data).toMatchObject({
        owner: { kind: 'group', id: GROUP, name: 'Team' },
        createdBy: MEMBER,
        visibility: 'private'
      });
      expect((await call(`/projects/${id}`, { user: MEMBER })).body.data).not.toHaveProperty('ownerId');
    });

    it('lists what each caller may see, narrowed by owner or by what they may add to', async () => {
      await teamProject();
      await Project.create({ name: 'Mine', owner: { kind: 'user', id: OWNER }, createdBy: OWNER });
      await Project.create({ name: 'Open', owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER, visibility: 'public' });
      await Project.create({ name: 'Trashed', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, trashedAt: new Date() });
      expect(await names('/projects', '')).toEqual(['Open']);
      expect(await names('/projects', STRANGER)).toEqual(['Open']);
      expect(await names('/projects', MEMBER)).toEqual(['Open', 'Team project']);
      expect(await names('/projects')).toEqual(['Mine', 'Open', 'Team project']);
      expect(await names('/projects?owner=me')).toEqual(['Mine']);
      expect(await names(`/projects?owner=${GROUP}`)).toEqual(['Team project']);
      expect(await names('/projects?access=contribute', MEMBER)).toEqual(['Team project']);
      expect(await names('/projects?owner=me', '')).toEqual([]);
      // One the old service made after the owner migration ran: out of sight until it has an owner.
      const unowned = (await Project.collection.insertOne({ name: 'Unowned', ownerId: OWNER, isPublic: true })).insertedId;
      expect(await names('/projects')).toEqual(['Mine', 'Open', 'Team project']);
      expect((await call(`/projects/${unowned}`)).status).toBe(403);
    });

    it('needs manage for settings and own for who can see it', async () => {
      const id = await teamProject();
      const put = (user: string, body: Record<string, unknown>) => call(`/projects/${id}`, { method: 'PUT', user, body });
      expect((await put(MEMBER, { name: 'Renamed' })).status).toBe(403);
      expect((await put(ADMIN, { name: 'Renamed', visibility: 'private' })).body.data.name).toBe('Renamed');
      expect((await put(ADMIN, { visibility: 'public' })).status).toBe(403);
      expect((await put(OWNER, { visibility: 'public' })).body.data.visibility).toBe('public');
      // Changing a project is something happening in it.
      expect((await Project.findById(id).lean())?.lastActivityAt).toBeInstanceOf(Date);
      expect((await call(`/projects/${id}`, { user: STRANGER })).status).toBe(200);
      expect((await events()).map(event => event.action)).toEqual(['visibility']);
    });
  });

  describe('creating a project', () => {
    it("makes it private and the creator's unless told otherwise", async () => {
      const created = await call('/projects', { method: 'POST', body: { name: 'New' } });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ owner: { kind: 'user', id: OWNER }, createdBy: OWNER, visibility: 'private', permissions: { own: true } });
    });

    it('counts as the first thing to happen in it, so it starts out recently active', async () => {
      const before = Date.now();
      const created = await call('/projects', { method: 'POST', body: { name: 'Fresh' } });

      const stored = await Project.findById(created.body.data._id).lean();
      expect(stored?.lastActivityAt?.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("puts it in a group only for the group's members, and public there only for its owner", async () => {
      const inGroup = (user: string, visibility = 'private') =>
        call('/projects', { method: 'POST', user, body: { name: 'Group work', owner: { kind: 'group', id: GROUP }, visibility } });
      expect((await inGroup(STRANGER)).status).toBe(403);
      expect((await inGroup(MEMBER, 'public')).status).toBe(403);
      expect((await inGroup(MEMBER)).body.data).toMatchObject({ owner: { kind: 'group', id: GROUP }, createdBy: MEMBER, permissions: { manage: false } });
      expect((await inGroup(OWNER, 'public')).status).toBe(201);
      expect((await call('/projects', { method: 'POST', body: { name: 'Theirs', owner: { kind: 'user', id: STRANGER } } })).status).toBe(403);
    });
  });

  describe('transferring a project', () => {
    it('lets its owner hand it to a group they are in, one way, and records it', async () => {
      const id = String((await Project.create({ name: 'Solo', owner: { kind: 'user', id: MEMBER }, createdBy: MEMBER }))._id);
      const transfer = (user: string, owner: Record<string, string>) => call(`/projects/${id}/owner`, { method: 'PUT', user, body: { owner } });
      expect((await transfer(OWNER, { kind: 'group', id: GROUP })).status).toBe(403);
      expect((await transfer(MEMBER, { kind: 'group', id: OTHER_GROUP })).body.message).toMatch(/group you are in/);
      expect((await transfer(MEMBER, { kind: 'group', id: GROUP })).body.data.owner).toMatchObject({ kind: 'group', id: GROUP });
      // Now the group's: a member no longer owns it, so cannot take it back.
      expect((await transfer(MEMBER, { kind: 'user', id: MEMBER })).status).toBe(403);
      expect((await events()).at(-1)).toMatchObject({ action: 'transfer', from: { kind: 'user', id: MEMBER }, to: { kind: 'group', id: GROUP }, groupIds: [GROUP] });
      expect((await transfer(OWNER, { kind: 'team', id: GROUP })).status).toBe(400);
    });

    it("lets the owning group's owner hand it to a member, asking group-service about them", async () => {
      const id = await teamProject();
      const transfer = (owner: Record<string, string>) => call(`/projects/${id}/owner`, { method: 'PUT', body: { owner } });
      expect((await transfer({ kind: 'user', id: STRANGER })).status).toBe(403);
      otherMembership.mockResolvedValue({ member: true, role: 'member' });
      expect((await transfer({ kind: 'user', id: MEMBER })).body.data.owner).toMatchObject({ kind: 'user', id: MEMBER });
      expect(otherMembership).toHaveBeenCalledWith(GROUP, MEMBER);
    });
  });

  describe('the trash', () => {
    const seed = async (projectId: string) => {
      const training = String((await Training.create({ name: 'Run', uuid: `run-${projectId}`, ownerId: MEMBER, projectId }))._id);
      await Epoch.create({ timestamp: new Date(), trainingId: training, training_uuid: `run-${projectId}`, epoch_uuid: `epoch-${projectId}`, epoch: 1, results: {} });
      await recordTest({ projectId, trainingId: training, timestamp: new Date(), epoch: 1, epoch_uuid: `epoch-${projectId}`, test_uuid: `test-${projectId}`, test_results: {} });
      await EpochVisualization.create({ epoch_uuid: `epoch-${projectId}`, visualization_uuid: `viz-${projectId}`, filename: 'a.png', type: 'curve', fileId: `file-${projectId}` });
      return training;
    };

    it('takes the trainings with it, lets its owner restore exactly those, and hides it meanwhile', async () => {
      const id = await teamProject();
      const training = await seed(id);
      const alone = String((await Training.create({ name: 'Deleted before', uuid: 'before', ownerId: MEMBER, projectId: id, deletedAt: new Date(0) }))._id);
      expect((await call(`/projects/${id}`, { method: 'DELETE', user: MEMBER })).status).toBe(403);
      expect((await call(`/projects/${id}`, { method: 'DELETE', user: ADMIN })).status).toBe(200);
      expect((await call(`/projects/${id}`, { method: 'DELETE', user: ADMIN })).status).toBe(404);
      expect((await call(`/projects/${id}`, { user: ADMIN })).status).toBe(404);
      expect((await call(`/trainings/${training}`)).status).toBe(404);
      expect(await Epoch.countDocuments({ deletedAt: null })).toBe(0);
      expect(await names('/projects')).toEqual([]);

      expect((await call('/projects/trash', { user: MEMBER })).body.data).toEqual([]);
      const trash = (await call('/projects/trash', { user: ADMIN })).body.data;
      expect(trash).toEqual([expect.objectContaining({ _id: id, permissions: expect.objectContaining({ own: false }) })]);
      expect(new Date(trash[0].purgeAt).getTime() - new Date(trash[0].trashedAt).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
      expect((await call('/projects/trash', { user: '' })).status).toBe(401);
      expect((await call(`/projects/${id}/restore`, { method: 'POST', user: ADMIN })).status).toBe(403);
      expect((await call('/projects/not-an-id/restore', { method: 'POST' })).status).toBe(404);

      const restored = await call(`/projects/${id}/restore`, { method: 'POST' });
      expect(restored.body.data.trashedAt).toBeUndefined();
      expect((await Training.findById(training))?.deletedAt).toBeUndefined();
      expect((await Training.findById(alone))?.deletedAt).toEqual(new Date(0));
      expect(await Evaluation.countDocuments({ deletedAt: null })).toBe(1);
      expect((await events()).map(event => event.action)).toEqual(['trash', 'restore']);
    });

    it('deletes for good only from the trash and only for its owner, files first', async () => {
      const id = await teamProject();
      const training = await seed(id);
      await Comparison.create({ uuid: 'c', name: 'C', type: 'trainings', itemIds: [training], projectId: id });
      await Finding.create({ projectId: id, title: 'F', body: 'B', authorKind: 'person', authorLabel: 'Member', authorUserId: MEMBER });
      await Config.create({ config_uuid: 'cfg', summary: 'S', config_data: {}, projectId: id });
      expect((await call(`/projects/${id}/permanent`, { method: 'DELETE' })).status).toBe(404);
      await call(`/projects/${id}`, { method: 'DELETE', user: ADMIN });
      expect((await call(`/projects/${id}/permanent`, { method: 'DELETE', user: ADMIN })).status).toBe(403);

      jest.mocked(deleteFiles).mockRejectedValueOnce(new Error('file-service down'));
      expect((await call(`/projects/${id}/permanent`, { method: 'DELETE' })).status).toBe(500);
      expect(await Training.countDocuments()).toBe(1);

      expect((await call(`/projects/${id}/permanent`, { method: 'DELETE' })).status).toBe(200);
      expect(deleteFiles).toHaveBeenLastCalledWith([`file-${id}`]);
      for (const model of [Project, Training, Epoch, Evaluation, EpochVisualization, Comparison, Finding, Config] as unknown as mongoose.Model<unknown>[]) {
        expect(await model.countDocuments()).toBe(0);
      }
      expect((await events()).at(-1)).toMatchObject({ action: 'purge' });
    });

    it('purges what has waited 30 days: projects with everything in them, and trainings trashed alone', async () => {
      const month = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const expired = await teamProject({ trashedAt: month });
      await seed(expired);
      const live = await teamProject({ name: 'Live' });
      const old = await seed(live);
      const recent = String((await Training.create({ name: 'Recent', uuid: 'recent', projectId: live, deletedAt: new Date() }))._id);
      await Training.updateOne({ _id: old }, { deletedAt: month });
      const waiting = await teamProject({ name: 'Waiting', trashedAt: new Date() });
      const inWaiting = String((await Training.create({ name: 'In waiting', uuid: 'waiting', projectId: waiting, deletedAt: month }))._id);

      expect(await purgeExpiredTrash()).toEqual({ projects: 1, trainings: 1, evaluations: 0 });
      expect(await Project.exists({ _id: expired })).toBeNull();
      expect(await Training.exists({ _id: old })).toBeNull();
      expect(await Training.exists({ _id: recent })).not.toBeNull();
      // Its project decides: it goes when the project does.
      expect(await Training.exists({ _id: inWaiting })).not.toBeNull();
      expect(await Epoch.countDocuments()).toBe(0);
      expect(await purgeExpiredTrash()).toEqual({ projects: 0, trainings: 0, evaluations: 0 });
    });
  });

  describe('comparisons across projects', () => {
    it('are personal, and show only while every project they draw from is readable', async () => {
      const mine = String((await Project.create({ name: 'Mine', owner: { kind: 'user', id: MEMBER }, createdBy: MEMBER }))._id);
      const team = await teamProject();
      const a = String((await Training.create({ name: 'A', uuid: 'a', projectId: mine, ownerId: MEMBER }))._id);
      const b = String((await Training.create({ name: 'B', uuid: 'b', projectId: team, ownerId: MEMBER }))._id);
      const created = await call('/comparisons', { method: 'POST', user: MEMBER, body: { name: 'Across', type: 'trainings', itemIds: [a, b] } });
      expect(created.status).toBe(201);
      const id = created.body.data._id;
      expect((await call('/comparisons', { method: 'POST', user: STRANGER, body: { name: 'Peek', type: 'trainings', itemIds: [a] } })).status).toBe(403);

      expect((await call(`/comparisons/${id}`, { user: MEMBER })).status).toBe(200);
      expect((await call(`/comparisons/${id}`, { user: OWNER })).status).toBe(403);
      expect((await call('/comparisons', { user: OWNER })).body.data.comparisons).toEqual([]);
      expect((await call('/comparisons', { user: MEMBER })).body.data.comparisons).toHaveLength(1);

      // A run purged from under it no longer counts; one in a project they lost does.
      await Training.deleteOne({ _id: a });
      expect((await call(`/comparisons/${id}`, { user: MEMBER })).status).toBe(200);
      delete ROLES[MEMBER];
      expect((await call(`/comparisons/${id}`, { user: MEMBER })).status).toBe(403);
      ROLES[MEMBER] = [{ id: GROUP, name: 'Team', role: 'member' }];
    });
  });
  it('accepts configs only from the training project on create and update', async () => {
    const projectId = await teamProject();
    const otherProject = await teamProject({ name: 'Other project' });
    const config = await Config.create({ projectId: otherProject, config_uuid: 'foreign', summary: 'Secret', config_data: {} });
    const body = { name: 'Run', projectId, configId: String(config._id) };
    expect((await call('/trainings', { method: 'POST', body })).status).toBe(404);
    const created = await call('/trainings', { method: 'POST', body: { name: 'Run', projectId } });
    expect(created.status).toBe(201);
    const path = `/trainings/${created.body.data._id}`;
    expect((await call(path, { method: 'PUT', body: { configId: String(config._id) } })).status).toBe(404);
    await Config.updateOne({ _id: config._id }, { projectId });
    expect((await call(path, { method: 'PUT', body: { configId: String(config._id) } })).status).toBe(200);
  });

  it('refuses orphan writes even to the original uploader', async () => {
    const training = await Training.create({ uuid: 'orphan', name: 'Orphan', ownerId: OWNER });
    expect((await call(`/trainings/${training._id}`, { method: 'PUT', body: { name: 'Changed' } })).status).toBe(403);
  });

});
