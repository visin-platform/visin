jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() },
}));
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn() }));
const checkMembership = jest.fn();
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  createGroupServiceClient: () => ({ checkMembership, getMyGroups: jest.fn() }),
}));

import type { Request } from 'express';
import {
  callerGroups,
  canEditProject,
  checkProjectAccess,
  createProjectAccessChecker,
  getEditableProjectIds,
  getVisibleProjectIds,
  getVisibleTrainingIds,
  isWithinTokenScope,
  membershipOf,
  projectFilter,
  projectPermission,
} from '../../services/projectAccessService';
import Project, { type IProject } from '../../models/Project';
import Training from '../../models/Training';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { projectTokenContext } from '../../middleware/projectTokenContext';
import { requestIdentityContext } from '../../middleware/requestIdentityContext';

const mockedProject = Project as unknown as Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;
const groups = jest.mocked(getUserGroups);

const GROUP = 'a'.repeat(24);
const EDITORS = 'e'.repeat(24);
const project = (fields: Record<string, unknown> = {}) =>
  ({ _id: 'p1', owner: { kind: 'user', id: 'owner-1' }, visibility: 'private', editorGroupIds: [], ...fields }) as unknown as IProject;
const publicProject = project({ visibility: 'public' });
const privateProject = project({ _id: 'p2' });
const teamProject = project({ _id: 'p3', owner: { kind: 'group', id: GROUP } });

const asProjectKey = <T>(callback: () => Promise<T>) =>
  projectTokenContext.run({ projectId: 'p3', userId: 'u1' }, callback);

beforeEach(() => {
  jest.clearAllMocks();
  groups.mockResolvedValue([]);
});

describe('projectPermission', () => {
  it("gives a group-owned project's members their role's permission, and outsiders nothing", async () => {
    groups.mockResolvedValue([{ id: GROUP, name: 'Team', role: 'admin' }]);
    await expect(projectPermission(teamProject, 'u1')).resolves.toBe('manage');
    groups.mockResolvedValue([{ id: GROUP, name: 'Team', role: 'owner' }]);
    await expect(projectPermission(teamProject, 'u1')).resolves.toBe('own');
    groups.mockResolvedValue([]);
    await expect(projectPermission(teamProject, 'u1')).resolves.toBe('none');
  });

  it('gives an editor group contribute, never more than the owner gives', async () => {
    const shared = project({ editorGroupIds: [EDITORS] });
    groups.mockResolvedValue([{ id: EDITORS, name: 'Editors', role: 'member' }]);
    await expect(projectPermission(shared, 'u1')).resolves.toBe('contribute');
    await expect(projectPermission(shared, 'owner-1')).resolves.toBe('own');
    groups.mockResolvedValue([]);
    await expect(projectPermission(shared, 'u1')).resolves.toBe('none');
  });

  it('gives nothing for a trashed project, unless asked about the trash', async () => {
    const trashed = project({ trashedAt: new Date() });
    await expect(projectPermission(trashed, 'owner-1')).resolves.toBe('none');
    await expect(projectPermission(trashed, 'owner-1', { trashed: true })).resolves.toBe('own');
    await expect(projectPermission(null, 'owner-1')).resolves.toBe('none');
  });

  it('keeps a project key’s group role in its own project', async () => {
    groups.mockResolvedValue([{ id: GROUP, name: 'Team', role: 'admin' }]);
    await expect(asProjectKey(() => projectPermission(teamProject, 'u1'))).resolves.toBe('manage');
  });

  it('confines a project credential to its own project', async () => {
    await expect(asProjectKey(() => projectPermission(publicProject, 'owner-1'))).resolves.toBe('none');
  });
});

