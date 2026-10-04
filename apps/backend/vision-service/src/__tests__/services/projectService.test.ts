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
jest.mock('../../models/Evaluation', () => ({ __esModule: true, default: { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }), countDocuments: jest.fn() } }));
jest.mock('../../models/Epoch', () => ({ __esModule: true, default: { aggregate: jest.fn() } }));
jest.mock('../../models/Benchmark', () => ({
  __esModule: true,
  default: { countDocuments: jest.fn() },
}));
jest.mock('../../clients/projectGroupsClient', () => ({ getUserGroups: jest.fn().mockResolvedValue([]) }));

import {
  getProjectByIdOrSlug,
  createProject,
  updateProject,
  getProjectDashboardStats,
} from '../../services/projectService';
import Project from '../../models/Project';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import Evaluation from '../../models/Evaluation';
import Benchmark from '../../models/Benchmark';

const mockedProject = Project as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedEvaluation = Evaluation as unknown as Record<string, jest.Mock>;
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

// Ownership, the trash and transfers are tested end to end in integration/projectOwnership.
const ID = 'a'.repeat(24);

const projectDoc = (overrides: AnyDoc = {}): AnyDoc => {
  const doc: AnyDoc = {
    _id: { toString: () => ID },
    name: 'P',
    slug: 'p-slug',
    owner: { kind: 'user', id: 'owner-1' },
    createdBy: 'owner-1',
    visibility: 'public',
    save: jest.fn().mockImplementation(function (this: unknown) {
      return Promise.resolve(this);
    }),
    ...overrides,
  };
  doc.toObject = () => ({ ...doc });
  return doc;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedEvaluation.countDocuments.mockResolvedValue(0);
});

describe('project lookups', () => {
  it('getProjectByIdOrSlug falls back from slug to id, and says what the caller may do', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(projectDoc());

    await expect(getProjectByIdOrSlug('p1', 'u1')).resolves.toMatchObject({
      name: 'P',
      permissions: { read: true, contribute: false, manage: false, own: false },
    });
    expect(mockedProject.findOne).toHaveBeenCalledWith({ slug: 'p1' });
    expect(mockedProject.findById).toHaveBeenCalledWith('p1');
  });
});

describe('createProject', () => {
  it('stamps the creator as owner', async () => {
    mockedProject.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue(projectDoc({ ...data, _id: 'new' })),
    }));

    const result = (await createProject('u1', { name: 'New', visibility: 'public' })) as AnyDoc;

    expect(mockedProject).toHaveBeenCalledWith({
      name: 'New',
      visibility: 'public',
      owner: { kind: 'user', id: 'u1' },
      createdBy: 'u1',
      taxonomy: undefined,
    });
    expect(result).toMatchObject({ _id: 'new', permissions: { own: true } });
  });

  it('seeds metric definitions from the chosen task type', async () => {
    mockedProject.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue(projectDoc(data)),
    }));

    await createProject('u1', { name: 'New', taxonomy: { taskType: 'detection' } });

    const taxonomy = (mockedProject.mock.calls[0][0] as AnyDoc).taxonomy;
    expect(taxonomy.metrics.map((m: AnyDoc) => m.key)).toContain('mAP_50');
    expect(taxonomy.overallMetrics).toEqual(['mAP_50', 'mAP_50_95']);
  });

  it('never overwrites metrics the caller spelled out', async () => {
    mockedProject.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue(projectDoc(data)),
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
      save: jest.fn().mockResolvedValue(projectDoc(data)),
    }));

    await createProject('u1', { name: 'New', taxonomy: { conditionLabel: 'Site' } });

    const taxonomy = (mockedProject.mock.calls[0][0] as AnyDoc).taxonomy;
    expect(taxonomy).toEqual({ conditionLabel: 'Site' });
  });
});

