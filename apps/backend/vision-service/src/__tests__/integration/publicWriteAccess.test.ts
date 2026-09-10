import projectRoutes from '../../routes/projectRoutes';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
import Epoch from '../../models/Epoch';
import EpochVisualization from '../../models/EpochVisualization';
import TestResult from '../../models/TestResult';
import Benchmark from '../../models/Benchmark';
import Comparison from '../../models/Comparison';
import Dataset from '../../models/Dataset';
import Config from '../../models/Config';
import DatasetImage from '../../models/DatasetImage';
import ImageCategory from '../../models/ImageCategory';
import UploadReservation from '../../models/UploadReservation';
import writeCapabilitiesRoutes from '../../routes/writeCapabilitiesRoutes';
import configRoutes from '../../routes/configRoutes';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { apiKeyAuth, errorHandler } from '@visin/backend-core';
import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';
import trainingRoutes from '../../routes/trainingRoutes';
import epochRoutes from '../../routes/epochRoutes';
import testResultRoutes from '../../routes/testResultRoutes';
import benchmarkRoutes from '../../routes/benchmarkRoutes';
import comparisonRoutes from '../../routes/comparisonRoutes';
import visualizationRoutes from '../../routes/visualizationRoutes';
import analysisRoutes from '../../routes/analysisRoutes';
import datasetRoutes from '../../routes/datasetRoutes';
import datasetImageRoutes from '../../routes/datasetImageRoutes';
import imageCategoryRoutes from '../../routes/imageCategoryRoutes';
import Project from '../../models/Project';
import Training from '../../models/Training';
import DatasetAnalysis from '../../models/DatasetAnalysis';
import * as files from '../../services/fileServiceClient';

jest.mock('../../services/fileServiceClient', () => ({
  ...jest.requireActual('../../services/fileServiceClient'),
  getUploadSignedUrl: jest.fn(async () => 'https://files.invalid/upload'),
  getSignedUrl: jest.fn(async () => ({ signedUrl: 'https://files.invalid/download' })),
  getPhotoSignedUrl: jest.fn(async () => ({ signedUrl: 'https://files.invalid/photo' })),
  getFileMetadata: jest.fn(async () => ({ size: 10 })),
  deleteFile: jest.fn(async () => true),
}));

