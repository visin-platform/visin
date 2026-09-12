import type { Request, Response } from 'express';
import { NotFoundError, ForbiddenError } from '@visin/backend-core';
import { getEpochById, getEpochByUuid, createEpoch, deleteEpoch } from '../../controllers/epochController';

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

jest.mock('../../models/Epoch');
jest.mock('../../models/Training');
jest.mock('../../models/TestResult');
jest.mock('../../services/projectAccessService', () => ({
  checkProjectAccess: jest.fn(),
  isWithinTokenScope: jest.fn().mockReturnValue(true)
}));

import Epoch from '../../models/Epoch';
import Training from '../../models/Training';
import TestResult from '../../models/TestResult';
import { checkProjectAccess } from '../../services/projectAccessService';

const mockEpoch = Epoch as jest.Mocked<typeof Epoch>;
const mockTraining = Training as jest.Mocked<typeof Training>;
const mockTestResult = TestResult as jest.Mocked<typeof TestResult>;
const mockCheckProjectAccess = checkProjectAccess as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getEpochById', () => {
  it('throws NotFoundError when the epoch does not exist', async () => {
    mockEpoch.findById.mockResolvedValueOnce(null as never);
    const req = { params: { id: 'missing' }, user: { id: 'u1' } } as unknown as Request;

    await expect(getEpochById(req, makeRes())).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the caller cannot access the parent project', async () => {
    mockEpoch.findById.mockResolvedValueOnce({ trainingId: 't1' } as never);
    mockTraining.findById.mockResolvedValueOnce({ projectId: 'p1' } as never);
    mockCheckProjectAccess.mockResolvedValueOnce(false);

    const req = { params: { id: 'e1' }, user: { id: 'u1' } } as unknown as Request;

    await expect(getEpochById(req, makeRes())).rejects.toThrow(ForbiddenError);
  });

  it('returns the epoch when access is allowed', async () => {
    const epoch = { trainingId: 't1', epoch: 3 };
    mockEpoch.findById.mockResolvedValueOnce(epoch as never);
    mockTraining.findById.mockResolvedValueOnce({ projectId: 'p1' } as never);
    mockCheckProjectAccess.mockResolvedValueOnce(true);

    const req = { params: { id: 'e1' }, user: { id: 'u1' } } as unknown as Request;
    const res = makeRes();

    await getEpochById(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: epoch });
  });
});

describe('getEpochByUuid', () => {
  it('throws NotFoundError when no epoch matches the uuid', async () => {
    mockEpoch.findOne.mockResolvedValueOnce(null as never);
    const req = { params: { uuid: 'missing' }, user: { id: 'u1' } } as unknown as Request;

    await expect(getEpochByUuid(req, makeRes())).rejects.toThrow(NotFoundError);
  });
});

describe('createEpoch', () => {
  it('throws NotFoundError when the referenced training does not exist', async () => {
    mockTraining.findById.mockResolvedValueOnce(null as never);
    const req = { body: { trainingId: 'missing' }, user: { id: 'u1' } } as unknown as Request;

    await expect(createEpoch(req, makeRes())).rejects.toThrow(NotFoundError);
  });

  it('throws ForbiddenError when the caller cannot access the training project', async () => {
    mockTraining.findById.mockResolvedValueOnce({ projectId: 'p1' } as never);
    mockCheckProjectAccess.mockResolvedValueOnce(false);

    const req = { body: { trainingId: 't1' }, user: { id: 'u1' } } as unknown as Request;

    await expect(createEpoch(req, makeRes())).rejects.toThrow(ForbiddenError);
  });
});

describe('deleteEpoch', () => {
  const req = { params: { id: 'e1' }, user: { id: 'u1' } } as unknown as Request;

  it('throws NotFoundError for an epoch that is already deleted', async () => {
    mockEpoch.findById.mockResolvedValueOnce({ deletedAt: new Date() } as never);

    await expect(deleteEpoch(req, makeRes())).rejects.toThrow(NotFoundError);
  });

  it('refuses a caller who cannot reach the parent training, deleting nothing', async () => {
    const epoch = { trainingId: 't1', epoch_uuid: 'e1', save: jest.fn() };
    mockEpoch.findById.mockResolvedValueOnce(epoch as never);
    mockTraining.findById.mockResolvedValueOnce({ projectId: 'p1' } as never);
    mockCheckProjectAccess.mockResolvedValueOnce(false);

    await expect(deleteEpoch(req, makeRes())).rejects.toThrow(ForbiddenError);
    expect(epoch.save).not.toHaveBeenCalled();
    expect(mockTestResult.updateMany).not.toHaveBeenCalled();
  });

  it('soft-deletes the epoch and its live test results under one timestamp', async () => {
    const epoch: Record<string, unknown> = { trainingId: 't1', epoch_uuid: 'e1', save: jest.fn() };
    mockEpoch.findById.mockResolvedValueOnce(epoch as never);
    // A standalone run its caller owns: writable without a project lookup.
    mockTraining.findById.mockResolvedValueOnce({ ownerId: 'u1' } as never);
    mockCheckProjectAccess.mockResolvedValueOnce(true);
    const res = makeRes();

    await deleteEpoch(req, res);

    expect(epoch.save).toHaveBeenCalled();
    expect(epoch.deletedAt).toBeInstanceOf(Date);
    expect(mockTestResult.updateMany).toHaveBeenCalledWith(
      { epoch_uuid: 'e1', deletedAt: null },
      { deletedAt: epoch.deletedAt }
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Epoch deleted successfully' });
  });
});
