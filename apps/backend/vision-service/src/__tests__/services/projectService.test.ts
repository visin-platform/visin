jest.mock('../../models/Project', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { find: jest.fn(), aggregate: jest.fn() },
}));
jest.mock('../../models/Benchmark', () => ({
  __esModule: true,
  default: { countDocuments: jest.fn() },
}));

import {
  listProjects,
  getProjectBySlug,
  getProjectById,
  getProjectByIdOrSlug,
  createProject,
  updateProject,
  deleteProject,
  getProjectDashboardStats,
} from '../../services/projectService';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Benchmark from '../../models/Benchmark';

const mockedProject = Project as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;
const mockedBenchmark = Benchmark as unknown as Record<string, jest.Mock>;

// Escape hatch for asserting on dynamically-shaped service results in tests;
// modeling every ad-hoc return shape as an interface here would add noise, not safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

const projectDoc = (overrides: AnyDoc = {}): AnyDoc => ({
  _id: { toString: () => 'p1' },
  name: 'P',
  slug: 'p-slug',
  isPublic: true,
  ownerId: 'owner-1',
  save: jest.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
  deleteOne: jest.fn().mockResolvedValue({}),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listProjects', () => {
  it('includes owned private projects for a logged-in user', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    mockedProject.find.mockReturnValue({ sort });

    await listProjects('u1', { sortBy: 'createdAt', sortOrder: -1 });

    expect(mockedProject.find).toHaveBeenCalledWith({
      $or: [{ isPublic: true }, { ownerId: 'u1' }],
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('anonymous users see public projects only, with text search applied', async () => {
    const sort = jest.fn().mockResolvedValue([]);
    mockedProject.find.mockReturnValue({ sort });

    await listProjects(undefined, { search: 'seg', sortBy: 'name', sortOrder: 1 });

    expect(mockedProject.find).toHaveBeenCalledWith({
      $or: [{ isPublic: true }],
      $text: { $search: 'seg' },
    });
  });
});

describe('project lookups', () => {
  it('404s consistently across all three lookups', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(null);

    await expect(getProjectBySlug('ghost', 'u1')).rejects.toThrow('Project not found');
    await expect(getProjectById('ghost', 'u1')).rejects.toThrow('Project not found');
    await expect(getProjectByIdOrSlug('ghost', 'u1')).rejects.toThrow('Project not found');
  });

  it('403s on private projects for non-owners (and anonymous)', async () => {
    const privateProject = projectDoc({ isPublic: false });
    mockedProject.findOne.mockResolvedValue(privateProject);
    mockedProject.findById.mockResolvedValue(privateProject);

    await expect(getProjectBySlug('p-slug', 'stranger')).rejects.toThrow();
    await expect(getProjectById('p1', undefined)).rejects.toThrow();
    await expect(getProjectByIdOrSlug('p1', 'stranger')).rejects.toThrow();
  });

  it('lets the owner read a private project and everyone read public ones', async () => {
    const privateProject = projectDoc({ isPublic: false });
    mockedProject.findOne.mockResolvedValue(privateProject);

    await expect(getProjectBySlug('p-slug', 'owner-1')).resolves.toBe(privateProject);

    mockedProject.findOne.mockResolvedValue(projectDoc());
    await expect(getProjectBySlug('p-slug', undefined)).resolves.toBeDefined();
  });

  it('getProjectByIdOrSlug falls back from slug to id', async () => {
    const doc = projectDoc();
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(doc);

    await expect(getProjectByIdOrSlug('p1', 'u1')).resolves.toBe(doc);
    expect(mockedProject.findOne).toHaveBeenCalledWith({ slug: 'p1' });
    expect(mockedProject.findById).toHaveBeenCalledWith('p1');
  });
});

describe('createProject', () => {
  it('stamps the creator as owner', async () => {
    mockedProject.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ ...data, _id: 'new' }),
    }));

    const result = (await createProject('u1', { name: 'New', isPublic: true })) as AnyDoc;

    expect(mockedProject).toHaveBeenCalledWith({ name: 'New', isPublic: true, ownerId: 'u1' });
    expect(result._id).toBe('new');
  });
});

