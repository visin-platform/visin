import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { createHash, createHmac } from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errorHandler, logger } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { deleteFiles, getFileStream } from '../../clients/fileServiceClient';
import { identityContextMiddleware } from '../../middleware/requestIdentityContext';
import Project from '../../models/Project';
import Training from '../../models/Training';
import UploadReservation from '../../models/UploadReservation';
import Epoch from '../../models/Epoch';
import EpochVisualization from '../../models/EpochVisualization';
import Evaluation from '../../models/Evaluation';
import modelRoutes from '../../routes/modelRoutes';
import { unzip } from '../fixtures/unzip';
import trainingRoutes from '../../routes/trainingRoutes';
import { purgeTrainings } from '../../services/purgeService';
import { scheduleVerification, verifyPendingModels } from '../../services/modelVerificationService';
import { modelLinkKey } from '../../services/sourceRegistry';

const mockFiles = new Map<string, Buffer>();
jest.mock('../../clients/fileServiceClient', () => {
  const { Readable } = jest.requireActual('stream');
  const { NotFoundError } = jest.requireActual('@visin/backend-core');
  return {
    getUploadSignedUrl: jest.fn(async (fileId: string) => `upload:${fileId}`),
    getFileMetadata: jest.fn(async (fileId: string) => {
      const file = mockFiles.get(fileId);
      if (!file) throw new NotFoundError('File not found');
      return {
        size: file.length,
        lastModified: '',
        etag: fileId,
        contentType: 'application/octet-stream',
        metadata: {}
      };
    }),
    getFileStream: jest.fn(async (fileId: string, range?: { start: number; end: number }) => {
      const file = mockFiles.get(fileId);
      if (!file) throw new NotFoundError('File not found');
      return Readable.from([range ? file.subarray(range.start, range.end + 1) : file]);
    }),
    deleteFile: jest.fn(async (fileId: string) => mockFiles.delete(fileId)),
    deleteFiles: jest.fn(async (fileIds: string[]) => fileIds.forEach((fileId) => mockFiles.delete(fileId)))
  };
});
jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
const membership = jest.fn();
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  createGroupServiceClient: () => ({ checkMembership: membership, getMyGroups: jest.fn(async () => []) })
}));

const OWNER = '000000000000000000000001';
const MEMBER = '000000000000000000000003';
const STRANGER = '000000000000000000000004';
const GROUP = '0000000000000000000000aa';

/** PyTorch's zip container, which is how file-service recognises a checkpoint. */
const weights = (fill: number, length = 2048) =>
  Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(length, fill)]);
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

