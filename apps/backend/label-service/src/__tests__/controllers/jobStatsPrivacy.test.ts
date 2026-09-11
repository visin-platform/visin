import type { Request, Response } from 'express';

jest.mock('../../services/jobService', () => ({ getJob: jest.fn() }));
jest.mock('../../services/materializationService', () => ({}));
jest.mock('../../services/exportService', () => ({ jobStats: jest.fn() }));
jest.mock('../../clients/groupServiceClient', () => ({ checkMembership: jest.fn() }));

import { jobStats } from '../../controllers/jobController';
import { getJob } from '../../services/jobService';
import * as exportSvc from '../../services/exportService';
import { checkMembership } from '../../clients/groupServiceClient';

const aggregate = { tasks: 12, completed: 4, answers: 7, perStratum: [{ stratum: 'night', tasks: 12, completed: 4 }], agreement: 0.8 };
const perUser = [{ userEmail: 'private@example.test', userName: 'Private Labeler', answered: 7 }];
const makeReq = (user: unknown = { id: 'account-id', email: 'viewer@example.test' }) => ({
  params: { id: 'job-id' }, query: { groupId: 'other-group', role: 'owner' }, body: { groupId: 'other-group' }, user,
}) as unknown as Request;
const respond = async (req = makeReq()) => {
  const json = jest.fn();
  await jobStats(req, { json } as unknown as Response);
  return JSON.parse(JSON.stringify(json.mock.calls[0][0]));
};

beforeEach(() => {
  jest.clearAllMocks();
  (getJob as jest.Mock).mockResolvedValue({ _id: 'job-id', groupId: 'actual-group', isPublic: true, status: 'active' });
  (exportSvc.jobStats as jest.Mock).mockResolvedValue({ ...aggregate, perUser });
});

it('keeps anonymous aggregate statistics available without a membership lookup', async () => {
  expect(await respond(makeReq(null))).toEqual({ success: true, data: aggregate });
  expect(checkMembership).not.toHaveBeenCalled();
});

it.each([
  { member: true, role: 'member' },
  { member: false, role: null },
  { member: false, role: 'admin' },
  { member: true, role: null },
  { member: true, role: 'unknown' },
])('hides identities for membership $member / role $role', async membership => {
  (checkMembership as jest.Mock).mockResolvedValue(membership);
  const result = await respond();
  expect(result).toEqual({ success: true, data: aggregate });
  expect(JSON.stringify(result)).not.toMatch(/private@example.test|Private Labeler|perUser/);
  expect(checkMembership).toHaveBeenCalledWith('actual-group', 'account-id');
});

it.each(['owner', 'admin'])('preserves the full breakdown for a current group %s', async role => {
  (checkMembership as jest.Mock).mockResolvedValue({ member: true, role });
  expect(await respond()).toEqual({ success: true, data: { ...aggregate, perUser } });
  expect(checkMembership).toHaveBeenCalledWith('actual-group', 'account-id');
});

it('does not grant access from caller-supplied roles or a different group', async () => {
  (checkMembership as jest.Mock).mockImplementation(async groupId => ({ member: groupId === 'other-group', role: 'admin' }));
  const result = await respond(makeReq({ id: 'account-id', role: 'admin', groupId: 'other-group' }));
  expect(result.data).toEqual(aggregate);
  expect(checkMembership).toHaveBeenCalledWith('actual-group', 'account-id');
});

it('checks permissions again on the next request after demotion', async () => {
  (checkMembership as jest.Mock).mockResolvedValueOnce({ member: true, role: 'admin' }).mockResolvedValueOnce({ member: true, role: 'member' });
  expect((await respond()).data.perUser).toEqual(perUser);
  expect((await respond()).data).toEqual(aggregate);
  expect(checkMembership).toHaveBeenCalledTimes(2);
});

it('fails before reading or sending statistics if membership verification fails', async () => {
  (checkMembership as jest.Mock).mockRejectedValue(new Error('group-service unavailable'));
  const json = jest.fn();
  await expect(jobStats(makeReq(), { json } as unknown as Response)).rejects.toThrow('group-service unavailable');
  expect(exportSvc.jobStats).not.toHaveBeenCalled();
  expect(json).not.toHaveBeenCalled();
});
