import type { Request, Response } from 'express';

jest.mock('../../services/jobService', () => ({
  createJob: jest.fn(),
  listJobsForUser: jest.fn(),
  listPublicJobs: jest.fn(),
  withoutCreatorIdentity: jest.fn((job: { toObject: () => Record<string, unknown> }) => {
    const { createdBy: _createdBy, ...rest } = job.toObject();
    return rest;
  }),
  getJob: jest.fn(),
  jobDataset: jest.fn(),
  deleteJob: jest.fn(),
  getJobProgress: jest.fn(),
  transitionJob: jest.fn(),
  setJobVisibility: jest.fn(),
  setModelClassMapping: jest.fn(),
}));
jest.mock('../../services/materializationService', () => ({
  materializeTasks: jest.fn(),
}));
jest.mock('../../services/exportService', () => ({
  exportManifest: jest.fn(),
  jobStats: jest.fn(),
}));
jest.mock('../../services/bundleService', () => ({ streamExport: jest.fn() }));
jest.mock('../../services/importService', () => ({ importLabels: jest.fn() }));
// Small enough to cross in a test; the real limit is a gigabyte.
jest.mock('../../limits', () => ({ IMPORT_MAX_BYTES: 1024, TASK_LEASE_MINUTES: 5 }));
jest.mock('../../services/groupAccessService', () => ({
  requireUser: jest.fn((req: Request) => req.user),
}));

jest.mock('../../services/jobAccessService', () => ({ getJobReadAccess: jest.fn(), assertJobAdmin: jest.fn() }));
import { assertJobAdmin, getJobReadAccess } from '../../services/jobAccessService';

import * as ctrl from '../../controllers/jobController';
import * as svc from '../../services/jobService';
import * as materialization from '../../services/materializationService';
import * as exportSvc from '../../services/exportService';
import * as bundles from '../../services/bundleService';
import * as importer from '../../services/importService';
import { Readable } from 'node:stream';
import { existsSync, readFileSync } from 'node:fs';

const mockedBundles = bundles as unknown as Record<string, jest.Mock>;
const mockedImporter = importer as unknown as Record<string, jest.Mock>;
const mockedSvc = svc as unknown as Record<string, jest.Mock>;
const mockedMat = materialization as unknown as Record<string, jest.Mock>;
const mockedExport = exportSvc as unknown as Record<string, jest.Mock>;
const mockedAdmin = assertJobAdmin as jest.Mock;

type MockRes = Response & {
  json: jest.Mock;
  status: jest.Mock;
  send: jest.Mock;
  setHeader: jest.Mock;
  end: jest.Mock;
  destroy: jest.Mock;
  headersSent: boolean;
};

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn(), send: jest.fn(), setHeader: jest.fn(), end: jest.fn(), destroy: jest.fn(), headersSent: false };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, query: {}, params: {}, user: { id: 'u1', email: 'user@x.com' }, ...overrides } as unknown as Request);

const job = {
  _id: 'j1',
  datasetId: 'd1',
  toObject: () => ({ _id: 'j1', datasetId: 'd1', createdBy: { email: 'owner@x.com' } }),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedSvc.getJob.mockResolvedValue(job);
  mockedSvc.jobDataset.mockResolvedValue({ _id: 'd1', name: 'Road', owner: { kind: 'group', id: 'g1' } });
  (getJobReadAccess as jest.Mock).mockImplementation(async (_job, userId) => ({ member: Boolean(userId), isAdmin: false, canWork: false }));
});

describe('setModelClassMapping', () => {
  it('requires job management before changing detector mappings', async () => {
    mockedSvc.setModelClassMapping.mockResolvedValue(job);
    const req = makeReq({ params: { id: 'j1' }, body: { mapping: { vehicle: 'car' } } });
    const res = makeRes();
    await ctrl.setModelClassMapping(req, res);
    expect(mockedAdmin).toHaveBeenCalledWith(job, 'u1');
    expect(mockedAdmin.mock.invocationCallOrder[0]).toBeLessThan(mockedSvc.setModelClassMapping.mock.invocationCallOrder[0]);
    expect(mockedSvc.setModelClassMapping).toHaveBeenCalledWith(job, { vehicle: 'car' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: job });
  });
});

