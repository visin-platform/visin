import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, optionalAuth } from '@visin/backend-core';
import { LabelJob } from '../../models/LabelJob';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import { LabelSuggestion } from '../../models/LabelSuggestion';
import jobRoutes from '../../routes/jobRoutes';
import taskRoutes from '../../routes/taskRoutes';
import { getPermission } from '../../clients/datasetServiceClient';
import * as files from '../../clients/fileServiceClient';
import { encodeMaskRle } from '../../utils/mask';
import { decodePng } from '../../utils/png';
import { finishTask } from '../../services/taskService';
import { ZipWriter, openZip } from '../../utils/zip';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The annotation lifecycle against a real MongoDB: what the mocked unit tests
 * cannot see is whether each update is one MongoDB accepts and does what the
 * service means by it.
 */
jest.mock('../../clients/datasetServiceClient', () => ({
  getPermission: jest.fn(),
  datasetIdsFor: jest.fn(async () => []),
  getDataset: jest.fn(async () => ({ _id: 'd1', name: 'Drive', owner: { kind: 'user', id: 'owner' }, groups: [] })),
  addHold: jest.fn(),
  removeHold: jest.fn()
}));
jest.mock('../../clients/fileServiceClient', () => {
  const stored = new Map<string, Buffer>();
  return {
    stored,
    jobFolder: (jobId: string) => `label/${jobId}/`,
    getDownloadUrls: jest.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `https://files.example.test/${id}`]))),
    putFile: jest.fn(async (id: string, data: Buffer) => void stored.set(id, data)),
    getFile: jest.fn(async (id: string) => {
      const found = stored.get(id);
      if (!found) throw new Error(`no ${id}`);
      return found;
    }),
    deleteFile: jest.fn(async (id: string) => void stored.delete(id)),
    deleteFolder: jest.fn(async () => undefined)
  };
});

const stored = (files as unknown as { stored: Map<string, Buffer> }).stored;
const actors: Record<string, string> = { owner: '000000000000000000000011', ann: '000000000000000000000012', bea: '000000000000000000000013' };

