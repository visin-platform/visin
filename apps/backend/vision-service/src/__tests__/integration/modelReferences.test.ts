import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Project from '../../models/Project';
import Benchmark from '../../models/Benchmark';
import Config from '../../models/Config';
import Epoch from '../../models/Epoch';
import TestResult from '../../models/TestResult';
import Training from '../../models/Training';
import discoveryRoutes from '../../routes/discoveryRoutes';
import modelRoutes from '../../routes/modelRoutes';
import projectRoutes from '../../routes/projectRoutes';
import trainingRoutes from '../../routes/trainingRoutes';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
const membership = jest.fn();
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  createGroupServiceClient: () => ({ checkMembership: membership, getMyGroups: jest.fn(async () => []) })
}));

const OWNER = '000000000000000000000001';
const ADMIN = '000000000000000000000002';
const MEMBER = '000000000000000000000003';
const STRANGER = '000000000000000000000004';
const GROUP = '0000000000000000000000aa';
const ROLES: Record<string, { id: string; name: string; role: 'owner' | 'admin' | 'member' }[]> = {
  [OWNER]: [{ id: GROUP, name: 'Team', role: 'owner' }],
  [ADMIN]: [{ id: GROUP, name: 'Team', role: 'admin' }],
  [MEMBER]: [{ id: GROUP, name: 'Team', role: 'member' }]
};
const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const OTHER_COMMIT = 'a'.repeat(40);

/**
 * A run can point at a model on the Hugging Face Hub, but only in a project
 * whose storage is set to the Hub: the choice is enforced, not decoration.
 */