describe('models kept on this deployment', () => {
  let mongo: MongoMemoryServer;
  let server: Server;
  let baseUrl: string;
  const secret = 'stored-models-test-secret';
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json(), identityContextMiddleware);
    app.use('/trainings', trainingRoutes);
    app.use('/models', modelRoutes);
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  beforeEach(async () => {
    const ids = [OWNER, MEMBER, STRANGER].map((id) => new mongoose.Types.ObjectId(id));
    await mongoose.connection
      .collection('users')
      .insertMany(ids.map((_id) => ({ _id, email: `${_id}@example.test`, tokenVersion: 1 })));
    await mongoose.connection
      .collection('user_sessions')
      .insertMany(ids.map((_id) => ({ _id, userId: _id, expiresAt: new Date(Date.now() + 3_600_000) })));
    jest
      .mocked(getUserGroups)
      .mockImplementation(async (userId) =>
        userId === MEMBER
          ? [{ id: GROUP, name: 'Team', role: 'member' }]
          : userId === OWNER
            ? [{ id: GROUP, name: 'Team', role: 'owner' }]
            : []
      );
    membership.mockImplementation(async (_group: string, userId: string) =>
      userId === MEMBER
        ? { member: true, role: 'member' }
        : userId === OWNER
          ? { member: true, role: 'owner' }
          : { member: false, role: null }
    );
  });
  afterEach(async () => {
    mockFiles.clear();
    jest.clearAllMocks();
    await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  });
  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await mongoose.disconnect();
    } finally {
      await mongo?.stop();
    }
  });

  const tokenFor = (user: string) => {
    const unsigned = [
      { alg: 'HS256', typ: 'JWT' },
      {
        id: user,
        email: `${user}@example.test`,
        tokenVersion: 1,
        sid: user,
        typ: 'session',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60
      }
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
    return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Body = { data: any; message?: string };
  const call = async (
    path: string,
    { method = 'GET', user = MEMBER, body }: { method?: string; user?: string; body?: unknown } = {}
  ) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${tokenFor(user)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
  };
  const raw = (path: string, headers: Record<string, string> = {}, { user = MEMBER, method = 'GET' } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...headers, ...(user ? { Authorization: `Bearer ${tokenFor(user)}` } : {}) }
    });

  const project = async (visibility: 'public' | 'private' = 'private') =>
    String(
      (
        await Project.create({
          name: 'Team project',
          owner: { kind: 'group', id: GROUP },
          createdBy: OWNER,
          visibility
        })
      )._id
    );
  const run = async (projectId: string) =>
    String(
      (
        await Training.create({
          uuid: `run-${new mongoose.Types.ObjectId()}`,
          name: 'ISEAUTO CLFT Large',
          ownerId: MEMBER,
          projectId
        })
      )._id
    );

  /** Reserve, "upload" into the stand-in store, and claim, as a pipeline does. */
  const publish = async (
    trainingId: string,
    data: Buffer,
    link: Record<string, unknown> = {},
    format: 'pth' | 'onnx' = 'pth'
  ) => {
    const reserved = await call(`/trainings/${trainingId}/models/upload-url`, {
      method: 'POST',
      body: { format, size: data.length }
    });
    expect(reserved.status).toBe(201);
    const fileId = reserved.body.data.fileId as string;
    mockFiles.set(fileId, data);
    const claimed = await call(`/trainings/${trainingId}/models`, {
      method: 'POST',
      body: { provider: 'visin', fileId, format, epoch: 99, license: { id: 'cc-by-4.0' }, credit: 'TalTech', ...link }
    });
    return { fileId, claimed };
  };
  const settled = async (trainingId: string, status = 'ready') => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const models = (await Training.findById(trainingId).lean())?.models ?? [];
      if (models.length && models.every((model) => (model as { status?: string }).status !== 'verifying')) {
        const found = models.find((model) => (model as { status?: string }).status === status) ?? models[0];
        return found as unknown as Record<string, unknown> & { _id: mongoose.Types.ObjectId };
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('verification did not finish');
  };

  const scheduleVerificationNow = async (trainingId: string, modelId: string) =>
    (await import('../../services/modelVerificationService')).verifyModel(trainingId, modelId);

  describe('uploading', () => {
    it('reserves a file named for the run, in the format asked for', async () => {
      const trainingId = await run(await project());
      const reserved = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        body: { format: 'onnx' }
      });
      expect(reserved.status).toBe(201);
      expect(reserved.body.data.fileId).toMatch(new RegExp(`^models/${trainingId}/[0-9a-f-]{36}\\.onnx$`));
      expect(reserved.body.data).toMatchObject({
        uploadUrl: `upload:${reserved.body.data.fileId}`,
        expiresInMinutes: 240
      });
      expect(reserved.body.data.maxBytes).toBe(4 * 1024 ** 3);
      const reservation = await UploadReservation.findOne({ fileId: reserved.body.data.fileId }).lean();
      expect(reservation).toMatchObject({ kind: 'checkpoint', parentId: trainingId, ownerId: MEMBER });
    });

    it('refuses a format that is not a checkpoint, and a file over this deployment’s limit', async () => {
      const trainingId = await run(await project());
      expect(
        (await call(`/trainings/${trainingId}/models/upload-url`, { method: 'POST', body: { format: 'zip' } })).status
      ).toBe(400);
      const limit = 4 * 1024 ** 3;
      const tooBig = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        body: { format: 'pth', size: limit + 1 }
      });
      expect(tooBig.status).toBe(400);
      expect(tooBig.body.message).toMatch(new RegExp(`at most ${limit} bytes`));
      expect(await UploadReservation.countDocuments()).toBe(0);
      const fits = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        body: { format: 'pth', size: limit }
      });
      expect(fits.status).toBe(201);
      expect(fits.body.data.maxBytes).toBe(limit);
    });

    it('stops at the run’s limit of linked models', async () => {
      const trainingId = await run(await project());
      const models = Array.from({ length: 50 }, (_, index) => ({
        provider: 'hf',
        kind: 'model',
        repo: `acme/m${index}`,
        revision: 'a'.repeat(40)
      }));
      await Training.updateOne({ _id: trainingId }, { $set: { models } });
      const full = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        body: { format: 'pth' }
      });
      expect(full.status).toBe(400);
      expect(full.body.message).toMatch(/at most 50 models/);
    });

    it('is for someone who may write to the run', async () => {
      const trainingId = await run(await project());
      const refused = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        user: STRANGER,
        body: { format: 'pth' }
      });
      expect(refused.status).toBeGreaterThanOrEqual(403);
      expect(await UploadReservation.countDocuments()).toBe(0);
    });
  });

  describe('claiming', () => {
    it('links the file at once as verifying, then reads it once and records its digest', async () => {
      const trainingId = await run(await project());
      const data = weights(7);
      const { fileId, claimed } = await publish(trainingId, data);

      expect(claimed.status).toBe(201);
      const linked = claimed.body.data[0];
      expect(linked).toMatchObject({
        provider: 'visin',
        format: 'pth',
        epoch: 99,
        fileId,
        size: data.length,
        filename: 'ISEAUTO_CLFT_Large-epoch99.pth',
        status: 'verifying'
      });
      expect(linked.sha256).toBeUndefined();

      const model = await settled(trainingId);
      expect(model).toMatchObject({ status: 'ready', sha256: sha256(data), size: data.length });
      expect(model.verifyingUntil).toBeUndefined();
    });

    it('accepts a retry of the same claim as the same link, and refuses a different file for the same slot', async () => {
      const trainingId = await run(await project());
      const { fileId } = await publish(trainingId, weights(1));
      await settled(trainingId);
      const again = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId, format: 'pth', epoch: 99 }
      });
      expect(again.status).toBe(200);
      expect(again.body.data).toHaveLength(1);

      const second = await publish(trainingId, weights(2));
      expect(second.claimed.status).toBe(409);
      expect(second.claimed.body.message).toMatch(/unlink it before replacing/);
      expect((await Training.findById(trainingId))?.models).toHaveLength(1);
    });

    it('refuses a claim in the wrong format and a second link to the same uploaded bytes', async () => {
      const trainingId = await run(await project());
      const reserved = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        body: { format: 'pth' }
      });
      const fileId = reserved.body.data.fileId;
      mockFiles.set(fileId, weights(1));
      const wrongFormat = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId, format: 'onnx', sourceSha256: 'a'.repeat(64) }
      });
      expect(wrongFormat.status).toBe(400);
      const linked = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId, format: 'pth', epoch: 99 }
      });
      expect(linked.status).toBe(201);
      await settled(trainingId);
      const duplicated = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId, format: 'pth', epoch: 100 }
      });
      expect(duplicated.status).toBe(409);
      expect((await Training.findById(trainingId))?.models).toHaveLength(1);
    });

    it('refuses a file that was never reserved for this run', async () => {
      const trainingId = await run(await project());
      const other = await run(await project());
      const { fileId } = await publish(other, weights(1));
      const stolen = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId, format: 'pth' }
      });
      expect(stolen.status).toBe(403);
      mockFiles.set(`models/${trainingId}/unreserved.pth`, weights(1));
      const forged = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId: `models/${trainingId}/unreserved.pth`, format: 'pth' }
      });
      expect(forged.status).toBe(403);
    });

    it('refuses a claim whose upload did not arrive', async () => {
      const trainingId = await run(await project());
      const reserved = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        body: { format: 'pth' }
      });
      const claim = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId: reserved.body.data.fileId, format: 'pth' }
      });
      expect(claim.status).toBe(400);
      expect((await Training.findById(trainingId))?.models).toBeUndefined();
    });

    it('fails and deletes bytes with the wrong digest, requiring an unlink before replacing the model', async () => {
      const trainingId = await run(await project());
      const { fileId, claimed } = await publish(trainingId, weights(3), { sha256: 'a'.repeat(64) });
      expect(claimed.status).toBe(201);
      const failed = await settled(trainingId, 'failed');
      expect(failed).toMatchObject({
        status: 'failed',
        verifyError: 'The file does not match the SHA-256 that was declared'
      });
      expect(mockFiles.has(fileId)).toBe(false);

      const retry = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId, format: 'pth', epoch: 99 }
      });
      expect(retry.status).toBe(200);
      expect(retry.body.data[0].status).toBe('failed');
      const replacement = await publish(trainingId, weights(4));
      expect(replacement.claimed.status).toBe(409);
      expect((await call(`/trainings/${trainingId}/models/${failed._id}`, { method: 'DELETE' })).status).toBe(200);
      const data = weights(4);
      const retried = await publish(trainingId, data, { sha256: sha256(data) });
      expect(retried.claimed.status).toBe(201);
      const models = (await Training.findById(trainingId).lean())?.models ?? [];
      expect(models).toHaveLength(1);
      expect(await settled(trainingId)).toMatchObject({ status: 'ready', sha256: sha256(data) });
    });

    it('fails a file whose stored size is not the size that arrived', async () => {
      const trainingId = await run(await project());
      const { fileId } = await publish(trainingId, weights(5));
      await settled(trainingId);
      const model = (await Training.findById(trainingId).lean())!.models![0] as { _id: mongoose.Types.ObjectId };
      await Training.updateOne(
        { _id: trainingId, 'models._id': model._id },
        { $set: { 'models.$.status': 'verifying' }, $unset: { 'models.$.sha256': '' } }
      );
      mockFiles.set(fileId, weights(5, 10));
      await verifyPendingModels();
      expect(await settled(trainingId, 'failed')).toMatchObject({
        status: 'failed',
        verifyError: expect.stringMatching(/is \d+ bytes, not the/)
      });
    });

    it('fails a model whose file is gone, and leaves one it merely could not read for the next sweep', async () => {
      const trainingId = await run(await project());
      const { fileId } = await publish(trainingId, weights(6));
      const ready = await settled(trainingId);
      await Training.updateOne(
        { _id: trainingId, 'models._id': ready._id },
        { $set: { 'models.$.status': 'verifying' } }
      );

      jest.mocked(getFileStream).mockRejectedValueOnce(new Error('file-service restarting'));
      await verifyPendingModels();
      let model = (await Training.findById(trainingId).lean())!.models![0] as unknown as {
        status: string;
        verifyingUntil?: Date;
      };
      expect(model.status).toBe('verifying');
      expect(model.verifyingUntil).toBeUndefined();

      mockFiles.delete(fileId);
      await verifyPendingModels();
      model = (await Training.findById(trainingId).lean())!.models![0] as unknown as { status: string };
      expect(model.status).toBe('failed');
    });

    it('gives up on a model it has been unable to read for a day, with the reason', async () => {
      const trainingId = await run(await project());
      await publish(trainingId, weights(6));
      const ready = await settled(trainingId);
      await Training.updateOne(
        { _id: trainingId, 'models._id': ready._id },
        { $set: { 'models.$.status': 'verifying', 'models.$.addedAt': new Date(Date.now() - 25 * 3_600_000) } }
      );
      jest.mocked(getFileStream).mockRejectedValueOnce(new Error('file-service restarting'));
      await verifyPendingModels();
      expect(await settled(trainingId, 'failed')).toMatchObject({
        status: 'failed',
        verifyError: 'The file could not be read'
      });
    });

    it('logs, rather than throws, when a verification fails in a way nobody expected', async () => {
      const trainingId = await run(await project());
      const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
      jest.spyOn(Training, 'findOneAndUpdate').mockRejectedValueOnce(new Error('database went away'));
      scheduleVerification(trainingId, String(new mongoose.Types.ObjectId()));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(error).toHaveBeenCalledWith(
        'Model verification failed unexpectedly',
        expect.objectContaining({ error: 'database went away' })
      );
      error.mockRestore();
    });

    it('does nothing for a model that is no longer there, or no longer waiting', async () => {
      const trainingId = await run(await project());
      await publish(trainingId, weights(6));
      const ready = await settled(trainingId);
      jest.mocked(getFileStream).mockClear();
      await scheduleVerificationNow(trainingId, String(ready._id)); // already ready
      await scheduleVerificationNow(trainingId, String(new mongoose.Types.ObjectId()));
      expect(getFileStream).not.toHaveBeenCalled();
    });

    it('refuses a claim whose reservation ran out before it was claimed', async () => {
      const trainingId = await run(await project());
      const reserved = await call(`/trainings/${trainingId}/models/upload-url`, {
        method: 'POST',
        body: { format: 'pth' }
      });
      const { fileId } = reserved.body.data;
      mockFiles.set(fileId, weights(1));
      await UploadReservation.updateOne({ fileId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const late = await call(`/trainings/${trainingId}/models`, {
        method: 'POST',
        body: { provider: 'visin', fileId, format: 'pth' }
      });
      expect(late.status).toBe(403);
      expect(late.body.message).toMatch(/expired/);
    });

    it('does not read a model another worker holds', async () => {
      const trainingId = await run(await project());
      await publish(trainingId, weights(8));
      const ready = await settled(trainingId);
      await Training.updateOne(
        { _id: trainingId, 'models._id': ready._id },
        { $set: { 'models.$.status': 'verifying', 'models.$.verifyingUntil': new Date(Date.now() + 60_000) } }
      );
      jest.mocked(getFileStream).mockClear();
      expect(await verifyPendingModels()).toBe(0);
      expect(getFileStream).not.toHaveBeenCalled();
    });
  });

  describe('serving', () => {
    const url = (trainingId: string, modelId: unknown) => `/trainings/${trainingId}/models/${String(modelId)}/file`;

    it('sends the file with its digest, resumable, to anyone who may read a public run', async () => {
      const trainingId = await run(await project('public'));
      const data = weights(9, 4096);
      await publish(trainingId, data);
      const model = await settled(trainingId);

      const whole = await raw(url(trainingId, model._id), {}, { user: '' });
      expect(whole.status).toBe(200);
      expect(whole.headers.get('content-length')).toBe(String(data.length));
      expect(whole.headers.get('content-disposition')).toBe('attachment; filename="ISEAUTO_CLFT_Large-epoch99.pth"');
      expect(whole.headers.get('repr-digest')).toBe(`sha-256=:${Buffer.from(sha256(data), 'hex').toString('base64')}:`);
      expect(whole.headers.get('accept-ranges')).toBe('bytes');
      expect(Buffer.from(await whole.arrayBuffer()).equals(data)).toBe(true);

      const tag = whole.headers.get('etag')!;
      const rest = await raw(url(trainingId, model._id), { Range: 'bytes=1000-', 'If-Range': tag }, { user: '' });
      expect(rest.status).toBe(206);
      expect(rest.headers.get('content-range')).toBe(`bytes 1000-${data.length - 1}/${data.length}`);
      expect(Buffer.from(await rest.arrayBuffer()).equals(data.subarray(1000))).toBe(true);
      expect(
        (await raw(url(trainingId, model._id), {}, { user: '', method: 'HEAD' })).headers.get('content-length')
      ).toBe(String(data.length));
    });

    it('counts the request that starts a download, not a resume or a HEAD', async () => {
      const trainingId = await run(await project('public'));
      await publish(trainingId, weights(9, 4096));
      const model = await settled(trainingId);
      const info = jest.spyOn(logger, 'info').mockImplementation(() => logger);
      const downloads = () => info.mock.calls.filter(([message]) => message === 'Model downloaded').length;

      await (await raw(url(trainingId, model._id), {}, { user: '' })).arrayBuffer();
      expect(downloads()).toBe(1);
      await (await raw(url(trainingId, model._id), { Range: 'bytes=0-99' }, { user: '' })).arrayBuffer();
      expect(downloads()).toBe(2);
      await (await raw(url(trainingId, model._id), { Range: 'bytes=100-' }, { user: '' })).arrayBuffer();
      await raw(url(trainingId, model._id), {}, { user: '', method: 'HEAD' });
      expect(downloads()).toBe(2);
      info.mockRestore();
    });

    it('keeps a private run’s model from anyone who may not read the run', async () => {
      const trainingId = await run(await project('private'));
      await publish(trainingId, weights(1));
      const model = await settled(trainingId);
      expect((await raw(url(trainingId, model._id), {}, { user: MEMBER })).status).toBe(200);
      expect((await raw(url(trainingId, model._id), {}, { user: STRANGER })).status).toBe(403);
      expect((await raw(url(trainingId, model._id), {}, { user: '' })).status).toBeGreaterThanOrEqual(401);
    });

    it('serves no model without a stated licence, while it is verifying, or after it failed', async () => {
      const trainingId = await run(await project('public'));
      await publish(trainingId, weights(1), { license: undefined, epoch: 1 });
      const unlicensed = await settled(trainingId);
      const refusedLicence = await raw(url(trainingId, unlicensed._id), {}, { user: '' });
      expect(refusedLicence.status).toBe(409);
      expect((await refusedLicence.json()).message).toMatch(/no licence/);

      await Training.updateOne(
        { _id: trainingId, 'models._id': unlicensed._id },
        { $set: { 'models.$.status': 'verifying', 'models.$.license': { id: 'cc-by-4.0' } } }
      );
      const waiting = await raw(url(trainingId, unlicensed._id), {}, { user: '' });
      expect(waiting.status).toBe(409);
      expect((await waiting.json()).message).toMatch(/still being verified/);

      await Training.updateOne(
        { _id: trainingId, 'models._id': unlicensed._id },
        { $set: { 'models.$.status': 'failed', 'models.$.verifyError': 'bad digest' } }
      );
      expect((await (await raw(url(trainingId, unlicensed._id), {}, { user: '' })).json()).message).toMatch(
        /failed verification: bad digest/
      );
    });

    it('is not offered for a pointer to the Hub, an unknown model or a deleted run', async () => {
      const projectId = await project('public');
      const trainingId = await run(projectId);
      await Training.updateOne(
        { _id: trainingId },
        { $set: { models: [{ provider: 'hf', kind: 'model', repo: 'acme/m', revision: 'a'.repeat(40) }] } }
      );
      const hub = (await Training.findById(trainingId).lean())!.models![0] as unknown as {
        _id: mongoose.Types.ObjectId;
      };
      expect((await raw(url(trainingId, hub._id), {}, { user: '' })).status).toBe(404);
      expect((await raw(url(trainingId, new mongoose.Types.ObjectId()), {}, { user: '' })).status).toBe(404);
      expect((await raw(url(trainingId, 'nope'), {}, { user: '' })).status).toBe(400);

      await Training.updateOne({ _id: trainingId }, { $set: { deletedAt: new Date() } });
      expect((await raw(url(trainingId, hub._id), {}, { user: '' })).status).toBe(404);
    });
  });

  describe('keeping and removing', () => {
    it('removes the file with its link', async () => {
      const trainingId = await run(await project());
      const { fileId } = await publish(trainingId, weights(1));
      const model = await settled(trainingId);
      expect(mockFiles.has(fileId)).toBe(true);

      const removed = await call(`/trainings/${trainingId}/models/${model._id}`, { method: 'DELETE' });
      expect(removed.status).toBe(200);
      expect(removed.body.data).toEqual([]);
      expect(mockFiles.has(fileId)).toBe(false);
      expect(await UploadReservation.findOne({ fileId }).lean()).toMatchObject({ retired: true });
    });

    it('removes the files of a run that is deleted for good, and only the files it kept here', async () => {
      const trainingId = await run(await project());
      const { fileId } = await publish(trainingId, weights(1));
      await settled(trainingId);
      await Training.updateOne(
        { _id: trainingId },
        { $push: { models: { provider: 'hf', kind: 'model', repo: 'acme/m', revision: 'a'.repeat(40) } } }
      );

      await purgeTrainings([trainingId]);
      expect(jest.mocked(deleteFiles).mock.calls.flat(2)).toEqual([fileId]);
      expect(mockFiles.has(fileId)).toBe(false);
      expect(await Training.countDocuments()).toBe(0);
    });
  });

  describe('as one checkpoint', () => {
    it('names the .pth’s digest from both formats, so evaluations see one model', async () => {
      const trainingId = await run(await project());
      const pth = weights(1);
      const onnx = Buffer.concat([Buffer.from('0809', 'hex'), Buffer.alloc(512, 3)]);
      await publish(trainingId, pth);
      await publish(
        trainingId,
        onnx,
        { sourceSha256: sha256(pth), parity: { maxAbsDiff: 1e-6, argmaxMismatchFraction: 0, frames: 48 } },
        'onnx'
      );
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const models = (await Training.findById(trainingId).lean())?.models ?? [];
        if (models.length === 2 && models.every((model) => (model as { status?: string }).status === 'ready')) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const models = (await Training.findById(trainingId).lean())!.models!;
      expect(models.map((model) => (model as { format: string }).format).sort()).toEqual(['onnx', 'pth']);
      const keys = models.map((model) => modelLinkKey(model as never));
      expect(keys[0]).toBe(`sha256:${sha256(pth)}`);
      expect(keys[1]).toBe(keys[0]);
      expect(models.find((model) => (model as { format: string }).format === 'onnx')).toMatchObject({
        parity: { frames: 48 }
      });
    });

    it('keeps both formats together when paging or searching the registry', async () => {
      const projectId = await project('public');
      const trainingId = await run(projectId);
      const pth = weights(7);
      await publish(trainingId, pth);
      await settled(trainingId);
      await publish(trainingId, Buffer.alloc(200, 9), { sourceSha256: sha256(pth) }, 'onnx');
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (
          (await Training.findById(trainingId).lean())?.models?.every(
            (model) => (model as { status: string }).status === 'ready'
          )
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const listed = await call(`/models?projectId=${projectId}&limit=1`, { user: '' });
      expect(listed.body.data.pagination).toMatchObject({ total: 1, pages: 1, limit: 1 });
      expect(listed.body.data.models.map((row: { model: { format: string } }) => row.model.format).sort()).toEqual([
        'onnx',
        'pth'
      ]);
      expect((await call(`/models?projectId=${projectId}&limit=1&page=2`, { user: '' })).body.data.models).toEqual([]);
      expect((await call(`/models?projectId=${projectId}&search=.onnx`, { user: '' })).body.data.models).toHaveLength(
        2
      );
    });

    it('is listed with the other models, for anyone who may read the run', async () => {
      const projectId = await project('public');
      const trainingId = await run(projectId);
      await publish(trainingId, weights(1));
      await settled(trainingId);

      const listed = await call(`/models?projectId=${projectId}`, { user: '' });
      expect(listed.status).toBe(200);
      expect(listed.body.data.models).toHaveLength(1);
      expect(listed.body.data.models[0].model).toMatchObject({
        provider: 'visin',
        format: 'pth',
        status: 'ready',
        license: { id: 'cc-by-4.0' }
      });
    });
  });

  describe('the outputs bundle', () => {
    const bundle = (trainingId: string, modelId: unknown, query = '') =>
      `/trainings/${trainingId}/models/${String(modelId)}/bundle${query}`;
    const png = (fill: number) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(300, fill)]);

    /** A run whose epoch 99 produced masks, colourised maps and confidence for two frames, and was scored. */
    const scoredRun = async (visibility: 'public' | 'private' = 'public') => {
      const projectId = await project(visibility);
      const trainingId = await run(projectId);
      await Training.updateOne(
        { _id: trainingId },
        { $set: { dataset: { source: 'visin', id: 'iseauto', name: 'Iseauto', revision: '2026-02-17T00:00:00.000Z' } } }
      );
      await Epoch.collection.insertOne({
        trainingId,
        training_uuid: 'u',
        epoch_uuid: 'epoch-99',
        epoch: 99,
        timestamp: new Date(),
        results: { val: { mean_iou: 0.81 } }
      });
      await Epoch.collection.insertOne({
        trainingId,
        training_uuid: 'u',
        epoch_uuid: 'epoch-98',
        epoch: 98,
        timestamp: new Date(),
        results: {}
      });
      const frames: Record<string, Buffer> = {};
      for (const [type, fill] of [
        ['mask', 1],
        ['segment', 2],
        ['confidence', 3]
      ] as const) {
        for (const frame of ['sq11_000301.png', 'sq14_000061.png']) {
          const fileId = `visualizations/${type}/${frame}`;
          frames[`${type}/${frame}`] = png(fill + (frame.startsWith('sq14') ? 10 : 0));
          mockFiles.set(fileId, frames[`${type}/${frame}`]);
          await EpochVisualization.collection.insertOne({
            epoch_uuid: 'epoch-99',
            visualization_uuid: `${type}-${frame}`,
            filename: frame,
            type,
            fileId,
            uploadedAt: new Date(),
            metadata: { size: frames[`${type}/${frame}`].length }
          });
        }
      }
      // An overlay is not one of the bundle's folders, and another epoch's frames are not this model's.
      await EpochVisualization.collection.insertOne({
        epoch_uuid: 'epoch-99',
        visualization_uuid: 'o',
        filename: 'sq11_000301.png',
        type: 'overlay',
        fileId: 'visualizations/overlay',
        uploadedAt: new Date()
      });
      await EpochVisualization.collection.insertOne({
        epoch_uuid: 'epoch-98',
        visualization_uuid: 'm98',
        filename: 'sq99_000001.png',
        type: 'mask',
        fileId: 'visualizations/m98',
        uploadedAt: new Date()
      });
      await Evaluation.collection.insertOne({
        uuid: 'e1',
        projectId,
        ownerId: MEMBER,
        status: 'completed',
        receivedAt: new Date(),
        source: { trainingId, epochUuid: 'epoch-99', epoch: 99 },
        results: { day_fair: { vehicle: { iou: 0.83 } } },
        sampleCounts: { day_fair: 150 }
      });
      await Evaluation.collection.insertOne({
        uuid: 'e2',
        projectId,
        ownerId: MEMBER,
        status: 'completed',
        receivedAt: new Date(),
        source: { trainingId, epochUuid: 'epoch-98', epoch: 98 },
        results: { day_fair: {} }
      });
      return { projectId, trainingId, frames };
    };
    const readBundle = async (response: Response) => unzip(Buffer.from(await response.arrayBuffer()));

    it('lists a dataset’s visible runs with models, output kinds and best metrics, including both dataset reference styles', async () => {
      const { trainingId } = await scoredRun();
      await publish(trainingId, weights(1));
      await settled(trainingId);
      await Epoch.updateOne({ epoch_uuid: 'epoch-98' }, { $set: { results: { val: { mean_iou: 0.9 } } } });
      const legacyId = await run(await project('public'));
      await Training.updateOne({ _id: legacyId }, { $set: { datasetId: 'iseauto' } });
      const privateId = await run(await project('private'));
      await Training.updateOne({ _id: privateId }, { $set: { datasetId: 'iseauto' } });
      const deletedId = await run(await project('public'));
      await Training.updateOne({ _id: deletedId }, { $set: { datasetId: 'iseauto', deletedAt: new Date() } });
      await Epoch.collection.insertOne({
        trainingId,
        training_uuid: 'u',
        epoch_uuid: 'deleted-epoch',
        epoch: 100,
        timestamp: new Date(),
        deletedAt: new Date(),
        results: { val: { mean_iou: 1 } }
      });
      await EpochVisualization.collection.insertOne({
        epoch_uuid: 'deleted-epoch',
        visualization_uuid: 'deleted-output',
        type: 'private-output',
        filename: 'hidden.png',
        fileId: 'visualizations/deleted'
      });

      const response = await call('/trainings?dataset=iseauto', { user: '' });
      expect(response.status).toBe(200);
      expect(response.body.data.pagination.total).toBe(2);
      expect(response.body.data.trainings.map((training: { _id: string }) => training._id).sort()).toEqual(
        [trainingId, legacyId].sort()
      );
      const linked = response.body.data.trainings.find((training: { _id: string }) => training._id === trainingId);
      expect(linked.models).toHaveLength(1);
      expect(linked.visualizationTypes).toEqual(['confidence', 'mask', 'overlay', 'segment']);
      expect(linked.bestMetrics).toEqual([
        expect.objectContaining({
          path: 'val.mean_iou',
          direction: 'higher',
          best: { value: 0.9, epoch: 98 },
          last: { value: 0.81, epoch: 99 }
        })
      ]);
      const legacy = response.body.data.trainings.find((training: { _id: string }) => training._id === legacyId);
      expect(legacy.visualizationTypes).toEqual([]);
      expect(legacy.bestMetrics).toEqual([]);
      const alias = await call('/trainings?datasetId=iseauto', { user: '' });
      expect(alias.body.data.pagination.total).toBe(2);
      expect((await call('/trainings?dataset=other', { user: '' })).body.data.trainings).toEqual([]);
    });

    it('delivers the outputs, the scores and a manifest that names the model, in one zip', async () => {
      const { trainingId, frames } = await scoredRun();
      const pth = weights(5);
      await publish(trainingId, pth, { modelInfo: { backbone: 'clft', transforms: { resize: 384 } } });
      const model = await settled(trainingId);

      const response = await raw(bundle(trainingId, model._id), {}, { user: '' });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="ISEAUTO_CLFT_Large-epoch99-outputs.zip"'
      );
      expect(response.headers.get('content-length')).toBeNull();
      expect(response.headers.get('etag')).toBeNull();
      expect(response.headers.get('last-modified')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
      const files = await readBundle(response);

      expect([...files.keys()].sort()).toEqual([
        'confidence/sq11_000301.png',
        'confidence/sq14_000061.png',
        'manifest.json',
        'mask/sq11_000301.png',
        'mask/sq14_000061.png',
        'metrics.json',
        'segment/sq11_000301.png',
        'segment/sq14_000061.png'
      ]);
      for (const [path, data] of Object.entries(frames)) expect(files.get(path)!.equals(data)).toBe(true);

      const metrics = JSON.parse(files.get('metrics.json')!.toString());
      expect(metrics).toMatchObject({ epoch: 99, results: { val: { mean_iou: 0.81 } } });
      expect(metrics.evaluations).toHaveLength(1);
      expect(metrics.evaluations[0]).toMatchObject({
        results: { day_fair: { vehicle: { iou: 0.83 } } },
        sampleCounts: { day_fair: 150 }
      });

      const manifest = JSON.parse(files.get('manifest.json')!.toString());
      expect(manifest).toMatchObject({
        format: 1,
        run: { id: trainingId, name: 'ISEAUTO CLFT Large', epoch: 99, project: { name: 'Team project' } },
        model: {
          format: 'pth',
          sha256: sha256(pth),
          size: pth.length,
          epoch: 99,
          license: { id: 'cc-by-4.0', name: 'CC BY 4.0' },
          credit: 'TalTech',
          modelInfo: { backbone: 'clft' }
        },
        trainedOn: { source: 'visin', id: 'iseauto', revision: '2026-02-17T00:00:00.000Z' },
        sameCheckpoint: []
      });
      expect(manifest.model.file).toBe(`/api/trainings/${trainingId}/models/${model._id}/file`);
      expect(Object.keys(manifest.folders)).toEqual(['mask', 'segment', 'confidence']);
      expect(manifest.files).toHaveLength(6);
      const listed = manifest.files.find((file: { path: string }) => file.path === 'mask/sq14_000061.png');
      expect(listed).toMatchObject({
        folder: 'mask',
        frame: 'sq14_000061.png',
        size: frames['mask/sq14_000061.png'].length,
        sha256: sha256(frames['mask/sq14_000061.png'])
      });
    });

    it('names the prediction dataset and geometry separately from training data, leaving old outputs unattributed', async () => {
      const { trainingId } = await scoredRun();
      await EpochVisualization.updateMany(
        { epoch_uuid: 'epoch-99', type: { $in: ['mask', 'segment', 'confidence'] } },
        {
          $set: {
            'metadata.prediction': {
              dataset: { source: 'visin', id: 'sample', archiveRevision: 'sample-v1' },
              width: 1363,
              height: 768,
              confidenceEncoding: 'uint16'
            }
          }
        }
      );
      await publish(trainingId, weights(1));
      const model = await settled(trainingId);
      const manifest = JSON.parse(
        (await readBundle(await raw(bundle(trainingId, model._id), {}, { user: '' }))).get('manifest.json')!.toString()
      );
      expect(manifest.trainedOn.id).toBe('iseauto');
      expect(manifest.predictedOn).toEqual([
        {
          dataset: { source: 'visin', id: 'sample', archiveRevision: 'sample-v1' },
          frames: ['sq11_000301', 'sq14_000061']
        }
      ]);
      expect(manifest.checkpoint).toEqual({ epoch: 99, sha256: model.sha256 });
      expect(manifest.outputGeometry.mapping).toMatch(/bilinearly.*argmax/);
      expect(manifest.confidence.encodings.uint16).toBe('round(65535 * p)');
      expect(manifest.files.find((file: { folder: string }) => file.folder === 'confidence')).toMatchObject({
        geometry: { width: 1363, height: 768 },
        confidenceEncoding: 'uint16'
      });
      await EpochVisualization.updateMany({ epoch_uuid: 'epoch-99' }, { $unset: { 'metadata.prediction': '' } });
      const legacy = JSON.parse(
        (await readBundle(await raw(bundle(trainingId, model._id), {}, { user: '' }))).get('manifest.json')!.toString()
      );
      expect(legacy.predictedOn[0].dataset).toBeNull();
      expect(legacy.files.find((file: { folder: string }) => file.folder === 'confidence').confidenceEncoding).toBe(
        'unknown'
      );
    });

    it('includes only evaluations visible to the caller in this project, even when another project names the same epoch', async () => {
      const { trainingId, projectId } = await scoredRun();
      await Evaluation.collection.insertMany([
        {
          uuid: 'private-score',
          projectId,
          ownerId: MEMBER,
          status: 'completed',
          receivedAt: new Date(),
          suite: { id: 's1', slug: 'unpublished', version: 1 },
          source: { trainingId, epochUuid: 'epoch-99', epoch: 99 },
          results: { unpublished: {} }
        },
        {
          uuid: 'other-project',
          projectId: await project(),
          ownerId: MEMBER,
          status: 'completed',
          receivedAt: new Date(),
          source: { trainingId, epochUuid: 'epoch-99', epoch: 99 },
          results: { unrelated: {} }
        }
      ]);
      await publish(trainingId, weights(1));
      const model = await settled(trainingId);
      const publicMetrics = JSON.parse(
        (await readBundle(await raw(bundle(trainingId, model._id), {}, { user: '' }))).get('metrics.json')!.toString()
      );
      expect(publicMetrics.evaluations).toHaveLength(1);
      expect(JSON.stringify(publicMetrics)).not.toMatch(/unpublished|unrelated/);
      const memberMetrics = JSON.parse(
        (await readBundle(await raw(bundle(trainingId, model._id), {}, { user: MEMBER })))
          .get('metrics.json')!
          .toString()
      );
      expect(memberMetrics.evaluations).toHaveLength(2);
      expect(JSON.stringify(memberMetrics)).toContain('unpublished');
      expect(JSON.stringify(memberMetrics)).not.toContain('unrelated');
    });

    it('names the other format of the same checkpoint', async () => {
      const { trainingId } = await scoredRun();
      const pth = weights(5);
      const onnx = Buffer.concat([Buffer.from('0809', 'hex'), Buffer.alloc(64, 1)]);
      await publish(trainingId, pth);
      await publish(trainingId, onnx, { sourceSha256: sha256(pth) }, 'onnx');
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const models = (await Training.findById(trainingId).lean())?.models ?? [];
        if (models.length === 2 && models.every((model) => (model as { status?: string }).status === 'ready')) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const models = (await Training.findById(trainingId).lean())!.models! as unknown as Array<{
        _id: mongoose.Types.ObjectId;
        format: string;
      }>;
      const pthModel = models.find((model) => model.format === 'pth')!;
      const manifest = JSON.parse(
        (await readBundle(await raw(bundle(trainingId, pthModel._id), {}, { user: '' })))
          .get('manifest.json')!
          .toString()
      );
      expect(manifest.sameCheckpoint).toEqual([
        expect.objectContaining({ format: 'onnx', sha256: sha256(onnx), size: onnx.length })
      ]);
    });

    it('can be narrowed to some folders', async () => {
      const { trainingId } = await scoredRun();
      await publish(trainingId, weights(5));
      const model = await settled(trainingId);
      const files = await readBundle(
        await raw(bundle(trainingId, model._id, '?folders=mask,confidence'), {}, { user: '' })
      );
      expect([...files.keys()].filter((name) => name.includes('/')).map((name) => name.split('/')[0])).toEqual([
        'confidence',
        'confidence',
        'mask',
        'mask'
      ]);
      expect(JSON.parse(files.get('manifest.json')!.toString()).folders).toEqual({
        mask: expect.any(String),
        confidence: expect.any(String)
      });
      expect((await raw(bundle(trainingId, model._id, '?folders=overlay'), {}, { user: '' })).status).toBe(400);
    });

    it('is refused on the terms the file is, and for a model that names no epoch or an epoch the run lacks', async () => {
      const { trainingId } = await scoredRun('private');
      await publish(trainingId, weights(5), { license: undefined });
      const model = await settled(trainingId);
      const unlicensed = await raw(bundle(trainingId, model._id), {}, { user: MEMBER });
      expect(unlicensed.status).toBe(409);
      expect((await unlicensed.json()).message).toMatch(/no licence/);

      await Training.updateOne(
        { _id: trainingId, 'models._id': model._id },
        { $set: { 'models.$.license': { id: 'cc-by-4.0' } } }
      );
      expect((await raw(bundle(trainingId, model._id), {}, { user: STRANGER })).status).toBe(403);
      expect((await raw(bundle(trainingId, model._id), {}, { user: MEMBER })).status).toBe(200);

      await Training.updateOne({ _id: trainingId, 'models._id': model._id }, { $set: { 'models.$.epoch': 500 } });
      const missing = await raw(bundle(trainingId, model._id), {}, { user: MEMBER });
      expect(missing.status).toBe(409);
      expect((await missing.json()).message).toMatch(/no recorded epoch 500/);

      await Training.updateOne({ _id: trainingId, 'models._id': model._id }, { $unset: { 'models.$.epoch': '' } });
      expect((await (await raw(bundle(trainingId, model._id), {}, { user: MEMBER })).json()).message).toMatch(
        /names no epoch/
      );
    });

    it('refuses more outputs than a bundle may hold, or more bytes than it may be', async () => {
      const { trainingId } = await scoredRun();
      await publish(trainingId, weights(5));
      const model = await settled(trainingId);

      await EpochVisualization.collection.insertMany(
        Array.from({ length: 5001 }, (_, index) => ({
          epoch_uuid: 'epoch-99',
          visualization_uuid: `bulk-${index}`,
          filename: `f${index}.png`,
          type: 'mask',
          fileId: `visualizations/bulk/${index}`,
          uploadedAt: new Date()
        }))
      );
      const tooMany = await raw(bundle(trainingId, model._id), {}, { user: '' });
      expect(tooMany.status).toBe(413);
      expect((await tooMany.json()).message).toMatch(/More than 5000 outputs/);
      expect((await raw(bundle(trainingId, model._id, '?folders=segment'), {}, { user: '' })).status).toBe(200);

      await EpochVisualization.collection.deleteMany({ visualization_uuid: /^bulk-/ });
      await EpochVisualization.collection.insertOne({
        epoch_uuid: 'epoch-99',
        visualization_uuid: 'huge',
        filename: 'huge.png',
        type: 'mask',
        fileId: 'visualizations/huge',
        uploadedAt: new Date(),
        metadata: { size: 3 * 1024 ** 3 }
      });
      const tooBig = await raw(bundle(trainingId, model._id), {}, { user: '' });
      expect(tooBig.status).toBe(413);
      expect((await tooBig.json()).message).toMatch(/larger than a bundle may be/);
    });

    it('names a suite’s result and a dataset known only by id, and takes the newest upload of a frame', async () => {
      const { projectId, trainingId, frames } = await scoredRun();
      await Training.updateOne({ _id: trainingId }, { $unset: { dataset: '' }, $set: { datasetId: 'iseauto' } });
      await Evaluation.collection.insertOne({
        uuid: 'e3',
        projectId,
        ownerId: MEMBER,
        status: 'completed',
        receivedAt: new Date(),
        executedAt: new Date('2026-10-11T00:00:00Z'),
        publishedAt: new Date(),
        suite: { id: 's1', slug: 'road-test', version: 2 },
        source: { trainingId, epochUuid: 'epoch-99', epoch: 99 },
        results: { day_fair: {} }
      });
      // The same frame uploaded again later (a path in its name is not part of it), and a hidden result.
      const newer = png(77);
      mockFiles.set('visualizations/mask/newer', newer);
      await EpochVisualization.collection.insertOne({
        epoch_uuid: 'epoch-99',
        visualization_uuid: 'again',
        filename: 'frames/sq11_000301.png',
        type: 'mask',
        fileId: 'visualizations/mask/newer',
        uploadedAt: new Date(Date.now() + 60_000)
      });
      await Evaluation.collection.insertOne({
        uuid: 'e4',
        projectId,
        ownerId: MEMBER,
        status: 'completed',
        receivedAt: new Date(),
        hiddenAt: new Date(),
        source: { trainingId, epochUuid: 'epoch-99', epoch: 99 },
        results: { hidden: {} }
      });
      await publish(trainingId, weights(5));
      const model = await settled(trainingId);

      const files = await readBundle(await raw(bundle(trainingId, model._id), {}, { user: '' }));
      expect(files.get('mask/sq11_000301.png')!.equals(newer)).toBe(true);
      expect(files.get('mask/sq11_000301.png')!.equals(frames['mask/sq11_000301.png'])).toBe(false);
      const metrics = JSON.parse(files.get('metrics.json')!.toString());
      expect(metrics.evaluations).toHaveLength(2);
      expect(metrics.evaluations.find((evaluation: { suite?: unknown }) => evaluation.suite)).toMatchObject({
        suite: { slug: 'road-test', version: 2 },
        executedAt: '2026-10-11T00:00:00.000Z'
      });
      expect(JSON.stringify(metrics)).not.toContain('hidden');
      expect(JSON.parse(files.get('manifest.json')!.toString()).trainedOn).toEqual({ id: 'iseauto' });
    });

    it('bundles from the ONNX export as readily as from the weights, naming the weights as the same checkpoint', async () => {
      const { trainingId } = await scoredRun();
      const pth = weights(5);
      const onnx = Buffer.concat([Buffer.from('0809', 'hex'), Buffer.alloc(64, 1)]);
      await publish(trainingId, pth);
      await publish(trainingId, onnx, { sourceSha256: sha256(pth) }, 'onnx');
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const models = (await Training.findById(trainingId).lean())?.models ?? [];
        if (models.length === 2 && models.every((model) => (model as { status?: string }).status === 'ready')) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const models = (await Training.findById(trainingId).lean())!.models! as unknown as Array<{
        _id: mongoose.Types.ObjectId;
        format: string;
      }>;
      const onnxModel = models.find((model) => model.format === 'onnx')!;

      const response = await raw(bundle(trainingId, onnxModel._id), {}, { user: '' });
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="ISEAUTO_CLFT_Large-epoch99-outputs.zip"'
      );
      const manifest = JSON.parse((await readBundle(response)).get('manifest.json')!.toString());
      expect(manifest.model).toMatchObject({ format: 'onnx', sourceSha256: sha256(pth) });
      expect(manifest.sameCheckpoint).toEqual([expect.objectContaining({ format: 'pth', sha256: sha256(pth) })]);
    });

    it('answers HEAD with headers alone', async () => {
      const { trainingId } = await scoredRun();
      await publish(trainingId, weights(5));
      const model = await settled(trainingId);
      jest.mocked(getFileStream).mockClear();
      const head = await raw(bundle(trainingId, model._id), {}, { user: '', method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.headers.get('content-type')).toBe('application/zip');
      expect(getFileStream).not.toHaveBeenCalled();
    });

    it('breaks the zip, rather than end it whole, when a frame cannot be read', async () => {
      const { trainingId } = await scoredRun();
      await publish(trainingId, weights(5));
      const model = await settled(trainingId);
      mockFiles.delete('visualizations/segment/sq14_000061.png');
      let outcome: 'error' | 'whole' = 'whole';
      try {
        const response = await raw(bundle(trainingId, model._id), {}, { user: '' });
        unzip(Buffer.from(await response.arrayBuffer()));
      } catch {
        outcome = 'error';
      }
      expect(outcome).toBe('error');
    });
  });
});