describe('annotation lifecycle with in-memory MongoDB', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let base: string;
  let folder: string;
  const oldSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'label-annotation-test-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([LabelAnnotation.init(), LabelSuggestion.init()]);
    const app = express();
    app.use(express.json(), optionalAuth);
    app.use('/jobs', jobRoutes);
    app.use('/tasks', taskRoutes);
    app.use(errorHandler);
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 120_000);

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'annotation-flow-'));
    await mongoose.connection.collection('users').insertMany(
      Object.entries(actors).map(([name, id]) => ({ _id: new mongoose.Types.ObjectId(id), email: `${name}@example.test`, tokenVersion: 1 }))
    );
    await mongoose.connection.collection('user_sessions').insertMany(
      Object.values(actors).map((id) => ({ _id: new mongoose.Types.ObjectId(id), userId: new mongoose.Types.ObjectId(id), expiresAt: new Date(Date.now() + 3_600_000) }))
    );
    (getPermission as jest.Mock).mockImplementation(async (_datasetId: string, userId?: string) =>
      userId === actors.owner ? 'manage' : userId ? 'contribute' : 'none'
    );
    stored.clear();
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
    await Promise.all([
      mongoose.connection.collection('users').deleteMany({}),
      mongoose.connection.collection('user_sessions').deleteMany({}),
      LabelJob.deleteMany({}),
      LabelTask.deleteMany({}),
      LabelAnnotation.deleteMany({}),
      LabelSuggestion.deleteMany({})
    ]);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });

  const token = (who: string) =>
    jwt.sign({ id: actors[who], tokenVersion: 1, email: `${who}@example.test`, name: who, sid: actors[who], typ: 'session' }, process.env.JWT_SECRET!, {
      expiresIn: '1h'
    });

  const request = async (path: string, who: string, method = 'GET', body?: unknown, contentType = 'application/json') => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': contentType, authorization: `Bearer ${token(who)}` },
      ...(body === undefined ? {} : { body: contentType === 'application/json' ? JSON.stringify(body) : (body as BodyInit) })
    });
    const text = Buffer.from(await response.arrayBuffer());
    let json: { data?: Record<string, unknown>; message?: string } | undefined;
    try {
      json = JSON.parse(text.toString());
    } catch {
      json = undefined;
    }
    return { status: response.status, json, raw: text };
  };

  const fixture = async (frames = 2, redundancy = 1) => {
    const job = await LabelJob.create({
      name: 'Street',
      createdBy: { userId: actors.owner, email: 'owner@example.test' },
      datasetId: 'd1',
      status: 'active',
      redundancy,
      sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
      classes: [
        { key: 'car', name: 'Car', color: '#2a78d6', tools: ['box', 'mask'], maskIndex: 1 },
        { key: 'road', name: 'Road', color: '#eb6834', tools: ['mask'], maskIndex: 2 }
      ],
      tasksCount: frames,
      taskGeneration: 'published'
    });
    const tasks = await LabelTask.insertMany(
      Array.from({ length: frames }, (_, i) => ({
        jobId: job._id,
        generation: 'published',
        order: i,
        frame: { fileId: `f${i}`, path: `camera/000${i}.jpg`, stem: `000${i}`, width: 8, height: 4 }
      }))
    );
    return { job, tasks };
  };

  const box = (id: string, bbox = [1, 1, 4, 2]) => ({ id, classKey: 'car', bbox });
  const maskBytes = (values: number[]) => encodeMaskRle({ width: 8, height: 4, data: Uint8Array.from(values) });

  it('lets managers change active-job model names while preserving labels and palette', async () => {
    const { job, tasks } = await fixture(2);
    await request(`/tasks/${tasks[0]._id}/annotation`, 'ann', 'PUT', { objects: [box('a')] });
    const before = await LabelJob.findById(job._id);
    const path = `/jobs/${job.id}/model-mapping`;
    expect((await request(path, 'ann', 'PUT', { mapping: { car: 'bus' } })).status).toBe(403);
    expect((await request(path, 'owner', 'PUT', { mapping: { ghost: 'car' } })).status).toBe(400);
    expect((await request(path, 'owner', 'PUT', { mapping: {} })).status).toBe(400);
    const updated = await request(path, 'owner', 'PUT', { mapping: { car: 'bus' } });
    expect(updated.status).toBe(200);
    const storedJob = await LabelJob.findById(job._id);
    expect(storedJob!.classes[0].modelClass).toBe('bus');
    expect(storedJob!.classes.map(({ key, maskIndex, tools }) => ({ key, maskIndex, tools })))
      .toEqual(before!.classes.map(({ key, maskIndex, tools }) => ({ key, maskIndex, tools })));
    expect((await LabelAnnotation.findOne({ taskId: tasks[0]._id }))!.objects[0].id).toBe('a');
    expect((await request(path, 'owner', 'PUT', { mapping: { car: null } })).status).toBe(200);
    expect((await LabelJob.findById(job._id))!.classes[0].modelClass).toBeUndefined();
  });

  const realInferenceTest = process.env.VISIN_INFER_URL && process.env.VISIN_INFER_IMAGE ? it : it.skip;
  realInferenceTest('stores a real inference mask through the annotation API as a class-index PNG', async () => {
    const image = await readFile(process.env.VISIN_INFER_IMAGE!);
    const modelBase = process.env.VISIN_INFER_URL!;
    const detections = await fetch(`${modelBase}/detect?minScore=0.5`, { method: 'POST', body: image, signal: AbortSignal.timeout(60_000) });
    expect(detections.status).toBe(200);
    const detected = await detections.json() as { boxes: { class: string; bbox: number[] }[] };
    const bus = detected.boxes.find((entry) => entry.class === 'bus')!;
    expect(bus).toBeDefined();
    const [x, y, w, h] = bus.bbox;
    const segmented = await fetch(`${modelBase}/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: 'label-service-integration-bus', image: image.toString('base64'), points: [{ x: x + w / 2, y: y + h * 0.4, label: 1 }] }),
      signal: AbortSignal.timeout(30_000)
    });
    expect(segmented.status).toBe(200);
    const result = await segmented.json() as { rle: string; width: number; height: number };
    const { tasks, job } = await fixture(1);
    const id = tasks[0]._id;
    await LabelTask.updateOne({ _id: id }, { $set: { 'frame.width': result.width, 'frame.height': result.height } });
    // SAM returns binary value 1. The editor paints it as its chosen class;
    // this job's first mask class has the same index.
    const saved = await request(`/tasks/${id}/annotation/mask`, 'ann', 'PUT', Buffer.from(result.rle, 'base64'), 'application/octet-stream');
    expect(saved.status).toBe(200);
    expect((await request(`/tasks/${id}/annotation/done`, 'ann', 'POST', {})).status).toBe(200);
    const annotation = await LabelAnnotation.findOne({ taskId: id });
    const png = decodePng(stored.get(annotation!.mask!.fileId)!);
    expect([png.width, png.height]).toEqual([result.width, result.height]);
    expect(Array.from(png.data).filter((value) => value === 1).length).toBeGreaterThan(100_000);
    expect(new Set(png.data)).toEqual(new Set([0, 1]));
    expect((await LabelJob.findById(job._id))!.status).toBe('completed');
  }, 120_000);

  it.each(['yolo', 'coco', 'voc', 'semantic-png', 'visin'])('preserves finished empty frames through %s export and import', async (format) => {
    const { tasks, job } = await fixture(1);
    await request(`/tasks/${tasks[0]._id}/annotation/done`, 'ann', 'POST', {});
    const exported = await request(`/jobs/${job.id}/export?format=${format}`, 'owner');
    expect(exported.status).toBe(200);
    // The new job has the same stems and no labels of its own.
    const target = await fixture(1);
    const imported = await request(`/jobs/${target.job.id}/import?as=done`, 'owner', 'POST', exported.raw, 'application/zip');
    expect(imported.status).toBe(200);
    expect(await LabelAnnotation.findOne({ taskId: target.tasks[0]._id })).toMatchObject({ status: 'done', objects: [] });
    expect((await LabelTask.findById(target.tasks[0]._id))!.answersCount).toBe(1);
    expect((await LabelJob.findById(target.job._id))!.status).toBe('completed');
  });

  it('counts concurrent completions by the same annotator once', async () => {
    const { tasks, job } = await fixture(1, 2);
    const user = { id: actors.ann, email: 'ann@example.test' };
    // Both requests saw no previous annotation before either wrote. The real
    // database still handles the upserts and counter updates below.
    const prior = jest.spyOn(LabelAnnotation, 'findOne');
    prior.mockImplementationOnce(() => Promise.resolve(null) as unknown as ReturnType<typeof LabelAnnotation.findOne>);
    prior.mockImplementationOnce(() => Promise.resolve(null) as unknown as ReturnType<typeof LabelAnnotation.findOne>);
    try {
      await Promise.all([finishTask(tasks[0], job, user, 'done'), finishTask(tasks[0], job, user, 'done')]);
    } finally {
      prior.mockRestore();
    }
    const task = await LabelTask.findById(tasks[0]._id);
    expect(task!.answersCount).toBe(1);
    expect(task!.answeredBy).toEqual([actors.ann]);
    expect((await LabelJob.findById(job._id))!.status).toBe('active');
    await finishTask(tasks[0], job, { id: actors.bea, email: 'bea@example.test' }, 'done');
    expect((await LabelTask.findById(tasks[0]._id))!.answersCount).toBe(2);
    expect((await LabelJob.findById(job._id))!.status).toBe('completed');
  });

  it('saves boxes as a draft, replaces them, and serves them back as the annotator’s own', async () => {
    const { tasks } = await fixture();
    const id = tasks[0]._id.toString();

    expect((await request(`/tasks/${id}/annotation`, 'ann', 'PUT', { objects: [box('a')] })).status).toBe(200);
    const second = await request(`/tasks/${id}/annotation`, 'ann', 'PUT', { objects: [box('b', [-2, 0, 20, 2])], elapsedMs: 900 });
    expect(second.json?.data).toMatchObject({ status: 'draft', objects: [{ id: 'b', bbox: [0, 0, 8, 2] }] });

    const item = await request(`/tasks/${id}`, 'ann');
    const annotation = item.json?.data?.annotation as { mine: { objects: unknown[]; status: string }; count: number };
    expect(annotation.mine.objects).toHaveLength(1);
    expect(annotation.count).toBe(0);
    expect(await LabelAnnotation.countDocuments()).toBe(1);
  });

  it('stores a mask as a PNG, replaces it, and clears it', async () => {
    const { tasks } = await fixture();
    const id = tasks[0]._id.toString();
    const pixels = new Array(32).fill(0);
    pixels[0] = 1;
    pixels[9] = 2;

    const first = await request(`/tasks/${id}/annotation/mask`, 'ann', 'PUT', maskBytes(pixels), 'application/octet-stream');
    expect(first.status).toBe(200);
    const saved = await LabelAnnotation.findOne({ taskId: id });
    expect(saved!.mask).toMatchObject({ width: 8, height: 4, pixels: { '1': 1, '2': 1 } });
    expect(Array.from(decodePng(stored.get(saved!.mask!.fileId)!).data.slice(0, 10))).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 2]);

    pixels[1] = 1;
    await request(`/tasks/${id}/annotation/mask`, 'ann', 'PUT', maskBytes(pixels), 'application/octet-stream');
    const replaced = await LabelAnnotation.findOne({ taskId: id });
    expect(replaced!.mask!.fileId).not.toBe(saved!.mask!.fileId);
    await new Promise((resolve) => setImmediate(resolve));
    expect(stored.has(saved!.mask!.fileId)).toBe(false);

    const item = await request(`/tasks/${id}`, 'ann');
    expect((item.json?.data?.annotation as { mine: { mask: { url: string } } }).mine.mask.url).toContain(replaced!.mask!.fileId);

    expect((await request(`/tasks/${id}/annotation/mask`, 'ann', 'DELETE')).status).toBe(200);
    expect((await LabelAnnotation.findOne({ taskId: id }))!.mask).toBeUndefined();
  });

  it('refuses a mask of the wrong size or with a box-only value', async () => {
    const { tasks } = await fixture();
    const id = tasks[0]._id.toString();

    const wrong = encodeMaskRle({ width: 2, height: 2, data: new Uint8Array(4) });
    expect((await request(`/tasks/${id}/annotation/mask`, 'ann', 'PUT', wrong, 'application/octet-stream')).status).toBe(400);
    expect((await request(`/tasks/${id}/annotation/mask`, 'ann', 'PUT', maskBytes(new Array(32).fill(7)), 'application/octet-stream')).status).toBe(400);
  });

  it('skips a frame, reopens it when the annotator draws on it, and finishes it', async () => {
    const { tasks, job } = await fixture(1);
    const id = tasks[0]._id.toString();

    expect((await request(`/tasks/${id}/annotation/skip`, 'ann', 'POST', {})).status).toBe(200);
    expect((await LabelTask.findById(id))!.skippedBy).toEqual([actors.ann]);
    // Not handed to the annotator who skipped it, still handed to another.
    expect((await request(`/jobs/${job.id}/next`, 'ann', 'POST', {})).json?.data).toBeNull();
    expect(((await request(`/jobs/${job.id}/next`, 'bea', 'POST', {})).json?.data as { task: { _id: string } }).task._id).toBe(id);

    const reopened = await request(`/tasks/${id}/annotation`, 'ann', 'PUT', { objects: [box('a')] });
    expect(reopened.status).toBe(200);
    expect(reopened.json?.data).toMatchObject({ status: 'draft' });
    expect((await LabelTask.findById(id))!.skippedBy).toEqual([]);

    expect((await request(`/tasks/${id}/annotation/done`, 'ann', 'POST', { elapsedMs: 1200 })).status).toBe(200);
    const task = await LabelTask.findById(id);
    expect(task!.answersCount).toBe(1);
    expect(task!.answeredBy).toEqual([actors.ann]);
    // The only frame is done, so the job is.
    expect((await LabelJob.findById(job.id))!.status).toBe('completed');

    // Revising it after the job completed is allowed, and does not count twice.
    expect((await request(`/tasks/${id}/annotation`, 'ann', 'PUT', { objects: [] })).status).toBe(200);
    expect((await request(`/tasks/${id}/annotation/done`, 'ann', 'POST', {})).status).toBe(200);
    expect((await LabelTask.findById(id))!.answersCount).toBe(1);
    expect((await request(`/tasks/${id}/annotation/skip`, 'ann', 'POST', {})).status).toBe(409);
    // A new annotator cannot start on a completed job.
    expect((await request(`/tasks/${id}/annotation`, 'bea', 'PUT', { objects: [] })).status).toBe(409);
  });

  it('finishes a frame nobody had saved anything on, as an empty frame', async () => {
    const { tasks } = await fixture(2);
    const id = tasks[0]._id.toString();

    expect((await request(`/tasks/${id}/annotation/done`, 'ann', 'POST', {})).status).toBe(200);

    expect(await LabelAnnotation.findOne({ taskId: id })).toMatchObject({ status: 'done', objects: [] });
  });

  it('exports what was finished, as YOLO and as the Visin bundle', async () => {
    const { tasks, job } = await fixture(2);
    const id = tasks[0]._id.toString();
    await request(`/tasks/${id}/annotation`, 'ann', 'PUT', { objects: [box('a', [0, 0, 4, 2])] });
    await request(`/tasks/${id}/annotation/mask`, 'ann', 'PUT', maskBytes(new Array(32).fill(2)), 'application/octet-stream');
    await request(`/tasks/${id}/annotation/done`, 'ann', 'POST', {});
    // A draft on the other frame is not exported by default.
    await request(`/tasks/${tasks[1]._id}/annotation`, 'ann', 'PUT', { objects: [box('b')] });

    const read = async (format: string, include = 'done') => {
      const response = await request(`/jobs/${job.id}/export?format=${format}&include=${include}`, 'owner');
      expect(response.status).toBe(200);
      const path = join(folder, `${format}-${include}.zip`);
      await writeFile(path, response.raw);
      const archive = await openZip(path);
      const out: Record<string, string> = {};
      for (const entry of archive.entries) out[entry.name] = (await archive.read(entry)).toString('latin1');
      await archive.close();
      return out;
    };

    const yolo = await read('yolo');
    expect(Object.keys(yolo)).toEqual(['labels/0000.txt', 'data.yaml']);
    expect(yolo['labels/0000.txt']).toBe('0 0.25 0.25 0.5 0.5\n');

    const native = await read('visin', 'all');
    expect(Object.keys(native).sort()).toEqual(['annotations.jsonl', 'job.json', 'masks/0000.png']);
    expect(native['annotations.jsonl'].trim().split('\n')).toHaveLength(2);

    // Only someone who runs the job may take its labels.
    expect((await request(`/jobs/${job.id}/export?format=yolo`, 'ann')).status).toBe(403);
  });

  it('imports labels as suggestions that another annotator then sees, and as finished labels', async () => {
    const { tasks, job } = await fixture(2);
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (chunk: Buffer) => chunks.push(chunk));
    const writer = new ZipWriter(out);
    await writer.add('data.yaml', 'names: [car, bus]\n');
    await writer.add('labels/0000.txt', '0 0.5 0.5 0.5 0.5\n1 0.25 0.25 0.25 0.25\n');
    await writer.add('labels/0009.txt', '0 0.5 0.5 0.5 0.5\n');
    await writer.finish();
    out.end();
    const archive = Buffer.concat(chunks);

    const preview = await request(`/jobs/${job.id}/import?dryRun=true`, 'owner', 'POST', archive, 'application/zip');
    expect(preview.status).toBe(200);
    expect(preview.json?.data).toMatchObject({ format: 'yolo', frames: { matched: 1, unmatched: 1, unmatchedSample: ['0009'] } });
    expect(await LabelSuggestion.countDocuments()).toBe(0);

    const classMap = encodeURIComponent(JSON.stringify({ bus: '+' }));
    const done = await request(`/jobs/${job.id}/import?classMap=${classMap}`, 'owner', 'POST', archive, 'application/zip');
    expect(done.status).toBe(200);
    expect(done.json?.data).toMatchObject({ createdClasses: ['bus'], boxes: 2 });
    expect((await LabelJob.findById(job.id))!.classes.map((entry) => entry.key)).toEqual(['car', 'road', 'bus']);

    const item = await request(`/tasks/${tasks[0]._id}`, 'bea');
    const suggestions = item.json?.data?.suggestions as { objects: { classKey: string; bbox: number[] }[] };
    expect(suggestions.objects.map((object) => object.classKey)).toEqual(['car', 'bus']);
    expect(suggestions.objects[0].bbox).toEqual([2, 1, 4, 2]);

    // Importing the same archive again replaces the suggestions, it does not add to them.
    await request(`/jobs/${job.id}/import`, 'owner', 'POST', archive, 'application/zip');
    expect(await LabelSuggestion.countDocuments()).toBe(1);

    const finished = await request(`/jobs/${job.id}/import?as=done`, 'owner', 'POST', archive, 'application/zip');
    expect(finished.status).toBe(200);
    expect(await LabelAnnotation.findOne({ taskId: tasks[0]._id })).toMatchObject({ status: 'done', userId: actors.owner });
    expect((await LabelTask.findById(tasks[0]._id))!.answersCount).toBe(1);

    // An annotator may not import.
    expect((await request(`/jobs/${job.id}/import`, 'ann', 'POST', archive, 'application/zip')).status).toBe(403);
  });

  it('counts progress and stats from what annotators did', async () => {
    const { tasks, job } = await fixture(3);
    await request(`/tasks/${tasks[0]._id}/annotation`, 'ann', 'PUT', { objects: [box('a'), box('b')] });
    await request(`/tasks/${tasks[0]._id}/annotation/done`, 'ann', 'POST', {});
    await request(`/tasks/${tasks[1]._id}/annotation/skip`, 'bea', 'POST', {});

    const detail = await request(`/jobs/${job.id}`, 'ann');
    expect(detail.json?.data?.progress).toEqual({ tasks: 3, completed: 1, done: 1, skipped: 1, myDone: 1 });

    const stats = await request(`/jobs/${job.id}/stats`, 'owner');
    expect(stats.json?.data).toMatchObject({ done: 1, skipped: 1, objects: 2 });
    expect((stats.json?.data?.perClass as { classKey: string; boxes: number }[])[0]).toMatchObject({ classKey: 'car', boxes: 2 });
  });
});
