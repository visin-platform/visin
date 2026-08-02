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
  addMember: jest.fn(),
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
import { logger } from '@visin/backend-core';
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
  makeReq({ user: { email: 'User@X.com' }, ...overrides });

const group = { _id: { toString: () => 'g1' }, name: 'Team' };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.AUTH_SERVICE_URL;
  delete process.env.INTERNAL_SERVICE_TOKEN;
});

describe('userEmail resolution', () => {
  it('uses the authenticated user email, lowercased', async () => {
    mockedSvc.createGroup.mockResolvedValue(group);
    const res = makeRes();

    await ctrl.createGroup(userReq({ body: { name: 'Team' } }), res);

    expect(mockedSvc.createGroup).toHaveBeenCalledWith('user@x.com', 'Team');
  });

  it('ignores a body userEmail for internal service requests', async () => {
    // validateRequest parses the body through a Zod object schema, which strips
    // unknown keys — a userEmail sent in the body never reaches the controller,
    // so it must not look like a working alternative to the query string.
    await expect(
      ctrl.createGroup(
        makeReq({ isInternalService: true, body: { name: 'Team', userEmail: 'svc@x.com' } }),
        makeRes()
      )
    ).rejects.toThrow('User email required');
  });

  it('uses query userEmail for internal service requests, lowercased', async () => {
    mockedSvc.createGroup.mockResolvedValue(group);

    await ctrl.createGroup(
      makeReq({ isInternalService: true, body: { name: 'Team' }, query: { userEmail: 'Svc@X.com' } }),
      makeRes()
    );

    expect(mockedSvc.createGroup).toHaveBeenCalledWith('svc@x.com', 'Team');
  });

  it('unwraps a repeated query userEmail', async () => {
    const sortable = [group];
    mockedSvc.listMyGroups.mockResolvedValue(sortable);
    mockedSvc.updateMemberActivity.mockResolvedValue(undefined);

    await ctrl.listMine(
      makeReq({ isInternalService: true, query: { userEmail: ['q@x.com', 'other@x.com'] } }),
      makeRes()
    );

    expect(mockedSvc.listMyGroups).toHaveBeenCalledWith('q@x.com');
  });

  it('throws BadRequest when no email can be resolved', async () => {
    await expect(ctrl.createGroup(makeReq({ body: { name: 'T' } }), makeRes())).rejects.toThrow(
      'User email required'
    );
    await expect(ctrl.listMine(makeReq({ isInternalService: true }), makeRes())).rejects.toThrow(
      'User email required'
    );
    await expect(ctrl.listMyDeleted(makeReq(), makeRes())).rejects.toThrow('User email required');
    await expect(ctrl.getMyGroupRoles(makeReq(), makeRes())).rejects.toThrow('User email required');
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
    expect(mockedSvc.updateMemberActivity).toHaveBeenCalledWith(['g1', 'g2'], 'user@x.com');
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

    expect(mockedSvc.getGroupIfMember).toHaveBeenCalledWith('g1', 'user@x.com');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: group });
  });

  it('updateGroup renames', async () => {
    mockedSvc.updateGroup.mockResolvedValue(group);
    const res = makeRes();

    await ctrl.updateGroup(userReq({ params: { id: 'g1' }, body: { name: 'New' } }), res);

    expect(mockedSvc.updateGroup).toHaveBeenCalledWith('g1', 'user@x.com', { name: 'New' });
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

describe('membership mutations + token invalidation', () => {
  const configureAuthService = () => {
    process.env.AUTH_SERVICE_URL = 'http://auth';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
  };

  it('addMember responds 201 and invalidates the new member tokens', async () => {
    configureAuthService();
    mockedSvc.addMember.mockResolvedValue(group);
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const res = makeRes();

    await ctrl.addMember(
      userReq({ params: { id: 'g1' }, body: { email: 'new@x.com', role: 'member' } }),
      res
    );

    expect(mockedSvc.addMember).toHaveBeenCalledWith('g1', 'user@x.com', 'new@x.com', 'member');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://auth/api/auth/internal/invalidate-tokens',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'new@x.com' }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateRole invalidates the affected member tokens', async () => {
    configureAuthService();
    mockedSvc.updateMemberRole.mockResolvedValue(group);
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const res = makeRes();

    await ctrl.updateRole(
      userReq({ params: { id: 'g1', memberEmail: 'm@x.com' }, body: { role: 'admin' } }),
      res
    );

    expect(mockedSvc.updateMemberRole).toHaveBeenCalledWith('g1', 'user@x.com', 'm@x.com', 'admin');
    expect(global.fetch).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: group });
  });

  it('removeMember invalidates the removed member tokens', async () => {
    configureAuthService();
    mockedSvc.removeMember.mockResolvedValue(group);
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const res = makeRes();

    await ctrl.removeMember(userReq({ params: { id: 'g1', memberEmail: 'm@x.com' } }), res);

    expect(mockedSvc.removeMember).toHaveBeenCalledWith('g1', 'user@x.com', 'm@x.com');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('skips invalidation and warns when auth service is not configured', async () => {
    mockedSvc.addMember.mockResolvedValue(group);
    global.fetch = jest.fn() as unknown as typeof fetch;

    await ctrl.addMember(userReq({ params: { id: 'g1' }, body: { email: 'new@x.com' } }), makeRes());

    expect(global.fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Auth service not configured for token invalidation');
  });

  it('logs but does not fail when invalidation responds non-ok', async () => {
    configureAuthService();
    mockedSvc.addMember.mockResolvedValue(group);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const res = makeRes();

    await ctrl.addMember(userReq({ params: { id: 'g1' }, body: { email: 'new@x.com' } }), res);

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to invalidate tokens',
      expect.objectContaining({ status: 500 })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('logs but does not fail when invalidation fetch rejects', async () => {
    configureAuthService();
    mockedSvc.addMember.mockResolvedValue(group);
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    const res = makeRes();

    await ctrl.addMember(userReq({ params: { id: 'g1' }, body: { email: 'new@x.com' } }), res);

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to invalidate tokens',
      expect.objectContaining({ error: 'down' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
