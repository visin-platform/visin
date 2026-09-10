// These workflow tests stub the write-policy boundary. HTTP/Mongo integration
// tests exercise the real owner/group policy, parent resolution, and denial effects.
jest.mock('../../services/writeAccessService', () => ({
  ...jest.requireActual('../../services/writeAccessService'),
  assertResourceWrite: jest.fn(async (resource: unknown) => {
    if (!resource) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
  }),
  assertLibraryWrite: jest.fn(),
  assertDatasetWrite: jest.fn(),
  assertEpochWrite: jest.fn(async (uuid: string) => {
    const epoch = await jest.requireMock('../../models/Epoch').default.findOne({ epoch_uuid: uuid });
    if (!epoch) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
    return epoch;
  })
}));
import type { Request, Response } from 'express';
import { NotFoundError, ForbiddenError } from '@visin/backend-core';
import { getComparisonById, createComparison } from '../../controllers/comparisonController';

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

jest.mock('../../models/Comparison');
jest.mock('../../services/projectAccessService', () => ({
  ...jest.requireActual('../../services/projectAccessService'),
  resolveProject: jest.fn(async (id: string) => ({ _id: id })),
  checkProjectAccess: jest.fn(),
  getVisibleProjectIds: jest.fn().mockResolvedValue([])
}));

import Comparison from '../../models/Comparison';
import { checkProjectAccess } from '../../services/projectAccessService';

const mockComparison = Comparison as jest.Mocked<typeof Comparison>;
const mockCheckProjectAccess = checkProjectAccess as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
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
    const save = jest.fn().mockResolvedValue({ uuid: 'x' });
    (mockComparison as unknown as jest.Mock).mockImplementation(function (this: Record<string, unknown>, data: Record<string, unknown>) {
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
