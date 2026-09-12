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
jest.mock('../../models/Epoch', () => ({ __esModule: true, default: { aggregate: jest.fn() } }));
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
import Epoch from '../../models/Epoch';
import Benchmark from '../../models/Benchmark';

const mockedProject = Project as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;
const mockedEpoch = Epoch as unknown as Record<string, jest.Mock>;
const mockedBenchmark = Benchmark as unknown as Record<string, jest.Mock>;

/**
 * `Training.find(...).select(...)` — a query, as the model really returns one.
 * The dashboard reads the project's training ids once and joins the counts
 * against them, so the mock has to be a query rather than a bare array.
 */
const trainingIdsAre = (ids: string[]) =>
  mockedTraining.find.mockReturnValue({
    select: jest.fn().mockResolvedValue(ids.map(id => ({ _id: id }))),
  });

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

    expect(mockedProject).toHaveBeenCalledWith({
      name: 'New',
      isPublic: true,
      taxonomy: undefined,
      ownerId: 'u1',
    });
    expect(result._id).toBe('new');
  });

  it('seeds metric definitions from the chosen task type', async () => {
    mockedProject.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue(data),
    }));

    await createProject('u1', { name: 'New', taxonomy: { taskType: 'detection' } });

    const taxonomy = (mockedProject.mock.calls[0][0] as AnyDoc).taxonomy;
    expect(taxonomy.metrics.map((m: AnyDoc) => m.key)).toContain('mAP_50');
    expect(taxonomy.overallMetrics).toEqual(['mAP_50', 'mAP_50_95']);
  });

  it('never overwrites metrics the caller spelled out', async () => {
    mockedProject.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue(data),
    }));

    await createProject('u1', {
      name: 'New',
      taxonomy: { taskType: 'segmentation', metrics: [{ key: 'custom' }] },
    });

    const taxonomy = (mockedProject.mock.calls[0][0] as AnyDoc).taxonomy;
    expect(taxonomy.metrics).toEqual([{ key: 'custom' }]);
  });

  it('leaves a project with no task type on pure discovery', async () => {
    mockedProject.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue(data),
    }));

    await createProject('u1', { name: 'New', taxonomy: { conditionLabel: 'Site' } });

    const taxonomy = (mockedProject.mock.calls[0][0] as AnyDoc).taxonomy;
    expect(taxonomy).toEqual({ conditionLabel: 'Site' });
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

  it('refuses a slug shaped like a project id', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);
    mockedProject.findOne.mockResolvedValue(null);

    await expect(updateProject('p1', 'owner-1', { slug: 'ABCDEF0123456789abcdef01' })).rejects.toThrow(
      'Slug cannot look like a project id'
    );
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('replaces the taxonomy and clears it with null', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);

    await updateProject('p1', 'owner-1', { taxonomy: { conditionLabel: 'Site' } });
    expect(doc.taxonomy).toEqual({ conditionLabel: 'Site' });

    // null returns the project to pure discovery, which undefined cannot express
    await updateProject('p1', 'owner-1', { taxonomy: null });
    expect(doc.taxonomy).toBeUndefined();
  });

  it('leaves the taxonomy alone when the update does not mention it', async () => {
    const doc = projectDoc({ taxonomy: { conditionLabel: 'Weather' } });
    mockedProject.findById.mockResolvedValue(doc);

    await updateProject('p1', 'owner-1', { name: 'Renamed' });
    expect(doc.taxonomy).toEqual({ conditionLabel: 'Weather' });
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
    mockedTraining.aggregate.mockResolvedValue([
      {
        totalTrainings: 2,
        totalTime: 7200,
        totalEpochs: 4,
        avgEpochTime: 1800,
      },
    ]);
    mockedEpoch.aggregate.mockResolvedValueOnce([{ count: 9 }]).mockResolvedValueOnce([{ count: 7 }]);
    trainingIdsAre(['t1']);
    mockedBenchmark.countDocuments.mockResolvedValue(3);

    const stats = await getProjectDashboardStats('p-slug', 'owner-1');

    expect(stats.trainingStats.totalTrainings).toBe(2);
    // this project has no rate card, so no money is reported — only measured time
    expect(stats.trainingStats.totalCost).toBeUndefined();
    expect(stats.trainingStats.currency).toBeUndefined();
    expect(stats.testResultsCount).toBe(9);
    expect(stats.visualizationsCount).toBe(7);
    expect(stats.benchmarksCount).toBe(3);
  });

  it('prices the same hours once the project has rates', async () => {
    mockedProject.findOne.mockResolvedValue(
      projectDoc({ costing: { cpuRatePerHour: 0.006, gpuRatePerHour: 0.2, currency: 'EUR' } })
    );
    mockedTraining.aggregate.mockResolvedValue([
      { totalTrainings: 2, totalTime: 7200, totalEpochs: 4, avgEpochTime: 1800 }
    ]);
    mockedTraining.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    mockedEpoch.aggregate.mockResolvedValue([]);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    const stats = await getProjectDashboardStats('p-slug', 'owner-1');

    // 2 hours at 0.006 + 0.20
    expect(stats.trainingStats.totalCpuCost).toBeCloseTo(0.012);
    expect(stats.trainingStats.totalGpuCost).toBeCloseTo(0.4);
    expect(stats.trainingStats.totalCost).toBeCloseTo(0.412);
    expect(stats.trainingStats.currency).toBe('EUR');
  });

  it('counts through the epochs of a known training set, not by fanning out', async () => {
    // The old form `$lookup`-ed every epoch of every training into an array,
    // `$unwind`-ed one document per epoch, joined, and unwound again — tens of
    // thousands of documents to produce one number. Measured on the real
    // database: 1.8s each for test results and visualizations.
    mockedProject.findOne.mockResolvedValue(projectDoc());
    mockedTraining.aggregate.mockResolvedValue([]);
    mockedEpoch.aggregate.mockResolvedValue([{ count: 4 }]);
    trainingIdsAre(['t1', 't2']);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    await getProjectDashboardStats('p-slug', 'owner-1');

    const [testResults, visualizations] = mockedEpoch.aggregate.mock.calls.map(c => c[0]);
    // Bounded by the training ids. Joining on epoch uuids measured marginally
    // faster but ships one array element per epoch, which grows without bound.
    expect(testResults[0].$match.trainingId).toEqual({ $in: ['t1', 't2'] });
    expect(testResults[1].$lookup.from).toBe('test_results');
    expect(visualizations[1].$lookup.from).toBe('epoch_visualizations');
    // A test result deleted on its own is not counted; visualizations, which have
    // no deletedAt at all, still match.
    expect(testResults[1].$lookup.pipeline).toEqual([
      { $match: { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } },
    ]);
    // Summed inside the group; nothing is unwound.
    expect(JSON.stringify(testResults)).not.toContain('$unwind');
  });

  it('reads the project\'s trainings once and reuses them for the benchmark count', async () => {
    mockedProject.findOne.mockResolvedValue(projectDoc());
    mockedTraining.aggregate.mockResolvedValue([]);
    mockedEpoch.aggregate.mockResolvedValue([]);
    trainingIdsAre(['t1']);
    mockedBenchmark.countDocuments.mockResolvedValue(2);

    await getProjectDashboardStats('p-slug', 'owner-1');

    expect(mockedTraining.find).toHaveBeenCalledTimes(1);
    expect(mockedBenchmark.countDocuments.mock.calls[0][0].training_id).toEqual({ $in: ['t1'] });
  });

  it('runs the four counts together rather than one after another', async () => {
    // They are independent, and awaiting them in sequence made the endpoint's
    // latency their sum — measured at 3.9s against production for about 300
    // bytes of output. Asserted because a later edit adding an `await` back
    // would restore that silently, with every test still passing.
    mockedProject.findOne.mockResolvedValue(projectDoc());

    let release!: () => void;
    const blocked = new Promise(resolve => {
      release = () => resolve([]);
    });
    mockedTraining.aggregate.mockReturnValueOnce(blocked);
    mockedEpoch.aggregate.mockResolvedValueOnce([{ count: 9 }]).mockResolvedValueOnce([{ count: 7 }]);
    trainingIdsAre([]);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    const pending = getProjectDashboardStats('p-slug', 'owner-1');
    for (let i = 0; i < 6; i += 1) await Promise.resolve();

    // The training stats are still outstanding, and both counts have been
    // issued rather than queued behind them.
    expect(mockedEpoch.aggregate).toHaveBeenCalledTimes(2);

    release();
    await expect(pending).resolves.toMatchObject({ testResultsCount: 9, visualizationsCount: 7 });
  });

  it('zeroes everything for an empty project', async () => {
    mockedProject.findOne.mockResolvedValue(projectDoc());
    mockedTraining.aggregate.mockResolvedValue([]);
    mockedEpoch.aggregate.mockResolvedValue([]);
    trainingIdsAre([]);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    const stats = await getProjectDashboardStats('p-slug', 'owner-1');

    expect(stats.trainingStats.totalTrainings).toBe(0);
    expect(stats.testResultsCount).toBe(0);
    expect(stats.visualizationsCount).toBe(0);
    expect(stats.benchmarksCount).toBe(0);
  });
});