describe('updateProject', () => {
  it('404s when missing and 403s for a reader', async () => {
    mockedProject.findById.mockResolvedValue(null);
    await expect(updateProject(ID, 'u1', {})).rejects.toThrow('Project not found');

    mockedProject.findById.mockResolvedValue(projectDoc());
    await expect(updateProject(ID, 'stranger', {})).rejects.toThrow('This needs manage permission on the project');
  });

  it('applies partial updates', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);

    await updateProject(ID, 'owner-1', { name: 'Renamed', description: '', visibility: 'private' });

    expect(doc.name).toBe('Renamed');
    expect(doc.description).toBe('');
    expect(doc.visibility).toBe('private');
    expect(doc.save).toHaveBeenCalled();
    // Going private ends the publication of the project's results.
    expect(mockedEvaluation.updateMany).toHaveBeenCalledWith({ projectId: doc._id.toString(), publishedAt: { $ne: null } }, expect.anything());
  });

  it('enforces slug uniqueness', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);
    mockedProject.findOne.mockResolvedValue(projectDoc({ _id: { toString: () => 'other' } }));

    await expect(updateProject(ID, 'owner-1', { slug: 'taken' })).rejects.toThrow(
      'Slug already exists'
    );
  });

  it('refuses a slug shaped like a project id', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);
    mockedProject.findOne.mockResolvedValue(null);

    await expect(updateProject(ID, 'owner-1', { slug: 'ABCDEF0123456789abcdef01' })).rejects.toThrow(
      'Slug cannot look like a project id'
    );
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('replaces the taxonomy and clears it with null', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);

    await updateProject(ID, 'owner-1', { taxonomy: { conditionLabel: 'Site' } });
    expect(doc.taxonomy).toEqual({ conditionLabel: 'Site' });

    // null returns the project to pure discovery, which undefined cannot express
    await updateProject(ID, 'owner-1', { taxonomy: null });
    expect(doc.taxonomy).toBeUndefined();
  });

  it('leaves the taxonomy alone when the update does not mention it', async () => {
    const doc = projectDoc({ taxonomy: { conditionLabel: 'Weather' } });
    mockedProject.findById.mockResolvedValue(doc);

    await updateProject(ID, 'owner-1', { name: 'Renamed' });
    expect(doc.taxonomy).toEqual({ conditionLabel: 'Weather' });
  });

  it('sets a unique slug (trimmed) and clears an empty one', async () => {
    const doc = projectDoc();
    mockedProject.findById.mockResolvedValue(doc);
    mockedProject.findOne.mockResolvedValue(null);

    await updateProject(ID, 'owner-1', { slug: ' fresh ' });
    expect(doc.slug).toBe('fresh');

    await updateProject(ID, 'owner-1', { slug: '  ' });
    expect(doc.slug).toBeUndefined();
  });
});

describe('getProjectDashboardStats', () => {
  it('404s / 403s before aggregating', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(null);
    await expect(getProjectDashboardStats('ghost', 'u1')).rejects.toThrow('Project not found');

    mockedProject.findOne.mockResolvedValue(projectDoc({ visibility: 'private' }));
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
    mockedEvaluation.countDocuments.mockResolvedValue(9);
    mockedEpoch.aggregate.mockResolvedValue([{ count: 7 }]);
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

  it('counts evaluations directly by project and live run ids, and visualizations through epochs', async () => {
    mockedProject.findOne.mockResolvedValue(projectDoc());
    mockedTraining.aggregate.mockResolvedValue([]);
    mockedEpoch.aggregate.mockResolvedValue([{ count: 4 }]);
    trainingIdsAre(['t1', 't2']);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    await getProjectDashboardStats('p-slug', 'owner-1');

    expect(mockedEvaluation.countDocuments).toHaveBeenCalledWith({ projectId: ID, 'source.trainingId': { $in: ['t1', 't2'] }, deletedAt: null });
    const [visualizations] = mockedEpoch.aggregate.mock.calls.map(c => c[0]);
    expect(visualizations[0].$match.trainingId).toEqual({ $in: ['t1', 't2'] });
    expect(visualizations[1].$lookup.from).toBe('epoch_visualizations');
    expect(JSON.stringify(visualizations)).not.toContain('$unwind');
  });

  it('counts only run tests and published suite results for a public reader', async () => {
    mockedProject.findOne.mockResolvedValue(projectDoc());
    mockedTraining.aggregate.mockResolvedValue([]);
    mockedEpoch.aggregate.mockResolvedValue([]);
    trainingIdsAre(['t1']);
    await getProjectDashboardStats('p-slug', undefined);
    expect(mockedEvaluation.countDocuments).toHaveBeenCalledWith({ projectId: ID, 'source.trainingId': { $in: ['t1'] }, deletedAt: null, $or: [{ publishedAt: { $ne: null } }, { suite: { $exists: false } }] });
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
    mockedEvaluation.countDocuments.mockResolvedValue(9);
    mockedEpoch.aggregate.mockResolvedValue([{ count: 7 }]);
    trainingIdsAre([]);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    const pending = getProjectDashboardStats('p-slug', 'owner-1');
    for (let i = 0; i < 6; i += 1) await Promise.resolve();

    // The training stats are still outstanding, and the other counts have been
    // issued rather than queued behind them.
    expect(mockedEpoch.aggregate).toHaveBeenCalledTimes(1);
    expect(mockedEvaluation.countDocuments).toHaveBeenCalledTimes(1);

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