describe('checkProjectAccess', () => {
  it('denies anything without a project: every run has one', async () => {
    await expect(checkProjectAccess('u1', undefined)).resolves.toBe(false);
    await expect(checkProjectAccess('u1', null)).resolves.toBe(false);
    expect(mockedProject.findOne).not.toHaveBeenCalled();
  });

  it('denies when the project does not exist', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(null);

    await expect(checkProjectAccess('u1', 'ghost')).resolves.toBe(false);
  });

  it('resolves by slug first', async () => {
    mockedProject.findOne.mockResolvedValue(publicProject);

    await expect(checkProjectAccess(undefined, 'my-slug')).resolves.toBe(true);
    expect(mockedProject.findOne).toHaveBeenCalledWith({ slug: 'my-slug' });
    expect(mockedProject.findById).not.toHaveBeenCalled();
  });

  it('looks an ObjectId-shaped reference up by id only', async () => {
    mockedProject.findById.mockResolvedValue(publicProject);
    await expect(checkProjectAccess(undefined, 'b'.repeat(24))).resolves.toBe(true);
    expect(mockedProject.findOne).not.toHaveBeenCalled();
  });

  it('falls back to ObjectId lookup, swallowing cast errors', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockImplementation(() => Promise.reject(new Error('CastError')) as never);

    await expect(checkProjectAccess('u1', 'not-an-object-id')).resolves.toBe(false);
  });

  it('opens public projects to everyone, even anonymous', async () => {
    mockedProject.findOne.mockResolvedValue(publicProject);

    await expect(checkProjectAccess(undefined, 'p1')).resolves.toBe(true);
    await expect(checkProjectAccess('stranger', 'p1')).resolves.toBe(true);
  });

  it('restricts private projects to their owner', async () => {
    mockedProject.findOne.mockResolvedValue(privateProject);

    await expect(checkProjectAccess('owner-1', 'p2')).resolves.toBe(true);
    await expect(checkProjectAccess('stranger', 'p2')).resolves.toBe(false);
    await expect(checkProjectAccess(undefined, 'p2')).resolves.toBe(false);
  });
});

describe('canEditProject', () => {
  it('needs contribute: a reader of a public project cannot add to it', async () => {
    await expect(canEditProject(publicProject, 'stranger')).resolves.toBe(false);
    await expect(canEditProject(publicProject, 'owner-1')).resolves.toBe(true);
    await expect(canEditProject(publicProject, undefined)).resolves.toBe(false);
  });
});

describe('createProjectAccessChecker', () => {
  it('resolves a repeated project id once, not once per row', async () => {
    mockedProject.findOne.mockResolvedValue(publicProject);
    const hasAccess = createProjectAccessChecker('u1');

    const results = await Promise.all(['p1', 'p1', 'p1'].map(hasAccess));

    expect(results).toEqual([true, true, true]);
    expect(mockedProject.findOne).toHaveBeenCalledTimes(1);
  });

  it('memoizes sequential calls too, not just concurrent ones', async () => {
    mockedProject.findOne.mockResolvedValue(publicProject);
    const hasAccess = createProjectAccessChecker('u1');

    await hasAccess('p1');
    await hasAccess('p1');

    expect(mockedProject.findOne).toHaveBeenCalledTimes(1);
  });

  it('still resolves each distinct project separately', async () => {
    mockedProject.findOne.mockImplementation((query: { slug: string }) =>
      Promise.resolve(query.slug === 'p1' ? publicProject : privateProject)
    );
    const hasAccess = createProjectAccessChecker('u1');

    await expect(hasAccess('p1')).resolves.toBe(true);
    await expect(hasAccess('p2')).resolves.toBe(false);
    expect(mockedProject.findOne).toHaveBeenCalledTimes(2);
  });

  it('denies a row without a project, without a lookup', async () => {
    const hasAccess = createProjectAccessChecker('u1');

    await expect(hasAccess(undefined)).resolves.toBe(false);
    await expect(hasAccess(null)).resolves.toBe(false);
    expect(mockedProject.findOne).not.toHaveBeenCalled();
  });

  it('does not share its memo between two checkers', async () => {
    mockedProject.findOne.mockResolvedValue(privateProject);

    await expect(createProjectAccessChecker('owner-1')('p2')).resolves.toBe(true);
    await expect(createProjectAccessChecker('intruder')('p2')).resolves.toBe(false);
  });
});

