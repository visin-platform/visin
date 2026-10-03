import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import { inflateRawSync } from 'zlib';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Comparison from '../../models/Comparison';
import Epoch from '../../models/Epoch';
import Project from '../../models/Project';
import Training from '../../models/Training';
import comparisonRoutes from '../../routes/comparisonRoutes';

jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));

const OWNER = '000000000000000000000001';
const STRANGER = '000000000000000000000004';
const BOM = String.fromCharCode(0xfeff);

/** A comparison of runs can be taken to a spreadsheet, from the API, by whoever may read it. */
describe('comparison export with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'comparison-export-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.3.9' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/comparisons', comparisonRoutes);
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

  const get = async (path: string, user: string | '' = OWNER) => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: user, email: `${user}@example.test`, tokenVersion: 1, sid: user, typ: 'session', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}${path}`, { headers: user ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()) };
  };
  const text = (buffer: Buffer) => buffer.toString('utf8');

  const project = async (fields: Record<string, unknown> = {}) =>
    String((await Project.create({ name: 'Road', owner: { kind: 'user', id: OWNER }, createdBy: OWNER, ...fields }))._id);
  const run = async (projectId: string, name: string, scores: { iou: number; loss: number }[], extra: Record<string, unknown> = {}) => {
    const training = await Training.create({ uuid: `run-${new mongoose.Types.ObjectId()}`, name, ownerId: OWNER, projectId, status: 'completed', ...extra });
    for (const [index, score] of scores.entries()) {
      await Epoch.create({ trainingId: String(training._id), training_uuid: 'u', epoch_uuid: `e-${training._id}-${index}`, epoch: index + 1, timestamp: new Date(), results: { val: { mean_iou: score.iou, loss: score.loss } } });
    }
    return String(training._id);
  };
  const compare = async (itemIds: string[], fields: Record<string, unknown> = {}) =>
    String((await Comparison.create({ uuid: `c-${new mongoose.Types.ObjectId()}`, name: 'ZOD baselines', type: 'trainings', itemIds, ownerId: OWNER, ...fields }))._id);

  it('is a CSV with one row per run: best epoch beside last for every result, and which way each was read', async () => {
    const projectId = await project();
    await Project.updateOne({ _id: projectId }, { taxonomy: { metrics: [{ key: 'mean_iou', direction: 'higher' }] } });
    const first = await run(projectId, 'clft, v2', [{ iou: 0.4, loss: 0.9 }, { iou: 0.7, loss: 0.5 }, { iou: 0.6, loss: 0.2 }], { datasetId: 'zod' });
    await Training.updateOne({ _id: first }, { models: [{ provider: 'hf', kind: 'model', repo: 'acme/clft', revision: 'a'.repeat(40) }] });
    const second = await run(projectId, '=SUM(1,1)', [{ iou: 0.5, loss: 0.4 }], { dataset: { source: 'visin', id: 'd', name: 'ZOD' }, status: 'failed' });
    const id = await compare([first, second]);

    const response = await get(`/comparisons/${id}/export?format=csv`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="ZOD_baselines.csv"');
    const rows = text(response.buffer).split('\r\n');
    expect(rows[0]).toBe(`${BOM}Run,Status,Dataset,Epochs,Models,val.loss best,val.loss best epoch,val.loss last,val.loss better is,val.mean_iou best,val.mean_iou best epoch,val.mean_iou last,val.mean_iou better is`);
    expect(rows[1]).toBe(`"clft, v2",completed,zod,3,acme/clft@aaaaaaa,0.2,3,0.2,lower (assumed),0.7,2,0.6,higher`);
    expect(rows[2]).toBe(`'=SUM(1,1),failed,ZOD,1,,0.4,1,0.4,lower (assumed),0.5,1,0.5,higher`.replace("'=SUM(1,1)", `"'=SUM(1,1)"`));
  });

  it('is an .xlsx by default, a valid zip holding the same table', async () => {
    const projectId = await project();
    const id = await compare([await run(projectId, 'baseline', [{ iou: 0.6, loss: 0.3 }])], { name: 'Weekly: results/2' });
    const response = await get(`/comparisons/${id}/export`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Weekly_results_2.xlsx"');
    expect(response.buffer.subarray(0, 4).toString('hex')).toBe('504b0304');
    const end = response.buffer.length - 22;
    const entry = response.buffer.readUInt32LE(end + 16);
    const local = response.buffer.readUInt32LE(entry + 42);
    expect(response.buffer.readUInt16LE(end + 10)).toBe(5);
    const name = response.buffer.subarray(local + 30, local + 30 + response.buffer.readUInt16LE(local + 26)).toString();
    expect(name).toBe('[Content_Types].xml');
    expect(inflateRawSync(response.buffer.subarray(local + 30 + name.length, local + 30 + name.length + response.buffer.readUInt32LE(local + 18))).toString()).toContain('spreadsheetml');
  });

  it('leaves out a run that is gone, lets anyone read a public project’s comparison, and exports an empty one with only a header', async () => {
    const visible = await project({ visibility: 'public' });
    const shown = await run(visible, 'open run', [{ iou: 0.5, loss: 0.5 }]);
    const trashed = await run(visible, 'trashed run', [{ iou: 0.9, loss: 0.1 }]);
    await Training.updateOne({ _id: trashed }, { deletedAt: new Date() });
    const id = await compare([shown, trashed, '000000000000000000000abc'], { projectId: visible });
    const rows = text((await get(`/comparisons/${id}/export?format=csv`, STRANGER)).buffer).split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatch(/^open run,/);
    expect(text((await get(`/comparisons/${await compare([], { projectId: visible })}/export?format=csv`, '')).buffer)).toBe(`${BOM}Run,Status,Dataset,Epochs,Models\r\n`);
  });

  it('refuses what it cannot export: other kinds of comparison, a missing one, a private one, a bad format', async () => {
    const projectId = await project();
    const trainingId = await run(projectId, 'r', []);
    const tests = await compare([trainingId], { type: 'tests' });
    const message = JSON.parse(text((await get(`/comparisons/${tests}/export`)).buffer)).message;
    expect((await get(`/comparisons/${tests}/export`)).status).toBe(400);
    expect(message).toMatch(/Only a comparison of trainings.*compares tests/);
    expect((await get('/comparisons/000000000000000000000abc/export')).status).toBe(404);
    const privateComparison = await compare([trainingId], { projectId });
    expect((await get(`/comparisons/${privateComparison}/export`, STRANGER)).status).toBe(403);
    expect((await get(`/comparisons/${privateComparison}/export?format=pdf`)).status).toBe(400);
  });

  it('names the file after the comparison, falling back to a plain name when nothing usable is left', async () => {
    const projectId = await project();
    const trainingId = await run(projectId, 'r', []);
    const id = await compare([trainingId], { name: '日本語' });
    expect((await get(`/comparisons/${id}/export?format=csv`)).headers.get('content-disposition')).toBe('attachment; filename="comparison.csv"');
  });
});