describe('Hub model references with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'model-references-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/projects', projectRoutes);
    app.use('/trainings', trainingRoutes);
    app.use('/.well-known', discoveryRoutes);
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
    membership.mockImplementation(async (_group: string, userId: string) => {
      const role = ROLES[userId]?.[0]?.role;
      return role ? { member: true, role } : { member: false, role: null };
    });
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
  const project = async (storage?: { provider: 'visin' | 'hf'; hfNamespace?: string }) =>
    String((await Project.create({ name: 'Team project', owner: { kind: 'group', id: GROUP }, createdBy: OWNER, ...(storage ? { storage } : {}) }))._id);
  const run = async (projectId: string, ownerId = MEMBER) =>
    String((await Training.create({ uuid: `run-${new mongoose.Types.ObjectId()}`, name: 'Run', ownerId, projectId }))._id);
  const link = (trainingId: string, body: unknown, user = MEMBER) => call(`/trainings/${trainingId}/models`, { method: 'POST', user, body });
  const model = { repo: 'acme/clftv2-zod', revision: COMMIT };

  describe('the project storage choice', () => {
    it('defaults to Visin and refuses Hub links until the project is switched', async () => {
      const projectId = await project();
      const trainingId = await run(projectId);
      expect((await call(`/projects/${projectId}`)).body.data.storage).toBeUndefined();
      const refused = await link(trainingId, model);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toMatch(/keeps its files on Visin/);
      expect((await Training.findById(trainingId))?.models).toBeUndefined();

      expect((await project({ provider: 'visin' }).then(id => run(id).then(t => link(t, model)))).status).toBe(409);
    });

    it('is changed by whoever manages the project, and replaces the whole setting', async () => {
      const projectId = await project();
      expect((await call(`/projects/${projectId}`, { method: 'PUT', user: MEMBER, body: { storage: { provider: 'hf' } } })).status).toBe(403);
      const switched = await call(`/projects/${projectId}`, { method: 'PUT', user: ADMIN, body: { storage: { provider: 'hf', hfNamespace: 'acme' } } });
      expect(switched.status).toBe(200);
      expect(switched.body.data.storage).toEqual({ provider: 'hf', hfNamespace: 'acme' });
      expect((await call(`/projects/${projectId}`, { method: 'PUT', user: ADMIN, body: { storage: { provider: 'hf' } } })).body.data.storage).toEqual({ provider: 'hf' });
      expect((await call(`/projects/${projectId}`, { method: 'PUT', user: ADMIN, body: { name: 'Renamed' } })).body.data.storage).toEqual({ provider: 'hf' });
      expect((await call(`/projects/${projectId}`, { method: 'PUT', user: ADMIN, body: { storage: { provider: 's3' } } })).status).toBe(400);
      expect((await call(`/projects/${projectId}`, { method: 'PUT', user: ADMIN, body: { storage: { provider: 'hf', hfNamespace: 'no/slash' } } })).status).toBe(400);
    });

    it('saves the stall timeout on create and update', async () => {
      const created = await call('/projects', { method: 'POST', user: OWNER, body: { name: 'Timed', stallAfterMinutes: 90 } });
      expect(created.body.data.stallAfterMinutes).toBe(90);
      const updated = await call(`/projects/${created.body.data._id}`, { method: 'PUT', user: OWNER, body: { stallAfterMinutes: 15 } });
      expect(updated.body.data.stallAfterMinutes).toBe(15);
    });

    it('can be chosen when the project is created', async () => {
      const created = await call('/projects', { method: 'POST', user: OWNER, body: { name: 'Hub project', storage: { provider: 'hf', hfNamespace: 'acme' } } });
      expect(created.status).toBe(201);
      expect(created.body.data.storage).toEqual({ provider: 'hf', hfNamespace: 'acme' });
    });
  });

  describe('linking a model to a run', () => {
    it('pins the repo to a commit and shows it with the run', async () => {
      const projectId = await project({ provider: 'hf' });
      const trainingId = await run(projectId);
      const created = await link(trainingId, { ...model, revision: COMMIT.toUpperCase(), path: 'checkpoints/best.safetensors', epoch: 12 });
      expect(created.status).toBe(201);
      expect(created.body.data).toHaveLength(1);
      expect(created.body.data[0]).toMatchObject({ provider: 'hf', kind: 'model', repo: 'acme/clftv2-zod', revision: COMMIT, path: 'checkpoints/best.safetensors', epoch: 12 });
      expect((await call(`/trainings/${trainingId}`)).body.data.models).toMatchObject([{ repo: 'acme/clftv2-zod', revision: COMMIT }]);
      expect((await call(`/trainings/${trainingId}/epochs`)).body.data.training.models).toHaveLength(1);
    });

    it('is safe to retry, even at the same moment, and keeps distinct commits and paths apart', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      const replies = await Promise.all([1, 2, 3, 4].map(() => link(trainingId, model)));
      expect(replies.filter(reply => reply.status === 201)).toHaveLength(1);
      expect(replies.filter(reply => reply.status === 200)).toHaveLength(3);
      expect((await link(trainingId, model)).body.data).toHaveLength(1);
      expect((await link(trainingId, { ...model, revision: OTHER_COMMIT })).status).toBe(201);
      expect((await link(trainingId, { ...model, path: 'onnx/model.onnx' })).status).toBe(201);
      expect((await Training.findById(trainingId))?.models).toHaveLength(3);
    });

    it('refuses what is not a commit-pinned Hub model', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      for (const body of [
        { ...model, revision: 'main' },
        { ...model, revision: COMMIT.slice(0, 7) },
        { ...model, repo: 'not-a-repo-id' },
        { ...model, repo: 'acme/../etc' },
        { ...model, path: '../escape' },
        { ...model, path: '/absolute' },
        { ...model, provider: 'url' },
        { ...model, kind: 'dataset' },
        { ...model, epoch: -1 },
        { repo: model.repo }
      ]) expect((await link(trainingId, body)).status).toBe(400);
      expect((await Training.findById(trainingId))?.models).toBeUndefined();
    });

    it('caps the links a run can carry, without refusing a repeat of one it has', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      await Training.updateOne({ _id: trainingId }, { models: Array.from({ length: 50 }, (_, index) => ({ provider: 'hf', kind: 'model', repo: 'acme/m', revision: index.toString(16).padStart(40, '0') })) });
      expect((await link(trainingId, model)).status).toBe(400);
      expect((await link(trainingId, { repo: 'acme/m', revision: '0'.repeat(40) })).status).toBe(200);
    });

    it('needs write access: a member links their own runs, an outsider none', async () => {
      const projectId = await project({ provider: 'hf' });
      const mine = await run(projectId, MEMBER);
      const theirs = await run(projectId, OWNER);
      expect((await link(mine, model, MEMBER)).status).toBe(201);
      expect((await link(theirs, model, MEMBER)).status).toBe(403);
      expect((await link(theirs, model, ADMIN)).status).toBe(201);
      expect((await link(mine, model, STRANGER)).status).toBe(403);
      expect((await link(mine, model, '')).status).toBe(401);
    });

    it('reports a run deleted while the link was being made', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      const lookup = Project.findById.bind(Project);
      jest.spyOn(Project, 'findById').mockImplementationOnce((async (id: unknown) => {
        await Training.updateOne({ _id: trainingId }, { deletedAt: new Date() });
        return lookup(id);
      }) as never);
      expect((await link(trainingId, model)).status).toBe(404);
    });

    it('rejects a run that is missing, malformed or in the trash', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      expect((await link('not-an-id', model)).status).toBe(400);
      expect((await link('000000000000000000000abc', model)).status).toBe(404);
      await Training.updateOne({ _id: trainingId }, { deletedAt: new Date() });
      expect((await link(trainingId, model)).status).toBe(404);
    });
  });

  describe('the model card', () => {
    const card = (trainingId: string, query = '', user = MEMBER) => call(`/trainings/${trainingId}/model-card${query}`, { user });
    const seed = async (taxonomy?: Record<string, unknown>) => {
      const projectId = await project({ provider: 'hf' });
      if (taxonomy) await Project.updateOne({ _id: projectId }, { taxonomy });
      const trainingId = await run(projectId);
      await Training.updateOne({ _id: trainingId }, { description: 'Fusion of camera and lidar.', dataset: { source: 'visin', id: 'd1', name: 'ZOD | frames', revision: 'rev-1' } });
      for (const [number, mean_iou, loss] of [[1, 0.4, 0.9], [2, 0.6, 0.5], [3, 0.55, 0.45]] as const) {
        await Epoch.create({ trainingId, training_uuid: 'u', epoch_uuid: `e${number}`, epoch: number, timestamp: new Date(), results: { val: { mean_iou, loss, vehicle: { iou: 0.1 } }, train: { loss: loss + 0.1 }, system_info: { cpu: 8 } } });
      }
      await TestResult.create({ trainingId, epoch: 2, epoch_uuid: 'e2', test_uuid: 't1', timestamp: new Date(), test_results: { day: { overall: { iou: 0.71234, f1: 0.8 }, vehicle: { iou: 0.2 } }, night: { overall: { iou: 0.5 } } } });
      await Benchmark.create({ training_id: trainingId, epoch: 2, timestamp: new Date(), system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 }, results: [{ device: 'cuda', fps: 119.04, mean_time_ms: 8.4, total_parameters: 4_500_000 }] });
      return trainingId;
    };

    it('writes the Hub front matter and a readable summary from what the run recorded', async () => {
      const trainingId = await seed({ taskType: 'segmentation' });
      const response = await card(trainingId, '?repo=acme/clftv2-zod&epoch=2');
      expect(response.status).toBe(200);
      const readme: string = response.body.data.readme;
      expect(readme.startsWith('---\nlibrary_name: visin-trained\ntags:\n  - visin\n  - image-segmentation\nmodel-index:')).toBe(true);
      expect(readme).toContain('  - name: "clftv2-zod"');
      expect(readme).toContain('type: "image-segmentation"');
      expect(readme).toContain('          - type: "val.mean_iou"\n            value: 0.6\n            name: "val.mean_iou"');
      expect(readme).not.toContain('val.vehicle.iou');
      expect(readme).not.toContain('system_info');
      expect(readme).toContain('# clftv2-zod');
      expect(readme).toContain('Fusion of camera and lidar.');
      expect(readme).toContain('| This checkpoint | epoch 2 (the epoch asked for) |');
      expect(readme).toContain('| Epochs reported | 3 |');
      expect(readme).toContain('| Dataset | ZOD \\| frames @ rev-1 |');
      expect(readme).toContain('## Results at epoch 2');
      expect(readme).toContain('| val.mean_iou | 0.6 |');
      expect(readme).toContain('| Condition | f1 | iou |');
      expect(readme).toContain('| day | 0.8 | 0.7123 |');
      expect(readme).toContain('| night | - | 0.5 |');
      expect(readme).toContain('| cuda | 119 | 8.4 | 4.5 |');
    });

    it('takes the epoch where the run did best when none is named, says why, and leaves out the model-index without a known task', async () => {
      const trainingId = await seed();
      const readme: string = (await card(trainingId)).body.data.readme;
      expect(readme.startsWith('---\nlibrary_name: visin-trained\ntags:\n  - visin\n---')).toBe(true);
      // Epoch 3 is the last, but epoch 2 reached the highest validation mIoU.
      expect(readme).toContain('| This checkpoint | epoch 2 (best val.mean_iou) |');
      expect(readme).toContain('## Results at epoch 2');
      expect(readme).toContain('| val.mean_iou | 0.6 |');
      expect(readme).toContain('## Test results');
      expect(readme).toContain('# Run');
    });

    it('picks the best epoch by the project’s own result and direction, and the last epoch when nothing can be ranked', async () => {
      const trainingId = await seed({ primaryMetric: 'val.loss', metrics: [{ key: 'loss', direction: 'lower' }] });
      const byLoss: string = (await card(trainingId)).body.data.readme;
      expect(byLoss).toContain('| This checkpoint | epoch 3 (best val.loss) |');

      const projectId = await project({ provider: 'hf' });
      const plain = await run(projectId);
      for (const number of [1, 2]) {
        await Epoch.create({ trainingId: plain, training_uuid: 'u', epoch_uuid: `p${number}`, epoch: number, timestamp: new Date(), results: { weld: { quality: number } } });
      }
      const unranked: string = (await card(plain)).body.data.readme;
      expect(unranked).toContain('| This checkpoint | epoch 2 (the last epoch, as the run reports no result to pick the best by) |');
      expect((await card(trainingId, '?epoch=1')).body.data.readme).toContain('| This checkpoint | epoch 1 (the epoch asked for) |');
    });

    it('does not publish the learning rate as a score when a pipeline logs it beside its blocks', async () => {
      const projectId = await project({ provider: 'hf' });
      await Project.updateOne({ _id: projectId }, { taxonomy: { taskType: 'segmentation' } });
      const trainingId = await run(projectId);
      await Epoch.create({ trainingId, training_uuid: 'u', epoch_uuid: 'e1', epoch: 1, timestamp: new Date(), results: { lr: 0.0001, val: { mean_iou: 0.7 } } });
      const readme: string = (await card(trainingId)).body.data.readme;
      expect(readme).toContain('- type: "val.mean_iou"');
      expect(readme).not.toContain('"lr"');
    });

    it('is written for a run with nothing reported yet', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      const readme: string = (await card(trainingId)).body.data.readme;
      expect(readme).toContain('| Epochs reported | 0 |');
      expect(readme).not.toContain('## Results');
    });

    it('falls back where the run recorded little: no dataset, a config summary, odd benchmark and test shapes', async () => {
      const projectId = await project({ provider: 'hf' });
      await Project.updateOne({ _id: projectId }, { taxonomy: { taskType: 'detection' } });
      const config = await Config.create({ config_uuid: 'c1', summary: 'Baseline | lr 1e-4', config_data: { secret: 'hunter2' }, projectId });
      const trainingId = await run(projectId, MEMBER);
      await Training.updateOne({ _id: trainingId }, { configId: String(config._id), datasetId: 'local-set', name: 'Plain run' });
      await Epoch.create({ trainingId, training_uuid: 'u', epoch_uuid: 'e1', epoch: 1, timestamp: new Date(), results: { note: 'only text' } });
      await TestResult.create({ trainingId, epoch: 1, epoch_uuid: 'e1', test_uuid: 't1', timestamp: new Date(), test_results: { day: { vehicle: { iou: 0.2 } }, dusk: { overall: { note: 'text' } }, ...Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`c${i}`, { overall: { iou: 0.5 } }])) } });
      await Benchmark.create({ training_id: trainingId, timestamp: new Date(), system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 }, results: [{ device_type: 'cpu', fps: 'fast', total_parameters_m: 2.5 }, { device: 'cuda', mean_time_ms: 5 }] });
      const readme: string = (await card(trainingId, '?epoch=1')).body.data.readme;
      expect(readme).toContain('| Dataset | local-set |');
      expect(readme).toContain('| Configuration | Baseline \\| lr 1e-4 |');
      expect(readme).not.toContain('hunter2');
      expect(readme).not.toContain('model-index');
      expect(readme).not.toContain('## Results');
      expect(readme).toContain('| cpu | - | - | 2.5 |');
      expect(readme).toContain('| cuda | - | 5 | - |');
      expect(readme.match(/^\| c\d+ \|/gm)).toHaveLength(12);
      expect(readme).not.toContain('| day |');
      expect(readme).not.toContain('| dusk |');
    });

    it('says so when the run has no dataset at all, and describes nothing it did not record', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      const readme: string = (await card(trainingId)).body.data.readme;
      expect(readme).toContain('| Dataset | not recorded |');
      expect(readme).not.toContain('## Speed');
    });

    it('needs read access, and a real run and epoch', async () => {
      const trainingId = await seed();
      expect((await card(trainingId, '', STRANGER)).status).toBe(403);
      expect((await card(trainingId, '?epoch=99')).status).toBe(404);
      expect((await card('000000000000000000000abc')).status).toBe(404);
      expect((await card(trainingId, '?repo=not-a-repo')).status).toBe(400);
      expect((await card(trainingId, '?epoch=-1')).status).toBe(400);
    });
  });

  describe('the demo Space of a model', () => {
    const demo = (trainingId: string, modelId: string, space: unknown, user = MEMBER) =>
      call(`/trainings/${trainingId}/models/${modelId}`, { method: 'PATCH', user, body: { space } });
    const linked = async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      const [first] = (await link(trainingId, model)).body.data;
      return { trainingId, modelId: first._id as string };
    };

    it('is linked and unlinked, and comes back with the run and the registry', async () => {
      const { trainingId, modelId } = await linked();
      const set = await demo(trainingId, modelId, 'acme/clftv2-zod-demo');
      expect(set.status).toBe(200);
      expect(set.body.data).toMatchObject([{ _id: modelId, space: 'acme/clftv2-zod-demo' }]);
      expect((await call(`/trainings/${trainingId}`)).body.data.models[0].space).toBe('acme/clftv2-zod-demo');
      const cleared = await demo(trainingId, modelId, null);
      expect(cleared.body.data[0]).not.toHaveProperty('space');
    });

    it('takes only a Hub id, for a model of the run, from someone who may write to it', async () => {
      const { trainingId, modelId } = await linked();
      expect((await demo(trainingId, modelId, 'not-an-id')).status).toBe(400);
      expect((await demo(trainingId, modelId, 'https://evil.example/space')).status).toBe(400);
      expect((await demo(trainingId, modelId, undefined)).status).toBe(400);
      expect((await demo(trainingId, '000000000000000000000abc', 'acme/demo')).status).toBe(404);
      expect((await demo(trainingId, 'nope', 'acme/demo')).status).toBe(400);
      expect((await demo(trainingId, modelId, 'acme/demo', STRANGER)).status).toBe(403);
      expect((await demo(trainingId, modelId, 'acme/demo', '')).status).toBe(401);
      expect((await Training.findById(trainingId))?.models?.[0].space).toBeUndefined();
    });
  });

  describe('the run summary', () => {
    const summary = (trainingId: string, user = MEMBER) => call(`/trainings/${trainingId}/summary`, { user });
    const epoch = (trainingId: string, number: number, results: Record<string, unknown>) =>
      Epoch.create({ trainingId, training_uuid: 'u', epoch_uuid: `e-${trainingId}-${number}`, epoch: number, timestamp: new Date(), results });

    it('gives the best epoch beside the last for each result, in the direction that makes it better', async () => {
      const projectId = await project({ provider: 'hf' });
      const trainingId = await run(projectId);
      await Training.updateOne({ _id: trainingId }, { datasetId: 'zod', status: 'completed', configId: 'c1', models: [{ provider: 'hf', kind: 'model', repo: 'acme/m', revision: COMMIT }] });
      await epoch(trainingId, 1, { val: { mean_iou: 0.4, loss: 0.9, vehicle: { iou: 0.1 } }, system_info: { cpu: 8 } });
      await epoch(trainingId, 2, { val: { mean_iou: 0.7, loss: 0.5 } });
      await epoch(trainingId, 3, { val: { mean_iou: 0.6, loss: 0.2 } });
      const { status, body } = await summary(trainingId);
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ epochCount: 3, lastEpoch: 3, training: { status: 'completed', datasetId: 'zod', configId: 'c1' }, models: [{ repo: 'acme/m' }] });
      expect(body.data.metrics).toEqual([
        { path: 'val.loss', direction: 'lower', directionFrom: 'default', best: { value: 0.2, epoch: 3 }, last: { value: 0.2, epoch: 3 } },
        { path: 'val.mean_iou', direction: 'higher', directionFrom: 'default', best: { value: 0.7, epoch: 2 }, last: { value: 0.6, epoch: 3 } }
      ]);
      expect(body.data).not.toHaveProperty('provenance');
    });

    it('lists the validation results of a run that also logs a bare number beside its blocks', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      await epoch(trainingId, 1, { lr: 0.001, epoch_time_s: 30, train: { loss: 0.9 }, val: { loss: 0.8, mean_iou: 0.4 } });
      await epoch(trainingId, 2, { lr: 0.0005, epoch_time_s: 31, train: { loss: 0.5 }, val: { loss: 0.6, mean_iou: 0.6 } });
      const { body } = await summary(trainingId);
      expect(body.data.metrics.map((metric: { path: string }) => metric.path)).toEqual(['train.loss', 'val.loss', 'val.mean_iou']);
      expect(body.data.metrics[2]).toMatchObject({ best: { value: 0.6, epoch: 2 } });
    });

    it('lets the project say which way a result is better, by leaf name or full path', async () => {
      const projectId = await project({ provider: 'hf' });
      await Project.updateOne({ _id: projectId }, { taxonomy: { metrics: [{ key: 'mean_iou', direction: 'lower' }, { key: 'val.score', direction: 'higher' }] } });
      const trainingId = await run(projectId);
      await epoch(trainingId, 1, { val: { mean_iou: 0.4, score: 1, flops: 9 } });
      await epoch(trainingId, 2, { val: { mean_iou: 0.7, score: 3, flops: 4 } });
      const byPath = Object.fromEntries((await summary(trainingId)).body.data.metrics.map((m: { path: string }) => [m.path, m]));
      expect(byPath['val.mean_iou']).toMatchObject({ direction: 'lower', directionFrom: 'taxonomy', best: { epoch: 1 } });
      expect(byPath['val.score']).toMatchObject({ direction: 'higher', directionFrom: 'taxonomy', best: { epoch: 2 } });
      expect(byPath['val.flops']).toMatchObject({ direction: 'higher', directionFrom: 'default' });
    });

    it('is empty, not an error, for a run that has reported nothing', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      expect((await summary(trainingId)).body.data).toMatchObject({ epochCount: 0, lastEpoch: null, metrics: [] });
    });

    it('prefers a full-path direction over the leaf default regardless of row order', async () => {
      const projectId = await project({ provider: 'hf' });
      await Project.updateOne({ _id: projectId }, { taxonomy: { metrics: [{ key: 'score', direction: 'higher' }, { key: 'val.score', direction: 'lower' }] } });
      const trainingId = await run(projectId);
      await epoch(trainingId, 1, { val: { score: 0.2 }, train: { score: 0.2 } });
      await epoch(trainingId, 2, { val: { score: 0.8 }, train: { score: 0.8 } });
      const { body } = await summary(trainingId);
      expect(body.data.metrics).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'val.score', direction: 'lower', best: { epoch: 1, value: 0.2 } }),
        expect.objectContaining({ path: 'train.score', direction: 'higher', best: { epoch: 2, value: 0.8 } })
      ]));
    });

    it('reads the same epochs when the training ID is written in uppercase', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      await epoch(trainingId, 1, { val: { loss: 0.4 } });
      const { status, body } = await summary(trainingId.toUpperCase());
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ epochCount: 1, lastEpoch: 1, metrics: [expect.objectContaining({ path: 'val.loss' })] });
      const card = await call(`/trainings/${trainingId.toUpperCase()}/model-card?epoch=1`);
      expect(card.status).toBe(200);
      expect(card.body.data.readme).toContain('## Results at epoch 1');
    });

    it('caps the metrics it carries', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      await epoch(trainingId, 1, { val: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`m${i}`, i])) });
      await epoch(trainingId, 2, { val: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`m${i}`, i + 1])) });
      expect((await summary(trainingId)).body.data.metrics).toHaveLength(60);
    });

    it('needs read access to the run, and a run', async () => {
      const trainingId = await run(await project({ provider: 'hf' }));
      expect((await summary(trainingId, STRANGER)).status).toBe(403);
      expect((await summary('000000000000000000000abc')).status).toBe(404);
    });
  });

  describe('run notes', () => {
    const create = async (body: Record<string, unknown>) =>
      call('/trainings', { method: 'POST', user: OWNER, body: { name: 'Noted', projectId: await project({ provider: 'hf' }), ...body } });

    it('are the researcher’s own text, trimmed, changed by whoever may write, and removed when emptied', async () => {
      const created = await create({ notes: '  used the relabelled night set  ' });
      expect(created.body.data.notes).toBe('used the relabelled night set');
      const id = created.body.data._id;
      expect((await call(`/trainings/${id}`, { method: 'PUT', user: OWNER, body: { notes: 'reran with seed 2' } })).body.data.notes).toBe('reran with seed 2');
      expect((await call(`/trainings/${id}`, { method: 'PUT', user: OWNER, body: { name: 'Renamed' } })).body.data.notes).toBe('reran with seed 2');
      const cleared = await call(`/trainings/${id}`, { method: 'PUT', user: OWNER, body: { notes: '   ' } });
      expect(cleared.body.data).not.toHaveProperty('notes');
      expect((await call(`/trainings/${id}`, { method: 'PUT', user: STRANGER, body: { notes: 'mine' } })).status).toBe(403);
    });

    it('are limited to five thousand characters, and absent from a run that has none', async () => {
      const created = await create({});
      expect(created.body.data).not.toHaveProperty('notes');
      expect((await call(`/trainings/${created.body.data._id}`, { method: 'PUT', user: OWNER, body: { notes: 'x'.repeat(5001) } })).status).toBe(400);
      expect((await call(`/trainings/${created.body.data._id}`, { method: 'PUT', user: OWNER, body: { notes: 'x'.repeat(5000) } })).status).toBe(200);
    });
  });

  describe('provenance', () => {
    const provenance = {
      git: { commit: 'a'.repeat(40), branch: 'main', dirty: true, remote: 'https://ghp_secret123@github.com/acme/fusion.git' },
      command: 'python -m visin_fusion.engine.stages.train -c cfg.json',
      packages: { torch: '2.5.0', visin: '0.7.0' },
      host: { hostname: 'gpu-3', platform: 'Linux-6.8', python: '3.12.1', cuda: '12.4' },
      invented: 'dropped'
    };
    const create = async (body: Record<string, unknown>) =>
      call('/trainings', { method: 'POST', user: OWNER, body: { name: 'Prov', projectId: await project({ provider: 'hf' }), ...body } });

    it('records what the run started from, without credentials or unknown fields, and returns it in the summary', async () => {
      const created = await create({ provenance });
      expect(created.status).toBe(201);
      expect(created.body.data.provenance).toEqual({
        git: { commit: 'a'.repeat(40), branch: 'main', dirty: true, remote: 'https://github.com/acme/fusion.git' },
        command: provenance.command,
        packages: provenance.packages,
        host: provenance.host
      });
      expect((await call(`/trainings/${created.body.data._id}/summary`, { user: OWNER })).body.data.provenance.git.commit).toBe('a'.repeat(40));
    });

    it('can be set later, and is refused when it is not a commit or has too many packages', async () => {
      const created = await create({});
      const id = created.body.data._id;
      expect(created.body.data).not.toHaveProperty('provenance');
      expect((await call(`/trainings/${id}`, { method: 'PUT', user: OWNER, body: { provenance: { git: { commit: 'a1b2c3d' } } } })).body.data.provenance).toEqual({ git: { commit: 'a1b2c3d' } });
      expect((await call(`/trainings/${id}`, { method: 'PUT', user: OWNER, body: { provenance: { git: { commit: 'main' } } } })).status).toBe(400);
      const many = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`p${i}`, '1']));
      expect((await call(`/trainings/${id}`, { method: 'PUT', user: OWNER, body: { provenance: { packages: many } } })).status).toBe(400);
    });
  });

  describe('discovery', () => {
    it('answers anyone, naming a browser session and an anonymous caller', async () => {
      expect((await call('/.well-known/visin')).body.data).toEqual({ credential: { kind: 'session' } });
      expect((await call('/.well-known/visin', { user: '' })).body.data).toEqual({ credential: { kind: 'anonymous' } });
    });
  });

  describe('unlinking a model', () => {
    it('removes one link, still allowed after the project goes back to Visin', async () => {
      const projectId = await project({ provider: 'hf' });
      const trainingId = await run(projectId);
      await link(trainingId, { ...model, path: 'a' });
      const [first, second] = (await link(trainingId, { ...model, path: 'b' })).body.data;
      await Project.updateOne({ _id: projectId }, { storage: { provider: 'visin' } });
      const removed = await call(`/trainings/${trainingId}/models/${first._id}`, { method: 'DELETE', user: MEMBER });
      expect(removed.status).toBe(200);
      expect(removed.body.data).toMatchObject([{ _id: second._id, path: 'b' }]);
      expect((await call(`/trainings/${trainingId}/models/${first._id}`, { method: 'DELETE', user: MEMBER })).status).toBe(404);
      expect((await call(`/trainings/${trainingId}/models/nope`, { method: 'DELETE', user: MEMBER })).status).toBe(400);
      expect((await call(`/trainings/${trainingId}/models/${second._id}`, { method: 'DELETE', user: STRANGER })).status).toBe(403);
    });
  });
});

