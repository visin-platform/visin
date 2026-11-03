import { vi, type Mock, type Mocked } from 'vitest';
// These workflow tests stub the write-policy boundary. HTTP/Mongo integration
// tests exercise the real owner/group policy, parent resolution, and denial effects.
vi.mock('../../services/writeAccessService', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/writeAccessService')>('../../services/writeAccessService')),
    assertResourceWrite: vi.fn(async function (resource: unknown) {
      if (!resource)
        throw new (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).ForbiddenError();
    }),
    assertLibraryWrite: vi.fn(),
    assertDatasetWrite: vi.fn(),
    assertEpochWrite: vi.fn(async function (uuid: string) {
      const epoch = await (await import('../../models/Epoch')).default.findOne({ epoch_uuid: uuid });
      if (!epoch)
        throw new (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).ForbiddenError();
      return epoch;
    })
  }))();
  return Object.assign({ default: module }, module);
});
import type { Request, Response } from 'express';
import { NotFoundError, ForbiddenError } from '@visin/backend-core';
import { getComparisonById, createComparison } from '../../controllers/comparisonController';

const makeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

vi.mock('../../models/Comparison');
vi.mock('../../services/projectAccessService', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/projectAccessService')>(
      '../../services/projectAccessService'
    )),
    resolveProject: vi.fn(async function (id: string) {
      return { _id: id };
    }),
    checkProjectAccess: vi.fn(),
    getVisibleProjectIds: vi.fn().mockResolvedValue([])
  }))();
  return Object.assign({ default: module }, module);
});

import Comparison from '../../models/Comparison';
import { checkProjectAccess } from '../../services/projectAccessService';

const mockComparison = Comparison as Mocked<typeof Comparison>;
const mockCheckProjectAccess = checkProjectAccess as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getComparisonById', () => {
  it('throws NotFoundError when no comparison matches the id', async () => {
    mockComparison.findOne.mockResolvedValueOnce(null as never);
    const req = { params: { id: 'missing' }, user: { id: 'u1' } } as unknown as Request;

    await expect(getComparisonById(req, makeRes())).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the caller cannot access the comparison project', async () => {
    mockComparison.findOne.mockResolvedValueOnce({ projectId: 'p1' } as never);
    mockCheckProjectAccess.mockResolvedValueOnce(false);

    const req = { params: { id: 'c1' }, user: { id: 'u1' } } as unknown as Request;

    await expect(getComparisonById(req, makeRes())).rejects.toThrow(ForbiddenError);
  });

  it('returns the comparison when access is allowed', async () => {
    const comparison = { projectId: 'p1', name: 'baseline vs v2' };
    mockComparison.findOne.mockResolvedValueOnce(comparison as never);
    mockCheckProjectAccess.mockResolvedValueOnce(true);

    const req = { params: { id: 'c1' }, user: { id: 'u1' } } as unknown as Request;
    const res = makeRes();

    await getComparisonById(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: comparison });
  });
});

describe('createComparison', () => {
  it('prefers the API token project scope (req.projectId) over the body projectId', async () => {
    mockCheckProjectAccess.mockResolvedValueOnce(true);
    const save = vi.fn().mockResolvedValue({ uuid: 'x' });
    (mockComparison as unknown as Mock).mockImplementation(function (
      this: Record<string, unknown>,
      data: Record<string, unknown>
    ) {
      Object.assign(this, data);
      this.save = save;
    });

    const req = {
      body: { name: 'n', itemIds: [], projectId: 'body-project' },
      projectId: 'token-project',
      user: { id: 'u1' }
    } as unknown as Request;

    await createComparison(req, makeRes());

    expect(mockCheckProjectAccess).toHaveBeenCalledWith('u1', 'token-project');
  });

  it('throws ForbiddenError when access to the effective project is denied', async () => {
    mockCheckProjectAccess.mockResolvedValueOnce(false);
    const req = {
      body: { name: 'n', itemIds: [], projectId: 'p1' },
      user: { id: 'u1' }
    } as unknown as Request;

    await expect(createComparison(req, makeRes())).rejects.toThrow(ForbiddenError);
  });
});