describe('createJob', () => {
  it('creates through the service, which checks the caller manages the dataset', async () => {
    mockedSvc.createJob.mockResolvedValue(job);
    const req = makeReq({ body: { name: 'J', datasetId: 'd1' } });
    const res = makeRes();

    await ctrl.createJob(req, res);

    expect(mockedSvc.createJob).toHaveBeenCalledWith(req.user, { name: 'J', datasetId: 'd1' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('propagates a refusal', async () => {
    mockedSvc.createJob.mockRejectedValueOnce(new Error('forbidden'));

    await expect(ctrl.createJob(makeReq({ body: { datasetId: 'd1' } }), makeRes())).rejects.toThrow('forbidden');
  });
});

describe('listJobs', () => {
  it('defaults to the worker role', async () => {
    mockedSvc.listJobsForUser.mockResolvedValue([]);
    const res = makeRes();

    await ctrl.listJobs(makeReq(), res);

    expect(mockedSvc.listJobsForUser).toHaveBeenCalledWith('u1', 'worker');
  });

  it('passes the admin role through', async () => {
    mockedSvc.listJobsForUser.mockResolvedValue([]);

    await ctrl.listJobs(makeReq({ query: { role: 'admin' } }), makeRes());

    expect(mockedSvc.listJobsForUser).toHaveBeenCalledWith('u1', 'admin');
  });

  it('gives an anonymous caller the public listing', async () => {
    mockedSvc.listPublicJobs.mockResolvedValue([{ _id: 'j1' }]);
    const res = makeRes();

    await ctrl.listJobs(makeReq({ user: undefined }), res);

    expect(mockedSvc.listJobsForUser).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'j1' }] });
  });

  // role=admin asks which groups the caller administers — nothing, with no caller.
  it('gives an anonymous caller nothing for the admin role', async () => {
    const res = makeRes();

    await ctrl.listJobs(makeReq({ user: undefined, query: { role: 'admin' } }), res);

    expect(mockedSvc.listPublicJobs).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });
});

describe('getJob', () => {
  it('attaches progress scoped to the caller', async () => {
    mockedSvc.getJobProgress.mockResolvedValue({ tasks: 3 });
    const req = makeReq({ params: { id: 'j1' } });
    const res = makeRes();

    await ctrl.getJob(req, res);

    expect(mockedSvc.getJobProgress).toHaveBeenCalledWith(job, 'u1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        canLabel: false,
        canManage: false,
        _id: 'j1',
        datasetId: 'd1',
        dataset: { _id: 'd1', name: 'Road', owner: { kind: 'group', id: 'g1' } },
        createdBy: { email: 'owner@x.com' },
        progress: { tasks: 3 },
      },
    });
  });

  // A shared link resolves without an account; "done by me" is simply zero.
  // `createdBy` is dropped for the same reason the per-labeler stats are: it is
  // an email address, and the progress is the thing being shared.
  it('serves an anonymous caller without the creator identity or a membership check', async () => {
    mockedSvc.getJobProgress.mockResolvedValue({ tasks: 3, myDone: 0 });
    const res = makeRes();

    await ctrl.getJob(makeReq({ params: { id: 'j1' }, user: undefined }), res);

    expect(mockedSvc.getJobProgress).toHaveBeenCalledWith(job, '');
    expect(mockedSvc.jobDataset).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { canLabel: false, canManage: false, _id: 'j1', datasetId: 'd1', progress: { tasks: 3, myDone: 0 } },
    });
  });
});

