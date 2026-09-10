import type { Response } from 'express';

jest.mock('../../services/groupService', () => ({
  createGroup: jest.fn(),
  listMyGroups: jest.fn(),
  listMyDeletedGroups: jest.fn(),
  getGroupIfMember: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  restoreGroup: jest.fn(),
  permanentlyDeleteGroup: jest.fn(),
  updateMemberRole: jest.fn(),
  removeMember: jest.fn(),
  checkMembership: jest.fn(),
  updateMemberActivity: jest.fn(),
  memberRole: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as ctrl from '../../controllers/groupController';
import * as svc from '../../services/groupService';
import type { InternalServiceRequest } from '../../middleware/internalServiceAuth';

const mockedSvc = svc as unknown as Record<string, jest.Mock>;

type MockRes = Response & { json: jest.Mock; status: jest.Mock; send: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): InternalServiceRequest =>
  ({ body: {}, query: {}, params: {}, ...overrides } as unknown as InternalServiceRequest);

const userReq = (overrides: Record<string, unknown> = {}) =>
  makeReq({ user: { id: 'User-ID', email: 'User@X.com' }, ...overrides });

const group = { _id: { toString: () => 'g1' }, name: 'Team' };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.AUTH_SERVICE_URL;
  delete process.env.INTERNAL_SERVICE_TOKEN;
});

describe('userId resolution', () => {
  it('uses the authenticated account ID', async () => {
    mockedSvc.createGroup.mockResolvedValue(group);
    const res = makeRes();

    await ctrl.createGroup(userReq({ body: { name: 'Team' } }), res);

    expect(mockedSvc.createGroup).toHaveBeenCalledWith('User-ID', 'Team', 'User@X.com');
  });

  it('ignores a body userId for internal service requests', async () => {
    // validateRequest parses the body through a Zod object schema, which strips
    // unknown keys — a userId sent in the body never reaches the controller,
    // so it must not look like a working alternative to the query string.
    await expect(
      ctrl.createGroup(
        makeReq({ isInternalService: true, body: { name: 'Team', userId: 'svc@x.com' } }),
        makeRes()
      )
    ).rejects.toThrow('User ID required');
  });

  it('uses query userId for internal service requests without normalization', async () => {
    mockedSvc.createGroup.mockResolvedValue(group);

    await ctrl.createGroup(
      makeReq({ isInternalService: true, body: { name: 'Team' }, query: { userId: 'Svc@X.com' } }),
      makeRes()
    );

    expect(mockedSvc.createGroup).toHaveBeenCalledWith('Svc@X.com', 'Team', undefined);
  });

  it('rejects ambiguous repeated user IDs', async () => {
    await expect(ctrl.listMine(makeReq({ isInternalService: true, query: { userId: ['a', 'b'] } }), makeRes()))
      .rejects.toThrow('User ID required');
  });

  it('throws BadRequest when no email can be resolved', async () => {
    await expect(ctrl.createGroup(makeReq({ body: { name: 'T' } }), makeRes())).rejects.toThrow(
      'User ID required'
    );
    await expect(ctrl.listMine(makeReq({ isInternalService: true }), makeRes())).rejects.toThrow(
      'User ID required'
    );
    await expect(ctrl.listMyDeleted(makeReq(), makeRes())).rejects.toThrow('User ID required');
    await expect(ctrl.getMyGroupRoles(makeReq(), makeRes())).rejects.toThrow('User ID required');
  });
});

describe('createGroup', () => {
  it('responds 201 with the new group', async () => {
    mockedSvc.createGroup.mockResolvedValue(group);
    const res = makeRes();

    await ctrl.createGroup(userReq({ body: { name: 'Team' } }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: group });
  });
});

describe('listMine', () => {
  it('lists groups and refreshes member activity in a single write', async () => {
    const groups = [group, { _id: { toString: () => 'g2' }, name: 'Two' }];
    mockedSvc.listMyGroups.mockResolvedValue(groups);
    mockedSvc.updateMemberActivity.mockResolvedValue(undefined);
    const res = makeRes();

    await ctrl.listMine(userReq(), res);

    expect(mockedSvc.updateMemberActivity).toHaveBeenCalledTimes(1);
    expect(mockedSvc.updateMemberActivity).toHaveBeenCalledWith(['g1', 'g2'], 'User-ID');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: groups });
  });
});

