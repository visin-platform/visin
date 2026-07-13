jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() },
}));
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));

import {
  checkProjectAccess,
  isProjectOwner,
  getVisibleProjectIds,
  getVisibleTrainingIds,
  isWithinTokenScope,
} from '../../services/projectAccessService';
import Project from '../../models/Project';
import Training from '../../models/Training';

const mockedProject = Project as unknown as Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;

const publicProject = { _id: 'p1', isPublic: true, ownerId: 'owner-1' };
const privateProject = { _id: 'p2', isPublic: false, ownerId: 'owner-1' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkProjectAccess', () => {
  it('allows anything not scoped to a project', async () => {
    await expect(checkProjectAccess('u1', undefined)).resolves.toBe(true);
    await expect(checkProjectAccess('u1', null)).resolves.toBe(true);
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

  it('falls back to ObjectId lookup, swallowing cast errors', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockReturnValue({ catch: () => Promise.resolve(null) } as never);
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

describe('isProjectOwner', () => {
  it('is false without a user or project', async () => {
    await expect(isProjectOwner(undefined, 'p1')).resolves.toBe(false);
    await expect(isProjectOwner('u1', undefined)).resolves.toBe(false);
  });

  it('ignores public visibility — only ownership counts', async () => {
    mockedProject.findOne.mockResolvedValue(publicProject);

    await expect(isProjectOwner('owner-1', 'p1')).resolves.toBe(true);
    await expect(isProjectOwner('stranger', 'p1')).resolves.toBe(false);
  });

  it('is false when the project cannot be resolved', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockImplementation(() => Promise.reject(new Error('CastError')) as never);

    await expect(isProjectOwner('u1', 'ghost')).resolves.toBe(false);
  });
});

describe('getVisibleProjectIds', () => {
  const projectDocs = [{ _id: { toString: () => 'p1' } }, { _id: { toString: () => 'p2' } }];

  it('returns public + owned for a logged-in user', async () => {
    const select = jest.fn().mockResolvedValue(projectDocs);
    mockedProject.find.mockReturnValue({ select });

    await expect(getVisibleProjectIds('u1')).resolves.toEqual(['p1', 'p2']);
    expect(mockedProject.find).toHaveBeenCalledWith({
      $or: [{ isPublic: true }, { ownerId: 'u1' }],
    });
  });

  it('returns only public projects for anonymous callers', async () => {
    const select = jest.fn().mockResolvedValue([]);
    mockedProject.find.mockReturnValue({ select });

    await expect(getVisibleProjectIds(undefined)).resolves.toEqual([]);
    expect(mockedProject.find).toHaveBeenCalledWith({ isPublic: true });
  });
});

describe('getVisibleTrainingIds', () => {
  it('includes trainings in visible projects plus unscoped ones', async () => {
    const projectSelect = jest.fn().mockResolvedValue([{ _id: { toString: () => 'p1' } }]);
    mockedProject.find.mockReturnValue({ select: projectSelect });
    const trainingSelect = jest.fn().mockResolvedValue([{ _id: { toString: () => 't1' } }]);
    mockedTraining.find.mockReturnValue({ select: trainingSelect });

    await expect(getVisibleTrainingIds('u1')).resolves.toEqual(['t1']);
    expect(mockedTraining.find).toHaveBeenCalledWith({
      deletedAt: null,
      $or: [{ projectId: { $in: ['p1'] } }, { projectId: { $exists: false } }, { projectId: null }],
    });
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