describe('public reads and authorized writes with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  let projectId: string;
  let trainingId: string;
  let legacyId: string;
  let analysisId: string;
  const secret = 'public-write-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware, apiTokenMiddleware);
    app.use('/write-capabilities', writeCapabilitiesRoutes);
    for (const [path, router] of Object.entries({ projects: projectRoutes, configs: configRoutes, trainings: trainingRoutes, epochs: epochRoutes,
      'test-results': testResultRoutes, benchmarks: benchmarkRoutes, comparisons: comparisonRoutes,
      visualizations: visualizationRoutes, analysis: analysisRoutes, datasets: datasetRoutes,
      'dataset-images': datasetImageRoutes, 'image-categories': imageCategoryRoutes })) {
      app.use(`/${path}`, apiKeyAuth(['analysis', 'datasets', 'dataset-images', 'image-categories'].includes(path) ? 'dataset' : 'vision'), router);
    }
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(getUserGroups).mockResolvedValue([]);
    jest.mocked(files.getFileMetadata).mockResolvedValue({ size: 10 } as Awaited<ReturnType<typeof files.getFileMetadata>>);
    projectId = String((await Project.create({ name: 'Public', ownerId: 'owner', isPublic: true }))._id);
    trainingId = String((await Training.create({ name: 'Public run', uuid: 'public-run', projectId }))._id);
    await Epoch.create({ timestamp: new Date(), trainingId, training_uuid: 'public-run', epoch_uuid: 'public-epoch', epoch: 1, results: {} });
    legacyId = String((await Training.create({ name: 'Legacy run', uuid: 'legacy-run' }))._id);
    analysisId = String((await DatasetAnalysis.create({ dataset: 'Legacy shared dataset', data: {} }))._id);
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

  const request = async (path: string, method = 'GET', body?: unknown, userId: string | undefined = 'owner') => {
    const unsigned = [{ alg: 'HS256', typ: 'JWT' }, { id: userId, exp: Math.floor(Date.now() / 1000) + 60 }]
      .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
    const response = await fetch(`${baseUrl}/${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as { data: Record<string, unknown> } : { data: {} } };
  };

  it('denies a stranger public training mutation while preserving public reads and owner writes', async () => {
    expect((await request(`trainings/${trainingId}`, 'GET', undefined, 'stranger')).status).toBe(200);
    expect((await request(`trainings/${trainingId}`, 'PUT', { name: 'Attacker' }, 'stranger')).status).toBe(403);
    expect((await request(`trainings/${trainingId}`, 'PUT', { name: 'Owner update' })).status).toBe(200);
  });

  it('keeps ownerless legacy standalone trainings read-only', async () => {
    expect((await request(`trainings/${legacyId}`)).status).toBe(200);
    expect((await request(`trainings/${legacyId}`, 'DELETE')).status).toBe(403);
    expect((await Training.findById(legacyId))?.deletedAt).toBeUndefined();
  });

  it('keeps ownerless shared libraries read-only before file effects', async () => {
    expect((await request(`analysis/${analysisId}`)).status).toBe(200);
    expect((await request(`analysis/${analysisId}`, 'PUT', { dataset: 'Hijacked' })).status).toBe(403);
    expect((await request(`analysis/${analysisId}`, 'DELETE')).status).toBe(403);
    expect(files.deleteFile).not.toHaveBeenCalled();
  });
  const benchmarkBody = { timestamp: new Date().toISOString(), system_info: { cpu_count: 1, cpu_count_logical: 1, memory_total_gb: 1 }, results: [] };
  const epochBody = () => ({ trainingId, training_uuid: 'public-run', epoch: 2, results: {} });
  const archive = async (user = 'owner', dataset?: string) => {
    const result = await request('analysis/upload-url', 'POST', { filename: 'data.zip', mimetype: 'application/zip', dataset }, user);
    expect(result.status).toBe(201);
    return result.body.data as { fileId: string; analysisId?: string };
  };

  it('stamps new standalone records and does not accept an injected owner', async () => {
    const created = await request('trainings', 'POST', { name: 'Mine', ownerId: 'stranger' });
    expect(created.status).toBe(201);
    const id = String(created.body.data._id);
    expect((await Training.findById(id))?.ownerId).toBe('owner');
    expect((await request(`trainings/${id}`, 'PUT', { name: 'Changed', ownerId: 'stranger' })).status).toBe(200);
    expect((await request(`trainings/${id}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`trainings/${id}`, 'DELETE')).status).toBe(200);
    expect((await request('trainings', 'POST', { name: 'Injected', projectId }, 'stranger')).status).toBe(403);
    expect((await request('trainings', 'POST', { name: 'Anonymous' }, '')).status).toBe(401);
  });

  it('checks epoch normal/upload/update and every batch parent before writing', async () => {
    const epoch = await Epoch.findOne({ epoch_uuid: 'public-epoch' });
    for (const path of ['epochs', 'epochs/upload']) {
      expect((await request(path, 'POST', epochBody(), 'stranger')).status).toBe(403);
      expect((await request(path, 'POST', epochBody())).status).toBe(201);
    }
    expect((await request(`epochs/${epoch!._id}`, 'PUT', { results: { changed: true } }, 'stranger')).status).toBe(403);
    expect((await request(`epochs/${epoch!._id}`, 'PUT', { results: { changed: true } })).status).toBe(200);
    const count = await Epoch.countDocuments();
    expect((await request('epochs/batch', 'POST', { epochs: [epochBody(), { ...epochBody(), trainingId: legacyId }] })).status).toBe(403);
    expect(await Epoch.countDocuments()).toBe(count);
    expect((await request('epochs/batch', 'POST', { epochs: [epochBody()] })).status).toBe(201);
    await Training.updateOne({ _id: trainingId }, { deletedAt: new Date() });
    expect((await request('epochs', 'POST', epochBody())).status).toBe(403);
  });

  it('checks test-result old and replacement parents and rejects orphan ingestion', async () => {
    const body = { epoch: 1, epoch_uuid: 'public-epoch', test_results: { day: { overall: { score: 1 } } } };
    for (const path of ['test-results', 'test-results/upload']) {
      expect((await request(path, 'POST', body, 'stranger')).status).toBe(403);
      expect((await request(path, 'POST', { ...body, epoch_uuid: 'missing' })).status).toBe(403);
      expect((await request(path, 'POST', body)).status).toBe(201);
    }
    const test = await TestResult.findOne();
    await Epoch.create({ timestamp: new Date(), trainingId: legacyId, training_uuid: 'legacy-run', epoch_uuid: 'legacy-epoch', epoch: 1, results: {} });
    expect((await request(`test-results/${test!._id}`, 'PUT', { epoch_uuid: 'legacy-epoch' })).status).toBe(403);
    expect((await request(`test-results/${test!._id}`, 'PUT', { epoch: 2 }, 'stranger')).status).toBe(403);
    expect((await request(`test-results/${test!._id}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`test-results/${test!._id}`, 'PUT', { epoch: 2 })).status).toBe(200);
    expect((await request(`test-results/${test!._id}`, 'DELETE')).status).toBe(200);
  });

  it('protects project and standalone benchmarks including stale and conflicting parent references', async () => {
    for (const path of ['benchmarks', 'benchmarks/upload']) {
      expect((await request(path, 'POST', { ...benchmarkBody, training_uuid: 'public-run' }, 'stranger')).status).toBe(403);
      expect((await request(path, 'POST', { ...benchmarkBody, training_uuid: 'missing' })).status).toBe(403);
      expect((await request(path, 'POST', { ...benchmarkBody, epoch_uuid: 'public-epoch' })).status).toBe(201);
    }
    const linked = await Benchmark.findOne();
    expect(linked?.training_id?.toString()).toBe(trainingId);
    expect((await request(`benchmarks/${linked!._id}`, 'PUT', { training_uuid: 'legacy-run' })).status).toBe(403);
    expect((await request(`benchmarks/${linked!._id}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`benchmarks/${linked!._id}`, 'PUT', { epoch: 3 })).status).toBe(200);
    const standalone = await request('benchmarks', 'POST', benchmarkBody);
    expect(standalone.status).toBe(201);
    expect((await request(`benchmarks/${standalone.body.data._id}`, 'DELETE')).status).toBe(200);
    const legacy = await Benchmark.create(benchmarkBody);
    expect((await request(`benchmarks/${legacy._id}`, 'DELETE')).status).toBe(403);
    const orphan = await Benchmark.create({ ...benchmarkBody, ownerId: 'owner', training_uuid: 'missing' });
    expect((await request(`benchmarks/${orphan._id}`, 'DELETE')).status).toBe(403);
    const own = await Training.create({ name: 'Other', uuid: 'other', ownerId: 'owner' });
    await Epoch.create({ timestamp: new Date(), trainingId: own._id.toString(), training_uuid: 'other', epoch_uuid: 'other-epoch', epoch: 1, results: {} });
    expect((await request('benchmarks', 'POST', { ...benchmarkBody, training_uuid: 'public-run', epoch_uuid: 'other-epoch' })).status).toBe(403);
  });

  it('protects comparisons and leaves another owner’s comparison intact on training deletion', async () => {
    const body = { name: 'Comparison', type: 'trainings', itemIds: [trainingId] };
    expect((await request('comparisons', 'POST', { ...body, projectId }, 'stranger')).status).toBe(403);
    const mine = await request('comparisons', 'POST', body);
    const theirs = await request('comparisons', 'POST', body, 'stranger');
    expect(mine.status).toBe(201);
    expect(theirs.status).toBe(201);
    expect((await request(`comparisons/${mine.body.data._id}`, 'PUT', { name: 'Hijack' }, 'stranger')).status).toBe(403);
    expect((await request(`comparisons/${mine.body.data._id}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`comparisons/${mine.body.data._id}`, 'PUT', { name: 'Updated' })).status).toBe(200);
    expect((await request(`trainings/${trainingId}`, 'DELETE')).status).toBe(200);
    expect((await Comparison.findById(theirs.body.data._id))?.itemIds).toEqual([trainingId]);
    expect((await Comparison.findById(mine.body.data._id))?.itemIds).toEqual([]);
    expect((await request(`comparisons/${mine.body.data._id}`, 'DELETE')).status).toBe(200);
  });

  it('protects visualization upload/create/delete and verifies issued files', async () => {
    const body = { epoch_uuid: 'public-epoch', filename: 'plot.png', type: 'plot', mimetype: 'image/png' };
    expect((await request('visualizations/upload-url', 'POST', body, 'stranger')).status).toBe(403);
    const issued = await request('visualizations/upload-url', 'POST', body);
    expect(issued.status).toBe(200);
    const create = { ...body, ...issued.body.data, size: 10 };
    expect((await request('visualizations', 'POST', create, 'stranger')).status).toBe(403);
    expect((await request('visualizations', 'POST', { ...create, fileId: 'foreign.png' })).status).toBe(403);
    expect((await request('visualizations', 'POST', create)).status).toBe(201);
    const uuid = String(issued.body.data.visualization_uuid);
    expect((await request(`visualizations/${uuid}`, 'GET', undefined, '')).status).toBe(200);
    expect((await request(`visualizations/${uuid}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`visualizations/${uuid}`, 'DELETE')).status).toBe(200);
  });

  it('verifies pending archives before completion, enforces creator ownership, and retains unverified legacy bytes', async () => {
    const issued = await archive('owner', 'New analysis');
    const id = issued.analysisId!;
    expect((await DatasetAnalysis.findById(id))?.ownerId).toBe('owner');
    expect((await request(`analysis/${id}/complete`, 'POST', {}, 'stranger')).status).toBe(403);
    jest.mocked(files.getFileMetadata).mockRejectedValueOnce(new Error('not uploaded'));
    expect((await request(`analysis/${id}/complete`, 'POST', {})).status).toBe(400);
    expect((await DatasetAnalysis.findById(id))?.status).toBe('pending');
    expect((await request(`analysis/${id}/complete`, 'POST', {})).status).toBe(200);
    expect((await request(`analysis/${id}/complete`, 'POST', {})).status).toBe(200);
    expect((await request(`analysis/${id}`, 'PUT', { dataset: 'Updated' })).status).toBe(200);
    const replacement = await archive();
    expect((await request(`analysis/${id}`, 'PUT', { fileId: replacement.fileId })).status).toBe(200);
    expect(files.deleteFile).toHaveBeenCalledWith(issued.fileId);
    expect((await request(`analysis/${id}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`analysis/${id}`, 'DELETE')).status).toBe(200);
    expect(files.deleteFile).toHaveBeenCalledWith(replacement.fileId);
    const legacy = await DatasetAnalysis.create({ ownerId: 'owner', dataset: 'Legacy assigned', fileId: 'datasets/legacy/shared.zip' });
    jest.mocked(files.deleteFile).mockClear();
    expect((await request(`analysis/${legacy._id}`, 'DELETE')).status).toBe(200);
    expect(files.deleteFile).not.toHaveBeenCalled();
  });

  it('rejects stolen, expired, replayed, and nested archive references', async () => {
    const issued = await archive();
    const body = { dataset: 'Data', fileId: issued.fileId };
    expect((await request('analysis/upload', 'POST', body, 'stranger')).status).toBe(403);
    expect((await request('analysis/upload', 'POST', { dataset: 'Data', data: { downloadUrl: issued.fileId } }, 'stranger')).status).toBe(403);
    expect((await request('analysis/upload', 'POST', { ...body, data: { downloadUrl: 'datasets/foreign/file.zip' } })).status).toBe(400);
    const created = await request('analysis/upload', 'POST', body);
    expect(created.status).toBe(201);
    const another = await request('analysis/upload', 'POST', { dataset: 'Other' });
    expect((await request(`analysis/${another.body.data._id}`, 'PUT', { fileId: issued.fileId })).status).toBe(403);
    expect((await request(`analysis/${another.body.data._id}`, 'PUT', { data: { downloadUrl: issued.fileId } })).status).toBe(403);
    expect((await request(`analysis/${created.body.data._id}`, 'DELETE')).status).toBe(200);
    expect((await request('analysis/upload', 'POST', body)).status).toBe(403);
    const expired = await archive();
    await UploadReservation.updateOne({ fileId: expired.fileId }, { expiresAt: new Date(0) });
    expect((await request('analysis/upload', 'POST', { dataset: 'Expired', fileId: expired.fileId })).status).toBe(403);
    expect((await request('analysis/upload', 'POST', { dataset: 'External', data: { downloadUrl: 'https://example.invalid/file.zip' } })).status).toBe(201);
  });

  it('allows exactly one archive attachment under concurrent claims', async () => {
    const issued = await archive();
    const first = await request('analysis/upload', 'POST', { dataset: 'First' });
    const second = await request('analysis/upload', 'POST', { dataset: 'Second' });
    const results = await Promise.all([first, second].map(record => request(`analysis/${record.body.data._id}`, 'PUT', { fileId: issued.fileId })));
    expect(results.map(result => result.status).sort()).toEqual([200, 403]);
    expect(await DatasetAnalysis.countDocuments({ fileId: issued.fileId })).toBe(1);
  });

  it('inherits image/category writes from the actual analysis parent and enforces category consistency', async () => {
    const parent = await request('analysis/upload', 'POST', { dataset: 'Images' });
    const datasetId = String(parent.body.data._id);
    const category = await request('image-categories', 'POST', { name: 'Cars', datasetId });
    expect(category.status).toBe(201);
    const categoryId = String(category.body.data._id);
    const body = { filename: 'car.png', mimetype: 'image/png', datasetId, categoryId };
    expect((await request('image-categories', 'POST', { name: 'Foreign', datasetId }, 'stranger')).status).toBe(403);
    expect((await request(`image-categories/${categoryId}`, 'PUT', { color: 'red' }, 'stranger')).status).toBe(403);
    expect((await request(`image-categories/${categoryId}`, 'PUT', { color: 'red' })).status).toBe(200);
    expect((await request('dataset-images/upload-url', 'POST', body, 'stranger')).status).toBe(403);
    const issued = await request('dataset-images/upload-url', 'POST', body);
    expect(issued.status).toBe(200);
    const create = { ...body, originalName: 'car.png', fileId: issued.body.data.fileId, size: 10 };
    expect((await request('dataset-images', 'POST', create, 'stranger')).status).toBe(403);
    expect((await request('dataset-images', 'POST', { ...create, fileId: 'foreign/path.png' })).status).toBe(403);
    expect((await request('dataset-images', 'POST', { ...create, size: 11 })).status).toBe(400);
    const image = await request('dataset-images', 'POST', create);
    expect(image.status).toBe(201);
    const id = String(image.body.data._id);
    const fetched = await request(`dataset-images/${id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.datasetId).toMatchObject({ _id: datasetId, dataset: 'Images' });
    const otherCategory = await ImageCategory.create({ name: 'Other', datasetId: analysisId });
    expect((await request(`dataset-images/${id}`, 'PUT', { categoryId: String(otherCategory._id) })).status).toBe(400);
    expect((await request(`dataset-images/${id}`, 'PUT', { title: 'Hijack' }, 'stranger')).status).toBe(403);
    expect((await request(`dataset-images/${id}`, 'PUT', { title: 'Good', categoryId: null })).status).toBe(200);
    expect((await request(`dataset-images/${id}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`dataset-images/${id}`, 'DELETE')).status).toBe(200);
    expect(files.deleteFile).toHaveBeenCalledWith(create.fileId);
    expect((await request(`image-categories/${categoryId}`, 'DELETE', undefined, 'stranger')).status).toBe(403);
    expect((await request(`image-categories/${categoryId}`, 'DELETE')).status).toBe(200);
  });

  it('keeps ownerless dataset children read-only', async () => {
    const cat = await ImageCategory.create({ datasetId: analysisId, name: 'Legacy' });
    const img = await DatasetImage.create({ datasetId: analysisId, categoryId: cat._id, filename: 'old.png', originalName: 'old.png', fileId: 'legacy/file.png', mimetype: 'image/png', size: 10 });
    for (const [path, body] of [[`image-categories/${cat._id}`, { name: 'Renamed' }], [`dataset-images/${img._id}`, { title: 'Renamed' }]] as const) {
      expect((await request(path, 'PUT', body)).status).toBe(403);
      expect((await request(path, 'DELETE')).status).toBe(403);
    }
    expect(files.deleteFile).not.toHaveBeenCalled();
  });

  it('stamps library creators and prevents new datasets from manufacturing stored-file downloads', async () => {
    expect((await request('configs', 'POST', { summary: 'Config', config_data: {} })).status).toBe(201);
    expect((await Config.findOne())?.ownerId).toBe('owner');
    const result = await request('datasets', 'POST', { name: 'New dataset' });
    expect(result.status).toBe(201);
    expect((await Dataset.findById(result.body.data._id))?.ownerId).toBe('owner');
    expect((await request(`datasets/download/${result.body.data.uuid}`)).status).toBe(404);
    expect((await request('datasets', 'POST', { name: 'Stolen', downloadUrl: 'datasets/private.zip' })).status).toBe(403);
    const issued = await archive();
    expect((await request('datasets', 'POST', { name: 'Mine', downloadUrl: issued.fileId })).status).toBe(201);
    expect((await request('analysis/upload', 'POST', { dataset: 'Replay', fileId: issued.fileId })).status).toBe(403);
  });

  it('returns current browser write capabilities without granting legacy or unrelated access', async () => {
    const ids = [trainingId, legacyId, new mongoose.Types.ObjectId().toString()].join(',');
    const url = `write-capabilities?kind=training&ids=${ids}`;
    expect((await request(url)).body.data).toEqual({ [trainingId]: true, [legacyId]: false, [ids.split(',')[2]]: false });
    expect((await request(url, 'GET', undefined, 'stranger')).body.data[trainingId]).toBe(false);
    expect((await request(url, 'GET', undefined, '')).body.data[trainingId]).toBe(false);
    expect((await request('write-capabilities?kind=training&ids=invalid')).status).toBe(400);
    await Project.updateOne({ _id: projectId }, { ownerId: 'stranger' });
    expect((await request(url)).body.data[trainingId]).toBe(false);
    expect((await request(`trainings/${trainingId}`, 'PUT', { name: 'No longer owner' })).status).toBe(403);
  });



  it('reports each resource capability from its live parent or creator and fails closed on lookup errors', async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    const comparison = await Comparison.create({ uuid: 'cap-comparison', name: 'Comparison', type: 'trainings', itemIds: [], projectId });
    const benchmark = await Benchmark.create({ ...benchmarkBody, training_id: trainingId });
    const test = await TestResult.create({ test_uuid: 'cap-test', epoch_uuid: 'public-epoch', epoch: 1, timestamp: new Date(), test_results: { day: { overall: { score: 1 } } } });
    const analysis = await DatasetAnalysis.create({ dataset: 'Owned', ownerId: 'owner' });
    for (const [kind, id] of [['project', projectId], ['comparison', comparison._id], ['benchmark', benchmark._id], ['test-result', test._id], ['analysis', analysis._id], ['dataset', analysis._id]]) {
      const path = `write-capabilities?kind=${kind}&ids=${id},${missing}`;
      expect((await request(path)).body.data).toEqual({ [String(id)]: true, [missing]: false });
      expect((await request(path, 'GET', undefined, 'stranger')).body.data).toEqual({ [String(id)]: false, [missing]: false });
      expect((await request(path, 'GET', undefined, '')).body.data).toEqual({ [String(id)]: false, [missing]: false });
    }
    await Training.updateOne({ _id: trainingId }, { deletedAt: new Date() });
    expect((await request(`write-capabilities?kind=test-result&ids=${test._id}`)).body.data[String(test._id)]).toBe(false);
    const groupId = new mongoose.Types.ObjectId().toString();
    await Project.updateOne({ _id: projectId }, { editorGroupIds: [groupId] });
    jest.mocked(getUserGroups).mockRejectedValueOnce(new Error('Membership lookup failed'));
    expect((await request(`write-capabilities?kind=project&ids=${projectId}`, 'GET', undefined, 'editor')).status).toBe(500);
    jest.mocked(getUserGroups).mockResolvedValue([{ id: groupId, name: 'Researchers' }]);
    expect((await request('write-capabilities/groups')).body.data).toEqual([{ id: groupId, name: 'Researchers' }]);
    expect((await request('write-capabilities/groups', 'GET', undefined, '')).status).toBe(401);
  });

  it('lets assigned group members read private projects and create and modify all their trainings', async () => {
    const groupId = new mongoose.Types.ObjectId().toString();
    const members = new Set(['owner', 'editor']);
    jest.mocked(getUserGroups).mockImplementation(async userId => userId && members.has(userId) ? [{ id: groupId, name: 'Researchers' }] : []);
    const project = await request('projects', 'POST', { name: 'Team project', isPublic: false, editorGroupIds: [groupId] });
    expect(project.status).toBe(201);
    const teamId = String(project.body.data._id);
    expect((await request(`projects/${teamId}`, 'GET', undefined, 'editor')).status).toBe(200);
    expect((await request(`projects/${teamId}`, 'GET', undefined, 'stranger')).status).toBe(403);
    const created = await request('trainings', 'POST', { name: 'Team run', projectId: teamId }, 'editor');
    expect(created.status).toBe(201);
    const id = String(created.body.data._id);
    expect((await request(`trainings/${id}`, 'PUT', { name: 'Edited by teammate' }, 'editor')).status).toBe(200);
    const epoch = await request('epochs', 'POST', { trainingId: id, training_uuid: String(created.body.data.uuid), epoch_uuid: 'team-epoch', epoch: 1, results: {} }, 'editor');
    expect(epoch.status).toBe(201);
    expect((await request('test-results', 'POST', { epoch_uuid: 'team-epoch', epoch: 1, test_results: {} }, 'editor')).status).toBe(201);
    expect((await request('benchmarks', 'POST', { ...benchmarkBody, epoch_uuid: 'team-epoch' }, 'editor')).status).toBe(201);
    expect((await request('comparisons', 'POST', { name: 'Team comparison', type: 'trainings', itemIds: [id], projectId: teamId }, 'editor')).status).toBe(201);
    const list = await request('trainings', 'GET', undefined, 'editor');
    expect(JSON.stringify(list.body)).toContain(id);
    expect((await request(`write-capabilities?kind=training&ids=${id}`, 'GET', undefined, 'editor')).body.data[id]).toBe(true);
    // Editing data does not confer project administration or permission grants.
    expect((await request(`projects/${teamId}`, 'PUT', { editorGroupIds: [] }, 'editor')).status).toBe(403);
    expect((await request(`projects/${teamId}`, 'DELETE', undefined, 'editor')).status).toBe(403);
    members.delete('editor');
    expect((await request(`trainings/${id}`, 'PUT', { name: 'Removed member' }, 'editor')).status).toBe(403);
    expect((await request(`trainings/${id}`, 'GET', undefined, 'editor')).status).toBe(403);
    members.add('editor');
    expect((await request(`trainings/${id}`, 'DELETE', undefined, 'editor')).status).toBe(200);
  });

  it('allows the owner to add and remove groups but rejects arbitrary group IDs and membership failures', async () => {
    const groupId = new mongoose.Types.ObjectId().toString();
    jest.mocked(getUserGroups).mockImplementation(async userId => ['owner', 'editor'].includes(userId || '') ? [{ id: groupId, name: 'Researchers' }] : []);
    expect((await request(`projects/${projectId}`, 'PUT', { editorGroupIds: [new mongoose.Types.ObjectId().toString()] })).status).toBe(403);
    expect((await request(`projects/${projectId}`, 'PUT', { editorGroupIds: [groupId] })).status).toBe(200);
    expect((await request(`trainings/${trainingId}`, 'PUT', { name: 'Team edited' }, 'editor')).status).toBe(200);
    jest.mocked(getUserGroups).mockRejectedValueOnce(new Error('Membership service unavailable'));
    expect((await request(`trainings/${trainingId}`, 'PUT', { name: 'No verified membership' }, 'editor')).status).toBe(500);
    expect((await Training.findById(trainingId))?.name).toBe('Team edited');
    expect((await request(`projects/${projectId}`, 'PUT', { editorGroupIds: [] })).status).toBe(200);
    expect((await request(`trainings/${trainingId}`, 'PUT', { name: 'Group removed' }, 'editor')).status).toBe(403);
  });

  it.each(['external', 'stored', 'both'])('replaces an archive with a supported %s download reference', async source => {
    const previous = source === 'external' ? 'https://example.invalid/old.zip' : (await archive()).fileId;
    const created = await request('analysis/upload', 'POST', { dataset: 'Replaceable', data: { downloadUrl: previous, metric: 1 }, ...(source === 'both' ? { fileId: previous } : {}) });
    expect(created.status).toBe(201);
    const replacement = await archive();
    expect((await request(`analysis/${created.body.data._id}`, 'PUT', { fileId: replacement.fileId })).status).toBe(200);
    const updated = await DatasetAnalysis.findById(created.body.data._id);
    expect(updated?.fileId).toBe(replacement.fileId);
    expect(updated?.data.metric).toBe(1);
    expect(updated?.data.downloadUrl).toBeUndefined();
  });


  describe('read privacy regressions', () => {
    async function privateResults() {
      const project = await Project.create({ name: 'Secret', ownerId: 'owner', isPublic: false, editorGroupIds: ['a'.repeat(24)] });
      const training = await Training.create({ name: 'Secret run', uuid: 'secret-run', projectId: String(project._id) });
      await Epoch.create({ timestamp: new Date(), trainingId: String(training._id), training_uuid: training.uuid, epoch_uuid: 'secret-epoch', epoch: 73, results: {} });
      const result = await TestResult.create({ epoch: 73, epoch_uuid: 'secret-epoch', test_uuid: 'secret-test', timestamp: new Date(), test_results: { secret: { object: { iou: 1 } } } });
      await EpochVisualization.create({ epoch_uuid: 'secret-epoch', visualization_uuid: 'secret-viz', filename: 'secret.png', type: 'secret-type', fileId: 'secret-file' });
      const benchmark = await Benchmark.create({ ...benchmarkBody, training_id: training._id, training_uuid: training.uuid });
      return { training, result, benchmark };
    }
    it.each(['', 'stranger'])('does not expose private results through epoch filters (%s)', async actor => {
      await privateResults();
      for (const query of ['epoch=73', 'epoch_uuids=secret-epoch', `projectId=${projectId}&epoch_uuids=secret-epoch`, 'training_uuid=public-run&epoch_uuids=secret-epoch']) {
        const response = await request(`test-results?${query}&page=1&limit=1`, 'GET', undefined, actor);
        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toContain('secret-test');
      }
      expect(JSON.stringify((await request('test-results/epochs', 'GET', undefined, actor)).body)).not.toContain('73');
      expect(JSON.stringify((await request('visualizations/types', 'GET', undefined, actor)).body)).not.toContain('secret-type');
      expect(JSON.stringify((await request('test-results?epoch=73', 'GET', undefined, 'owner')).body)).toContain('secret-test');
      expect(JSON.stringify((await request('test-results/epochs', 'GET', undefined, 'owner')).body)).toContain('73');
    });
    it('serves the frontend epoch-results route for public and authorized private epochs', async () => {
      await privateResults();
      await TestResult.create({ epoch: 1, epoch_uuid: 'public-epoch', test_uuid: 'public-test', timestamp: new Date(), test_results: {} });
      for (const actor of ['', 'owner', 'stranger']) {
        const response = await request('epochs/uuid/public-epoch/test-results', 'GET', undefined, actor);
        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).toContain('public-test');
      }
      expect((await request('epochs/uuid/secret-epoch/test-results')).status).toBe(200);
      expect((await request('epochs/uuid/secret-epoch/test-results', 'GET', undefined, 'stranger')).status).toBe(403);
      jest.mocked(getUserGroups).mockImplementation(async userId => userId === 'editor' ? [{ id: 'a'.repeat(24), name: 'Editors' }] : []);
      expect(JSON.stringify((await request('test-results?epoch=73', 'GET', undefined, 'editor')).body)).toContain('secret-test');
      expect((await request('epochs/uuid/secret-epoch/test-results', 'GET', undefined, 'editor')).status).toBe(200);
      jest.mocked(getUserGroups).mockResolvedValue([]);
      expect(JSON.stringify((await request('test-results?epoch=73', 'GET', undefined, 'editor')).body)).not.toContain('secret-test');

    });
    it('intersects filters and counts all matching authorized results across pages', async () => {
      await privateResults();
      await TestResult.create([1, 2, 3].map(i => ({ epoch: 1, epoch_uuid: 'public-epoch', test_uuid: `public-test-${i}`, timestamp: new Date(), test_results: {} })));
      const response = await request('test-results?epoch=1&page=2&limit=1');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ data: { pagination: { total: 3, pages: 3 } } });
      expect(JSON.stringify((await request(`test-results?projectId=${projectId}&epoch_uuids=secret-epoch`)).body)).not.toContain('secret-test');
    });
    it.each(['soft-delete', 'missing'] as const)('denies result, benchmark and file reads with a %s parent', async action => {
      const { training, result, benchmark } = await privateResults();
      if (action === 'soft-delete') await Training.updateOne({ _id: training._id }, { deletedAt: new Date() });
      else await Training.deleteOne({ _id: training._id });
      for (const path of ['visualizations/training/secret-run?includeUrls=true', 'visualizations/types?training_uuid=secret-run', 'visualizations/secret-viz', 'visualizations/epoch/secret-epoch', 'benchmarks?training_uuid=secret-run', 'benchmarks/stats?training_uuid=secret-run', `benchmarks/${benchmark._id}`, `test-results/${result._id}`]) {
        const response = await request(path, 'GET', undefined, 'stranger');
        expect([403, 404]).toContain(response.status);
      }
      expect(files.getSignedUrl).not.toHaveBeenCalled();
    });
    it('keeps true standalone benchmarks public while excluding orphan references', async () => {
      await Benchmark.create(benchmarkBody);
      await Benchmark.create({ ...benchmarkBody, training_uuid: 'deleted-run' });
      const response = await request('benchmarks', 'GET', undefined, '');
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain('deleted-run');
      expect(response.body).toMatchObject({ data: { pagination: { total: 1 } } });
      expect((await request('benchmarks/stats', 'GET', undefined, '')).body).toMatchObject({ data: { totalBenchmarks: 1 } });
    });
  });
});