describe('updateProject', () => {
  it('404s when missing and 403s for non-owners', async () => {
    mockedProject.findById.mockResolvedValue(null);
    await expect(updateProject('p1', 'u1', {})).rejects.toThrow('Project not found');

    mockedProject.findById.mockResolvedValue(projectDoc());
    await expect(updateProject('p1', 'stranger', {})).rejects.toThrow();
  });

  it('applies partial updates', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);

    await updateProject('p1', 'owner-1', { name: 'Renamed', description: '', isPublic: false });

    expect(doc.name).toBe('Renamed');
    expect(doc.description).toBe('');
    expect(doc.isPublic).toBe(false);
    expect(doc.save).toHaveBeenCalled();
  });

  it('enforces slug uniqueness', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);
    mockedProject.findOne.mockResolvedValue(projectDoc({ _id: { toString: () => 'other' } }));

    await expect(updateProject('p1', 'owner-1', { slug: 'taken' })).rejects.toThrow(
      'Slug already exists'
    );
  });

  it('sets a unique slug (trimmed) and clears an empty one', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);
    mockedProject.findOne.mockResolvedValue(null);

    await updateProject('p1', 'owner-1', { slug: ' fresh ' });
    expect(doc.slug).toBe('fresh');

    await updateProject('p1', 'owner-1', { slug: '  ' });
    expect(doc.slug).toBeUndefined();
  });
});

describe('deleteProject', () => {
  it('404s when missing and 403s for non-owners', async () => {
    mockedProject.findById.mockResolvedValue(null);
    await expect(deleteProject('p1', 'u1')).rejects.toThrow('Project not found');

    mockedProject.findById.mockResolvedValue(projectDoc());
    await expect(deleteProject('p1', 'stranger')).rejects.toThrow();
  });

  it('deletes when the owner asks', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);

    await deleteProject('p1', 'owner-1');

    expect(doc.deleteOne).toHaveBeenCalled();
  });
});

describe('getProjectDashboardStats', () => {
  it('404s / 403s before aggregating', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(null);
    await expect(getProjectDashboardStats('ghost', 'u1')).rejects.toThrow('Project not found');

    mockedProject.findOne.mockResolvedValue(projectDoc({ isPublic: false }));
    await expect(getProjectDashboardStats('p-slug', 'stranger')).rejects.toThrow();
  });

  it('aggregates training stats and counts across collections', async () => {
    mockedProject.findOne.mockResolvedValue(projectDoc());
    mockedTraining.aggregate
      .mockResolvedValueOnce([
        {
          totalTrainings: 2,
          totalTime: 7200,
          totalEpochs: 4,
          avgEpochTime: 1800,
          totalCpuCost: 0.012,
          totalGpuCost: 0.4,
          totalCost: 0.412,
        },
      ])
      .mockResolvedValueOnce([{ count: 9 }])
      .mockResolvedValueOnce([{ count: 7 }]);
    mockedTraining.find.mockResolvedValue([{ _id: 't1' }]);
    mockedBenchmark.countDocuments.mockResolvedValue(3);

    const stats = await getProjectDashboardStats('p-slug', 'owner-1');

    expect(stats.trainingStats.totalTrainings).toBe(2);
    expect(stats.trainingStats.totalCost).toBeCloseTo(0.412);
    expect(stats.testResultsCount).toBe(9);
    expect(stats.visualizationsCount).toBe(7);
    expect(stats.benchmarksCount).toBe(3);
  });

  it('zeroes everything for an empty project', async () => {
    mockedProject.findOne.mockResolvedValue(projectDoc());
    mockedTraining.aggregate.mockResolvedValue([]);
    mockedTraining.find.mockResolvedValue([]);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    const stats = await getProjectDashboardStats('p-slug', 'owner-1');

    expect(stats.trainingStats.totalTrainings).toBe(0);
    expect(stats.testResultsCount).toBe(0);
    expect(stats.visualizationsCount).toBe(0);
    expect(stats.benchmarksCount).toBe(0);
  });
});
