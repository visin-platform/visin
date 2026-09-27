import type { Request, Response } from 'express';

jest.mock('../../services/jobService', () => ({ getJob: jest.fn() }));
jest.mock('../../services/materializationService', () => ({}));
jest.mock('../../services/exportService', () => ({ jobStats: jest.fn() }));
jest.mock('../../clients/datasetServiceClient', () => ({ getPermission: jest.fn() }));

import { jobStats } from '../../controllers/jobController';
import { getJob } from '../../services/jobService';
import * as exportSvc from '../../services/exportService';
import { getPermission } from '../../clients/datasetServiceClient';

const permission = getPermission as jest.Mock;
const aggregate = { tasks: 12, completed: 4, answers: 7, perStratum: [{ stratum: 'night', tasks: 12, completed: 4 }], agreement: 0.8 };
const perUser = [{ userEmail: 'private@example.test', userName: 'Private Labeler', answered: 7 }];
const makeReq = (user: unknown = { id: 'account-id', email: 'viewer@example.test' }) => ({
  params: { id: 'job-id' }, query: { datasetId: 'other', role: 'owner' }, body: { datasetId: 'other' }, user,
}) as unknown as Request;
const respond = async (req = makeReq()) => {
  const json = jest.fn();
  await jobStats(req, { json } as unknown as Response);
  return JSON.parse(JSON.stringify(json.mock.calls[0][0]));
};

beforeEach(() => {
  jest.clearAllMocks();
  (getJob as jest.Mock).mockResolvedValue({ _id: 'job-id', datasetId: 'actual-dataset', isPublic: true, status: 'active', createdBy: { userId: 'c' } });
  (exportSvc.jobStats as jest.Mock).mockResolvedValue({ ...aggregate, perUser });
});

it('keeps aggregate statistics of a public job on a public dataset open to anonymous callers', async () => {
  permission.mockResolvedValue('read');
  expect(await respond(makeReq(null))).toEqual({ success: true, data: aggregate });
  expect(permission).toHaveBeenCalledWith('actual-dataset', undefined);
});

it.each(['read', 'contribute'])('hides identities from a caller who may %s the dataset', async level => {
  permission.mockResolvedValue(level);
  const result = await respond();
  expect(result).toEqual({ success: true, data: aggregate });
  expect(JSON.stringify(result)).not.toMatch(/private@example.test|Private Labeler|perUser/);
  expect(permission).toHaveBeenCalledWith('actual-dataset', 'account-id');
});

it.each(['manage', 'own'])('keeps the full breakdown for a caller who may %s the dataset', async level => {
  permission.mockResolvedValue(level);
  expect(await respond()).toEqual({ success: true, data: { ...aggregate, perUser } });
});

it('asks about the job’s own dataset, whatever the request names', async () => {
  permission.mockImplementation(async (datasetId: string) => (datasetId === 'other' ? 'manage' : 'read'));
  expect((await respond()).data).toEqual(aggregate);
});

it('checks again on the next request, after a demotion', async () => {
  permission.mockResolvedValueOnce('manage').mockResolvedValueOnce('contribute');
  expect((await respond()).data.perUser).toEqual(perUser);
  expect((await respond()).data).toEqual(aggregate);
});

it('fails before reading or sending statistics if the check fails', async () => {
  permission.mockRejectedValue(new Error('dataset-service unavailable'));
  const json = jest.fn();
  await expect(jobStats(makeReq(), { json } as unknown as Response)).rejects.toThrow('dataset-service unavailable');
  expect(exportSvc.jobStats).not.toHaveBeenCalled();
  expect(json).not.toHaveBeenCalled();
});
