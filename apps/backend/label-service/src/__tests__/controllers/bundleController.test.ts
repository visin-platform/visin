import type { Request, Response } from 'express';

jest.mock('../../services/bundleService', () => ({
  createBundle: jest.fn(),
  listBundlesForUser: jest.fn(),
  getBundle: jest.fn(),
  updateBundle: jest.fn(),
  createUploadUrl: jest.fn(),
  listUploads: jest.fn(),
  previewImport: jest.fn(),
  startImport: jest.fn(),
  getImport: jest.fn(),
  deleteImport: jest.fn(),
  deleteBundle: jest.fn(),
}));
jest.mock('../../services/groupAccessService', () => ({
  requireUser: jest.fn((req: Request) => req.user),
  assertMember: jest.fn(),
  assertAdmin: jest.fn(),
}));

import * as ctrl from '../../controllers/bundleController';
import * as svc from '../../services/bundleService';
import { assertAdmin, assertMember } from '../../services/groupAccessService';

const mockedSvc = svc as unknown as Record<string, jest.Mock>;
const mockedAdmin = assertAdmin as jest.Mock;
const mockedMember = assertMember as jest.Mock;

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, query: {}, params: {}, user: { id: 'u1', email: 'user@x.com' }, ...overrides } as unknown as Request);

const bundle = { _id: { toString: () => 'b1' }, groupId: 'g1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockedSvc.getBundle.mockResolvedValue(bundle);
});

describe('createBundle', () => {
  it('requires group admin on the target group', async () => {
    mockedSvc.createBundle.mockResolvedValue(bundle);
    const req = makeReq({ body: { name: 'B', groupId: 'g1' } });
    const res = makeRes();

    await ctrl.createBundle(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('updateBundle', () => {
  it('requires admin on the bundle group and delegates', async () => {
    mockedSvc.updateBundle.mockResolvedValue({ _id: 'b1', name: 'New' });
    const req = makeReq({ params: { id: 'b1' }, body: { name: 'New' } });
    const res = makeRes();

    await ctrl.updateBundle(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(mockedSvc.updateBundle).toHaveBeenCalledWith('b1', { name: 'New' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'b1', name: 'New' } });
  });
});

describe('listBundles', () => {
  it('lists for the authenticated user', async () => {
    mockedSvc.listBundlesForUser.mockResolvedValue([]);

    await ctrl.listBundles(makeReq(), makeRes());

    expect(mockedSvc.listBundlesForUser).toHaveBeenCalledWith('user@x.com');
  });
});

describe('getBundle', () => {
  it('is member-visible', async () => {
    const req = makeReq({ params: { id: 'b1' } });

    await ctrl.getBundle(req, makeRes());

    expect(mockedMember).toHaveBeenCalledWith(req, 'g1');
  });
});

describe('upload/import flow', () => {
  it('createUploadUrl requires admin', async () => {
    mockedSvc.createUploadUrl.mockResolvedValue({ uploadUrl: 'u', zipFileId: 'z', expiresMs: 1 });
    const req = makeReq({ params: { id: 'b1' } });
    const res = makeRes();

    await ctrl.createUploadUrl(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(mockedSvc.createUploadUrl).toHaveBeenCalledWith('b1');
  });

  it('listUploads requires admin and returns the bundle\'s zips', async () => {
    mockedSvc.listUploads.mockResolvedValue([{ zipFileId: 'z', size: 1, uploadedAt: 'now' }]);
    const req = makeReq({ params: { id: 'b1' } });
    const res = makeRes();

    await ctrl.listUploads(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ zipFileId: 'z', size: 1, uploadedAt: 'now' }] });
  });

  it('previewImport requires admin and returns the zip shape', async () => {
    mockedSvc.previewImport.mockResolvedValue({ folders: [] });
    const req = makeReq({ params: { id: 'b1' }, body: { zipFileId: 'z' } });
    const res = makeRes();

    await ctrl.previewImport(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(mockedSvc.previewImport).toHaveBeenCalledWith('b1', 'z');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { folders: [] } });
  });

  it('startImport returns 202 and forwards the mapping', async () => {
    mockedSvc.startImport.mockResolvedValue({ _id: 'i1' });
    const res = makeRes();
    const mapping = { frames: 'img' };

    await ctrl.startImport(makeReq({ params: { id: 'b1' }, body: { zipFileId: 'z', mapping } }), res);

    expect(mockedSvc.startImport).toHaveBeenCalledWith('b1', 'z', mapping);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('getImport scopes to the bundle', async () => {
    mockedSvc.getImport.mockResolvedValue({ _id: 'i1' });

    await ctrl.getImport(makeReq({ params: { id: 'b1', importId: 'i1' } }), makeRes());

    expect(mockedSvc.getImport).toHaveBeenCalledWith('b1', 'i1');
  });

  it('deleteImport requires admin and delegates', async () => {
    const req = makeReq({ params: { id: 'b1', importId: 'i1' } });

    await ctrl.deleteImport(req, makeRes());

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(mockedSvc.deleteImport).toHaveBeenCalledWith('b1', 'i1');
  });
});

describe('deleteBundle', () => {
  it('requires admin and delegates', async () => {
    const req = makeReq({ params: { id: 'b1' } });
    const res = makeRes();

    await ctrl.deleteBundle(req, res);

    expect(mockedAdmin).toHaveBeenCalledWith(req, 'g1');
    expect(mockedSvc.deleteBundle).toHaveBeenCalledWith('b1');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