describe('projectFilter', () => {
  it('keeps public projects, mine, my groups’ and those shared with my groups, live ones only', async () => {
    groups.mockResolvedValue([{ id: GROUP, name: 'Team', role: 'member' }]);
    await expect(projectFilter('u1')).resolves.toEqual({
      $and: [
        { trashedAt: null },
        {
          $or: [
            { visibility: 'public' },
            { 'owner.kind': 'user', 'owner.id': 'u1' },
            { 'owner.kind': 'group', 'owner.id': { $in: [GROUP] } },
            { editorGroupIds: { $in: [GROUP] } },
          ],
        },
      ],
    });
  });

  it('asks for the role a level needs, and leaves editor groups out of manage', async () => {
    groups.mockResolvedValue([{ id: GROUP, name: 'Team', role: 'member' }]);
    await expect(projectFilter('u1', 'manage', { trashed: true })).resolves.toEqual({
      $and: [{ trashedAt: { $ne: null } }, { $or: [{ 'owner.kind': 'user', 'owner.id': 'u1' }] }],
    });
  });

  it('matches nothing for a level nobody signed out holds', async () => {
    await expect(projectFilter(undefined, 'contribute')).resolves.toEqual({ $and: [{ trashedAt: null }, { _id: { $in: [] } }] });
  });

  it('confines a project key to its project', async () => {
    const filter = await asProjectKey(() => projectFilter('u1'));
    expect(filter).toEqual({
      $and: [{ trashedAt: null }, { $or: [{ visibility: 'public' }, { 'owner.kind': 'user', 'owner.id': 'u1' }] }, { _id: 'p3' }],
    });
  });
});

describe('getVisibleProjectIds and getEditableProjectIds', () => {
  const projectDocs = [{ _id: { toString: () => 'p1' } }, { _id: { toString: () => 'p2' } }];

  it('returns the ids the filter finds', async () => {
    const select = jest.fn().mockResolvedValue(projectDocs);
    mockedProject.find.mockReturnValue({ select });

    await expect(getVisibleProjectIds('u1')).resolves.toEqual(['p1', 'p2']);
    await expect(getEditableProjectIds('u1')).resolves.toEqual(['p1', 'p2']);
    await expect(getEditableProjectIds(undefined)).resolves.toEqual([]);
    expect(mockedProject.find).toHaveBeenCalledTimes(2);
  });
});

describe('getVisibleTrainingIds', () => {
  it('includes live trainings in visible projects only', async () => {
    const projectSelect = jest.fn().mockResolvedValue([{ _id: { toString: () => 'p1' } }]);
    mockedProject.find.mockReturnValue({ select: projectSelect });
    const trainingSelect = jest.fn().mockResolvedValue([{ _id: { toString: () => 't1' } }]);
    mockedTraining.find.mockReturnValue({ select: trainingSelect });

    await expect(getVisibleTrainingIds('u1')).resolves.toEqual(['t1']);
    expect(mockedTraining.find).toHaveBeenCalledWith({ deletedAt: null, projectId: { $in: ['p1'] } });
  });
});

describe('callerGroups and membershipOf', () => {
  const inRequest = <T>(callback: () => Promise<T>) =>
    requestIdentityContext.run({ request: { user: { id: 'u1' } } as Request }, callback);

  it("reads the caller's groups, a missing role as a plain member", async () => {
    groups.mockResolvedValue([{ id: GROUP, name: 'Team' } as never]);
    await expect(callerGroups.getMyGroups('u1')).resolves.toEqual([{ groupId: GROUP, name: 'Team', role: 'member' }]);
    await expect(callerGroups.checkMembership(GROUP, 'u1')).resolves.toEqual({ member: true, role: 'member' });
    await expect(callerGroups.checkMembership('other', 'u1')).resolves.toEqual({ member: false, role: null });
  });

  it("asks group-service about anyone else's membership", async () => {
    groups.mockResolvedValue([{ id: GROUP, name: 'Team', role: 'owner' }]);
    checkMembership.mockResolvedValue({ member: true, role: 'member' });
    await expect(inRequest(() => membershipOf(GROUP, 'u1'))).resolves.toEqual({ member: true, role: 'owner' });
    await expect(inRequest(() => membershipOf(GROUP, 'u2'))).resolves.toEqual({ member: true, role: 'member' });
    expect(checkMembership).toHaveBeenCalledWith(GROUP, 'u2');
  });
});

describe('isWithinTokenScope', () => {
  it('does not constrain JWT/anonymous requests', () => {
    expect(isWithinTokenScope(undefined, 'anything')).toBe(true);
    expect(isWithinTokenScope(undefined, null)).toBe(true);
  });

  it('confines an API token to its own project', () => {
    expect(isWithinTokenScope('p1', 'p1')).toBe(true);
    expect(isWithinTokenScope('p1', 'p2')).toBe(false);
    expect(isWithinTokenScope('p1', null)).toBe(false);
    expect(isWithinTokenScope('p1', undefined)).toBe(false);
  });

  it('compares ids as strings', () => {
    expect(isWithinTokenScope('p1', { toString: () => 'p1' } as unknown as string)).toBe(true);
  });
});