describe('the model registry with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'model-registry-test-secret';
  const previousSecret = process.env.JWT_SECRET;
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/models', modelRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);
  beforeEach(async () => {
    const ids = [OWNER, STRANGER].map(id => new mongoose.Types.ObjectId(id));
    await mongoose.connection.collection('users').insertMany(ids.map(_id => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection.collection('user_sessions').insertMany(ids.map(_id => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    jest.mocked(getUserGroups).mockResolvedValue([]);
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
  const list = async (query = '', user: string | '' = OWNER): Promise<{ status: number; data: any; message?: string }> => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: user, email: `${user}@example.test`, tokenVersion: 1, sid: user, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}/models${query}`, { headers: user ? { Authorization: `Bearer ${token}` } : {} });
    const body = await response.json() as { data?: unknown; message?: string };
    return { status: response.status, data: body.data, message: body.message };
  };
  const project = async (fields: Record<string, unknown> = {}) =>
    String((await Project.create({ name: 'Road', slug: `road-${new mongoose.Types.ObjectId()}`, owner: { kind: 'user', id: OWNER }, createdBy: OWNER, ...fields }))._id);
  const run = async (projectId: string, name: string, models: { repo: string; revision?: string; addedAt?: Date }[], extra: Record<string, unknown> = {}) => {
    const training = await Training.create({
      uuid: `run-${new mongoose.Types.ObjectId()}`, name, ownerId: OWNER, projectId, ...extra,
      models: models.map(model => ({ provider: 'hf', kind: 'model', revision: A, ...model }))
    });
    return String(training._id);
  };
  const epoch = (trainingId: string, number: number, results: Record<string, unknown>) =>
    Epoch.create({ trainingId, training_uuid: 'u', epoch_uuid: `e-${trainingId}-${number}`, epoch: number, timestamp: new Date(), results });
  const repos = (data: { models: { model: { repo: string } }[] }) => data.models.map(row => row.model.repo);

  it('lists the models on runs the caller can see, newest link first, and nothing else', async () => {
    const mine = await project();
    const hidden = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER });
    const open = await project({ owner: { kind: 'user', id: STRANGER }, createdBy: STRANGER, visibility: 'public' });
    await run(mine, 'old', [{ repo: 'acme/old', addedAt: new Date('2026-01-01') }]);
    await run(mine, 'new', [{ repo: 'acme/new', addedAt: new Date('2026-03-01') }, { repo: 'acme/newer', addedAt: new Date('2026-04-01') }]);
    await run(mine, 'no models', []);
    await run(hidden, 'private', [{ repo: 'secret/model' }]);
    await run(open, 'public', [{ repo: 'open/model', addedAt: new Date('2026-02-01') }]);
    await run(mine, 'trashed', [{ repo: 'acme/trashed' }], { deletedAt: new Date() });

    const mineAndPublic = await list();
    expect(repos(mineAndPublic.data)).toEqual(['acme/newer', 'acme/new', 'open/model', 'acme/old']);
    expect(mineAndPublic.data.pagination).toMatchObject({ total: 4, pages: 1 });
    expect(mineAndPublic.data.models[0]).toMatchObject({ training: { name: 'new', status: 'pending' }, project: { name: 'Road' }, model: { revision: A } });
    expect(repos((await list('', '')).data)).toEqual(['open/model']);
    expect(repos((await list('', STRANGER)).data)).toEqual(['secret/model', 'open/model']);
  });

  it('narrows to a project by slug or id, and says when it may not be seen', async () => {
    const first = await project({ slug: 'first' });
    const second = await project({ slug: 'second' });
    await run(first, 'a', [{ repo: 'acme/a' }]);
    await run(second, 'b', [{ repo: 'acme/b' }]);
    expect(repos((await list('?projectId=first')).data)).toEqual(['acme/a']);
    expect(repos((await list(`?projectId=${second}`)).data)).toEqual(['acme/b']);
    expect((await list('?projectId=nope')).status).toBe(404);
    expect((await list('?projectId=first', STRANGER)).status).toBe(403);
  });

  it('filters by the dataset a run trained on and by a search of run name or repo', async () => {
    const id = await project();
    await run(id, 'zod baseline', [{ repo: 'acme/clft' }], { datasetId: 'zod-1' });
    await run(id, 'waymo', [{ repo: 'acme/other' }], { dataset: { source: 'visin', id: 'zod-1', name: 'ZOD' } });
    await run(id, 'elsewhere', [{ repo: 'acme/cnn' }], { datasetId: 'waymo-9' });
    expect((await list('?datasetId=zod-1')).data.models).toHaveLength(2);
    expect(repos((await list('?search=BASELINE')).data)).toEqual(['acme/clft']);
    expect(repos((await list('?search=acme/cnn')).data)).toEqual(['acme/cnn']);
    expect((await list('?search=(')).data.models).toEqual([]);
  });

  it('ranks by the best value each run reached, in the direction asked, runs without it last', async () => {
    const id = await project();
    const low = await run(id, 'low', [{ repo: 'acme/low' }]);
    const high = await run(id, 'high', [{ repo: 'acme/high' }]);
    await run(id, 'silent', [{ repo: 'acme/silent' }]);
    await epoch(low, 1, { val: { mean_iou: 0.4, loss: 0.9 } });
    await epoch(low, 2, { val: { mean_iou: 0.5, loss: 0.7 } });
    await epoch(low, 3, { val: { mean_iou: 0.45, loss: 0.8 } });
    await epoch(high, 1, { val: { mean_iou: 0.7, loss: 0.3 } });
    await epoch(high, 2, { val: { mean_iou: 'n/a', loss: 0.2 } });

    const best = await list('?metric=val.mean_iou&sortBy=best');
    expect(repos(best.data)).toEqual(['acme/high', 'acme/low', 'acme/silent']);
    expect(best.data.models[0].best).toEqual({ metric: 'val.mean_iou', direction: 'max', value: 0.7, epoch: 1 });
    expect(best.data.models[1].best).toMatchObject({ value: 0.5, epoch: 2 });
    expect(best.data.models[2]).not.toHaveProperty('best');

    const smallest = await list('?metric=val.loss&direction=min&sortBy=best&order=asc');
    expect(repos(smallest.data)).toEqual(['acme/high', 'acme/low', 'acme/silent']);
    expect(smallest.data.models[0].best).toMatchObject({ value: 0.2, epoch: 2 });
    const reversed = await list('?metric=val.loss&direction=min&sortBy=best&order=desc');
    expect(repos(reversed.data)).toEqual(['acme/low', 'acme/high', 'acme/silent']);
  });

  it('ranks on a result named with a dot or punctuation, and on one that sits beside a bare number', async () => {
    const id = await project();
    const low = await run(id, 'low', [{ repo: 'acme/low' }]);
    const high = await run(id, 'high', [{ repo: 'acme/high' }]);
    await epoch(low, 1, { lr: 0.1, val: { 'map_0.5': 0.3 }, 'metrics/mAP50-95(B)': 0.2 });
    await epoch(high, 1, { lr: 0.1, val: { 'map_0.5': 0.6 }, 'metrics/mAP50-95(B)': 0.5 });

    const dotted = await list('?metric=val.map_0.5&sortBy=best');
    expect(repos(dotted.data)).toEqual(['acme/high', 'acme/low']);
    expect(dotted.data.models[0].best).toMatchObject({ metric: 'val.map_0.5', value: 0.6 });

    const punctuated = await list(`?metric=${encodeURIComponent('metrics/mAP50-95(B)')}&sortBy=best`);
    expect(punctuated.status).toBe(200);
    expect(punctuated.data.models[0].best).toMatchObject({ value: 0.5 });

    // A name that looks like a Mongo operator is only a key nobody reported.
    const operator = await list(`?metric=${encodeURIComponent('$where')}&sortBy=best`);
    expect(operator.status).toBe(400);
  });

  it('shows a run once per model and pages the rows', async () => {
    const id = await project();
    await run(id, 'two', [{ repo: 'acme/a', revision: A, addedAt: new Date('2026-01-01') }, { repo: 'acme/a', revision: B, addedAt: new Date('2026-02-01') }]);
    await run(id, 'one', [{ repo: 'acme/c', addedAt: new Date('2026-03-01') }]);
    const first = await list('?limit=2');
    expect(first.data.models.map((row: { model: { revision: string } }) => row.model.revision)).toEqual([A, B]);
    expect(first.data.pagination).toEqual({ page: 1, limit: 2, total: 3, pages: 2 });
    expect((await list('?limit=2&page=2')).data.models).toHaveLength(1);
  });

  it('refuses a metric that is not a result name and a ranking with nothing to rank by', async () => {
    expect((await list('?metric=%24where')).status).toBe(400);
    expect((await list('?metric=a%3Bb')).status).toBe(400);
    expect((await list('?sortBy=best')).status).toBe(400);
    expect((await list('?direction=up')).status).toBe(400);
    expect((await list('?limit=1000')).status).toBe(400);
  });
});