describe('listMyDeleted', () => {
  it('returns soft-deleted groups', async () => {
    mockedSvc.listMyDeletedGroups.mockResolvedValue([group]);
    const res = makeRes();

    await ctrl.listMyDeleted(userReq(), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: [group] });
  });
});

describe('getMyGroupRoles', () => {
  it('returns the distinct roles held across the user groups', async () => {
    const second = { _id: { toString: () => 'g2' }, name: 'Two' };
    mockedSvc.listMyGroups.mockResolvedValue([group, second]);
    mockedSvc.memberRole.mockReturnValueOnce('owner').mockReturnValueOnce('member');
    const res = makeRes();

    await ctrl.getMyGroupRoles(userReq(), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: ['owner', 'member'] });
  });

  it('de-duplicates repeated roles', async () => {
    mockedSvc.listMyGroups.mockResolvedValue([group, { _id: { toString: () => 'g2' } }]);
    mockedSvc.memberRole.mockReturnValue('admin');
    const res = makeRes();

    await ctrl.getMyGroupRoles(userReq(), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: ['admin'] });
  });
});

describe('single-group handlers', () => {
  it('getOne returns the group for a member', async () => {
    mockedSvc.getGroupIfMember.mockResolvedValue(group);
    const res = makeRes();

    await ctrl.getOne(userReq({ params: { id: 'g1' } }), res);

    expect(mockedSvc.getGroupIfMember).toHaveBeenCalledWith('g1', 'User-ID');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: group });
  });

  it('updateGroup renames', async () => {
    mockedSvc.updateGroup.mockResolvedValue(group);
    const res = makeRes();

    await ctrl.updateGroup(userReq({ params: { id: 'g1' }, body: { name: 'New' } }), res);

    expect(mockedSvc.updateGroup).toHaveBeenCalledWith('g1', 'User-ID', { name: 'New' });
  });

  it('deleteGroup responds 204', async () => {
    mockedSvc.deleteGroup.mockResolvedValue(undefined);
    const res = makeRes();

    await ctrl.deleteGroup(userReq({ params: { id: 'g1' } }), res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('restoreGroup returns the restored group', async () => {
    mockedSvc.restoreGroup.mockResolvedValue(group);
    const res = makeRes();

    await ctrl.restoreGroup(userReq({ params: { id: 'g1' } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: group });
  });

  it('permanentlyDeleteGroup responds 204', async () => {
    mockedSvc.permanentlyDeleteGroup.mockResolvedValue(undefined);
    const res = makeRes();

    await ctrl.permanentlyDeleteGroup(userReq({ params: { id: 'g1' } }), res);

    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('membership reports the result', async () => {
    mockedSvc.checkMembership.mockResolvedValue({ member: true, role: 'admin' });
    const res = makeRes();

    await ctrl.membership(userReq({ params: { id: 'g1' } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, member: true, role: 'admin' });
  });
});


describe('membership mutations use account IDs', () => {
  it('updates the target role', async () => {
    mockedSvc.updateMemberRole.mockResolvedValue(group);
    await ctrl.updateRole(userReq({ params: { id: 'g1', memberId: 'target-ID' }, body: { role: 'admin' } }), makeRes());
    expect(mockedSvc.updateMemberRole).toHaveBeenCalledWith('g1', 'User-ID', 'target-ID', 'admin');
  });
  it('removes the target member', async () => {
    mockedSvc.removeMember.mockResolvedValue(group);
    await ctrl.removeMember(userReq({ params: { id: 'g1', memberId: 'target-ID' } }), makeRes());
    expect(mockedSvc.removeMember).toHaveBeenCalledWith('g1', 'User-ID', 'target-ID');
  });
});