describe('deleteJob', () => {
  it('requires admin, then reports what was removed', async () => {
    mockedSvc.deleteJob.mockResolvedValue({ tasks: 10, annotations: 12, suggestions: 1 });
    const req = makeReq({ params: { id: 'j1' } });
    const res = makeRes();

    await ctrl.deleteJob(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(job, 'u1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tasks: 10, annotations: 12, suggestions: 1 } });
  });

  it('propagates access denial before removing anything', async () => {
    mockedAdmin.mockRejectedValueOnce(new Error('forbidden'));

    await expect(ctrl.deleteJob(makeReq({ params: { id: 'j1' } }), makeRes())).rejects.toThrow('forbidden');
    expect(mockedSvc.deleteJob).not.toHaveBeenCalled();
  });
});

describe('transitions', () => {
  it.each([
    ['activateJob', 'activate'],
    ['pauseJob', 'pause'],
    ['resumeJob', 'resume'],
    ['archiveJob', 'archive'],
  ] as const)('%s requires admin and delegates', async (handler, action) => {
    mockedSvc.transitionJob.mockResolvedValue({ ...job, status: 'x' });
    const req = makeReq({ params: { id: 'j1' } });

    await ctrl[handler](req, makeRes());

    expect(mockedAdmin).toHaveBeenCalledWith(job, 'u1');
    expect(mockedSvc.transitionJob).toHaveBeenCalledWith('j1', action);
  });
});

describe('materializeTasks', () => {
  it('requires admin and returns the result', async () => {
    mockedMat.materializeTasks.mockResolvedValue({ tasks: 10, missing: [] });
    const res = makeRes();

    await ctrl.materializeTasks(makeReq({ params: { id: 'j1' }, body: { kind: 'filter' } }), res);

    expect(mockedMat.materializeTasks).toHaveBeenCalledWith(job, { kind: 'filter' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tasks: 10, missing: [] } });
  });
});

describe('exportJob', () => {
  it('streams the bundle as a zip in the requested format', async () => {
    mockedBundles.streamExport.mockResolvedValue({ frames: 2 });
    const res = makeRes();

    await ctrl.exportJob(makeReq({ params: { id: 'j1' }, query: { format: 'yolo', include: 'all' } }), res);

    expect(mockedAdmin).toHaveBeenCalledWith(job, 'u1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="job-j1-yolo.zip"');
    expect(mockedBundles.streamExport).toHaveBeenCalledWith(job, 'yolo', 'all', res);
    expect(res.end).toHaveBeenCalled();
  });

  it('answers a failure before anything was sent with the error', async () => {
    mockedBundles.streamExport.mockRejectedValue(new Error('file-service down'));

    await expect(ctrl.exportJob(makeReq({ params: { id: 'j1' }, query: { format: 'coco', include: 'done' } }), makeRes())).rejects.toThrow(
      'file-service down'
    );
  });

  it('cuts the connection when the failure comes after bytes went out', async () => {
    const failure = new Error('mask unreadable');
    mockedBundles.streamExport.mockRejectedValue(failure);
    const res = makeRes();
    res.headersSent = true;

    await ctrl.exportJob(makeReq({ params: { id: 'j1' }, query: { format: 'coco', include: 'done' } }), res);

    expect(res.destroy).toHaveBeenCalledWith(failure);
    expect(res.end).not.toHaveBeenCalled();
  });

  it('serves the manifest as pretty JSON under its own filename', async () => {
    mockedExport.exportManifest.mockResolvedValue({ job: { id: 'j1' } });
    const res = makeRes();

    await ctrl.exportJob(makeReq({ params: { id: 'j1' }, query: { format: 'manifest' } }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="job-j1.manifest.json"'
    );
    expect(res.send).toHaveBeenCalledWith(JSON.stringify({ job: { id: 'j1' } }, null, 2));
    expect(mockedBundles.streamExport).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not manage the dataset, before reading any label', async () => {
    mockedAdmin.mockRejectedValueOnce(new Error('forbidden'));

    await expect(ctrl.exportJob(makeReq({ params: { id: 'j1' }, query: { format: 'yolo' } }), makeRes())).rejects.toThrow('forbidden');
    expect(mockedBundles.streamExport).not.toHaveBeenCalled();
  });
});

describe('listFormats', () => {
  it('lists the formats with what each can hold', async () => {
    const res = makeRes();

    await ctrl.listFormats(makeReq(), res);

    const formats = res.json.mock.calls[0][0].data as { id: string; boxes: boolean; masks: boolean }[];
    expect(formats.map((format) => format.id)).toEqual(['yolo', 'coco', 'voc', 'semantic-png', 'visin']);
    expect(formats.find((format) => format.id === 'yolo')).toMatchObject({ boxes: true, masks: false });
  });
});

describe('importLabels', () => {
  const upload = (chunks: Buffer[], overrides: Record<string, unknown> = {}): Request =>
    Object.assign(Readable.from(chunks), {
      params: { id: 'j1' },
      query: { as: 'suggestions', dryRun: 'false', classMap: {} },
      headers: {},
      user: { id: 'u1', email: 'user@x.com' },
      ...overrides,
    }) as unknown as Request;

  beforeEach(() => {
    mockedSvc.getJob.mockResolvedValue({ ...job, tasksCount: 5 });
  });

  it('spools the body to a temporary file, imports from it and always removes it', async () => {
    let seen: { path: string; bytes: string } | undefined;
    mockedImporter.importLabels.mockImplementation(async (_job: unknown, _user: unknown, path: string) => {
      seen = { path, bytes: readFileSync(path).toString() };
      return { format: 'yolo' };
    });
    const res = makeRes();

    await ctrl.importLabels(upload([Buffer.from('PK'), Buffer.from('zip')]), res);

    expect(mockedAdmin).toHaveBeenCalled();
    expect(seen!.bytes).toBe('PKzip');
    expect(existsSync(seen!.path)).toBe(false);
    expect(mockedImporter.importLabels.mock.calls[0][3]).toEqual({ as: 'suggestions', dryRun: 'false', classMap: {} });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { format: 'yolo' } });
  });

  it('removes the file when the import fails', async () => {
    let path = '';
    mockedImporter.importLabels.mockImplementation(async (_job: unknown, _user: unknown, file: string) => {
      path = file;
      throw new Error('Could not recognise these labels');
    });

    await expect(ctrl.importLabels(upload([Buffer.from('x')]), makeRes())).rejects.toThrow('Could not recognise');
    expect(existsSync(path)).toBe(false);
  });

  it('needs the job to have frames', async () => {
    mockedSvc.getJob.mockResolvedValue({ ...job, tasksCount: 0 });

    await expect(ctrl.importLabels(upload([Buffer.from('x')]), makeRes())).rejects.toThrow('materialize it first');
    expect(mockedImporter.importLabels).not.toHaveBeenCalled();
  });

  it('needs a body', async () => {
    await expect(ctrl.importLabels(upload([]), makeRes())).rejects.toThrow('Send the labels archive');
  });

  it('refuses an archive too large by its declared size, without reading it', async () => {
    await expect(
      ctrl.importLabels(upload([Buffer.from('x')], { headers: { 'content-length': '5000' } }), makeRes())
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(mockedImporter.importLabels).not.toHaveBeenCalled();
  });

  it('stops reading an archive that outgrows the limit whatever it declared', async () => {
    await expect(
      ctrl.importLabels(upload([Buffer.alloc(700), Buffer.alloc(700)], { headers: {} }), makeRes())
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(mockedImporter.importLabels).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not manage the dataset, before reading the body', async () => {
    mockedAdmin.mockRejectedValueOnce(new Error('forbidden'));

    await expect(ctrl.importLabels(upload([Buffer.from('x')]), makeRes())).rejects.toThrow('forbidden');
  });
});

describe('jobStats', () => {
  it('gives an authorized group administrator the per-labeler breakdown', async () => {
    (getJobReadAccess as jest.Mock).mockResolvedValue({ member: true, isAdmin: true });
    mockedExport.jobStats.mockResolvedValue({ tasks: 1, perUser: [{ userEmail: 'w@x.com', done: 1, skipped: 0 }] });
    const res = makeRes();

    await ctrl.jobStats(makeReq({ params: { id: 'j1' } }), res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { tasks: 1, perUser: [{ userEmail: 'w@x.com', done: 1, skipped: 0 }] },
    });
  });

  // Progress is the thing being shared; the breakdown is a list of email addresses.
  it('drops the per-labeler breakdown for an anonymous caller', async () => {
    mockedExport.jobStats.mockResolvedValue({
      tasks: 1,
      perStratum: [],
      perUser: [{ userEmail: 'w@x.com', done: 1, skipped: 0 }],
    });
    const res = makeRes();

    await ctrl.jobStats(makeReq({ params: { id: 'j1' }, user: undefined }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tasks: 1, perStratum: [] } });
  });
});
