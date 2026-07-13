/**
 * Covers the thin delegation controllers (training / testResult / benchmark /
 * visualization / project): each handler extracts request data, calls its
 * service, and shapes the JSON response — so one parametrized suite per
 * controller keeps this compact.
 */
jest.mock('../../services/trainingService', () => ({
  trainingService: {
    getTrainings: jest.fn(),
    getTrainingById: jest.fn(),
    getTrainingByUuid: jest.fn(),
    getTrainingWithEpochs: jest.fn(),
    createTraining: jest.fn(),
    updateTraining: jest.fn(),
    deleteTraining: jest.fn(),
    getTrainingStats: jest.fn(),
    compareTrainings: jest.fn(),
  },
}));
jest.mock('../../services/testResultService', () => ({
  testResultService: {
    getTestResults: jest.fn(),
    getTestResultById: jest.fn(),
    getTestResultByTestUuid: jest.fn(),
    getTestResultsByEpochUuid: jest.fn(),
    createTestResult: jest.fn(),
    updateTestResult: jest.fn(),
    deleteTestResult: jest.fn(),
    getTestResultEpochs: jest.fn(),
    compareTestResults: jest.fn(),
    getAggregatedTestResultsByTraining: jest.fn(),
  },
}));
jest.mock('../../services/benchmarkService', () => ({
  getBenchmarks: jest.fn(),
  getBenchmarkById: jest.fn(),
  createBenchmark: jest.fn(),
  uploadBenchmark: jest.fn(),
  getBenchmarkStats: jest.fn(),
  updateBenchmark: jest.fn(),
  deleteBenchmark: jest.fn(),
}));
jest.mock('../../services/visualizationService', () => ({
  getVisualizationUploadUrl: jest.fn(),
  createVisualization: jest.fn(),
  getVisualizationByUuid: jest.fn(),
  deleteVisualization: jest.fn(),
  getVisualizationsByEpoch: jest.fn(),
  getVisualizationsByTraining: jest.fn(),
  getVisualizationTypes: jest.fn(),
}));
jest.mock('../../services/projectService', () => ({
  listProjects: jest.fn(),
  getProjectBySlug: jest.fn(),
  getProjectById: jest.fn(),
  getProjectByIdOrSlug: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  getProjectDashboardStats: jest.fn(),
}));

import type { Request, Response } from 'express';
import * as trainingCtrl from '../../controllers/trainingController';
import * as testResultCtrl from '../../controllers/testResultController';
import * as benchmarkCtrl from '../../controllers/benchmarkController';
import * as visualizationCtrl from '../../controllers/visualizationController';
import * as projectCtrl from '../../controllers/projectController';
import { trainingService } from '../../services/trainingService';
import { testResultService } from '../../services/testResultService';
import * as benchmarkService from '../../services/benchmarkService';
import * as visualizationService from '../../services/visualizationService';
import * as projectService from '../../services/projectService';

const mockedTrainingSvc = trainingService as unknown as Record<string, jest.Mock>;
const mockedTestResultSvc = testResultService as unknown as Record<string, jest.Mock>;
const mockedBenchmarkSvc = benchmarkService as unknown as Record<string, jest.Mock>;
const mockedVizSvc = visualizationService as unknown as Record<string, jest.Mock>;
const mockedProjectSvc = projectService as unknown as Record<string, jest.Mock>;

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    params: {},
    query: {},
    body: {},
    user: { id: 'u1' },
    ...overrides,
  } as unknown as Request);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('trainingController', () => {
  it('getTrainings forwards filters and pagination', async () => {
    mockedTrainingSvc.getTrainings.mockResolvedValue({ trainings: [] });
    const res = makeRes();

    await trainingCtrl.getTrainings(
      makeReq({ query: { page: 1, limit: 5, search: 's', status: 'running', tags: ['a'] } }),
      res
    );

    expect(mockedTrainingSvc.getTrainings).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ search: 's', status: 'running', tags: ['a'] }),
      { page: 1, limit: 5 }
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { trainings: [] } });
  });

  it('getTrainingById / getTrainingByUuid / getTrainingWithEpochs delegate', async () => {
    mockedTrainingSvc.getTrainingById.mockResolvedValue('t');
    mockedTrainingSvc.getTrainingByUuid.mockResolvedValue('t');
    mockedTrainingSvc.getTrainingWithEpochs.mockResolvedValue('t+e');

    await trainingCtrl.getTrainingById(makeReq({ params: { id: 'i1' } }), makeRes());
    expect(mockedTrainingSvc.getTrainingById).toHaveBeenCalledWith('i1', 'u1');

    await trainingCtrl.getTrainingByUuid(makeReq({ params: { uuid: 'x' }, user: undefined }), makeRes());
    expect(mockedTrainingSvc.getTrainingByUuid).toHaveBeenCalledWith('x', undefined);

    await trainingCtrl.getTrainingWithEpochs(
      makeReq({ params: { id: 'i1' }, query: { sortBy: 'epoch', order: 1 } }),
      makeRes()
    );
    expect(mockedTrainingSvc.getTrainingWithEpochs).toHaveBeenCalledWith('i1', 'u1', 'epoch', 1);
  });

  it('createTraining prefers the API-token project scope over the body', async () => {
    mockedTrainingSvc.createTraining.mockResolvedValue('saved');
    const res = makeRes();

    await trainingCtrl.createTraining(
      makeReq({ projectId: 'p-token', body: { name: 'T', projectId: 'p-body' } }),
      res
    );

    expect(mockedTrainingSvc.createTraining).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ projectId: 'p-token' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createTraining falls back to the body projectId', async () => {
    mockedTrainingSvc.createTraining.mockResolvedValue('saved');

    await trainingCtrl.createTraining(makeReq({ body: { name: 'T', projectId: 'p-body' } }), makeRes());

    expect(mockedTrainingSvc.createTraining).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ projectId: 'p-body' })
    );
  });

  it('update / delete / stats / compare delegate', async () => {
    mockedTrainingSvc.updateTraining.mockResolvedValue('u');
    mockedTrainingSvc.deleteTraining.mockResolvedValue(true);
    mockedTrainingSvc.getTrainingStats.mockResolvedValue('s');
    mockedTrainingSvc.compareTrainings.mockResolvedValue('c');

    await trainingCtrl.updateTraining(makeReq({ params: { id: 'i1' }, body: { name: 'N' } }), makeRes());
    expect(mockedTrainingSvc.updateTraining).toHaveBeenCalledWith('i1', 'u1', { name: 'N' });

    await trainingCtrl.deleteTraining(makeReq({ params: { id: 'i1' } }), makeRes());
    expect(mockedTrainingSvc.deleteTraining).toHaveBeenCalledWith('i1', 'u1');

    await trainingCtrl.getTrainingStats(makeReq({ query: { status: 'done' } }), makeRes());
    expect(mockedTrainingSvc.getTrainingStats).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ status: 'done' })
    );

    await trainingCtrl.compareTrainings(makeReq({ body: { trainingIds: ['a'] } }), makeRes());
    expect(mockedTrainingSvc.compareTrainings).toHaveBeenCalledWith('u1', ['a']);
  });
});

describe('testResultController', () => {
  it('getTestResults forwards filters and pagination', async () => {
    mockedTestResultSvc.getTestResults.mockResolvedValue({});
    const res = makeRes();

    await testResultCtrl.getTestResults(
      makeReq({ query: { page: 1, limit: 2, sortBy: 'timestamp', order: -1, epoch: 3 } }),
      res
    );

    expect(mockedTestResultSvc.getTestResults).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ epoch: 3 }),
      expect.objectContaining({ page: 1, limit: 2 })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: {} });
  });

  it('lookup, create, update, delete, epochs, and compare handlers delegate', async () => {
    mockedTestResultSvc.getTestResultById.mockResolvedValue('tr');
    mockedTestResultSvc.getTestResultByTestUuid.mockResolvedValue('tr');
    mockedTestResultSvc.getTestResultsByEpochUuid.mockResolvedValue('list');
    mockedTestResultSvc.createTestResult.mockResolvedValue('new');
    mockedTestResultSvc.updateTestResult.mockResolvedValue('upd');
    mockedTestResultSvc.deleteTestResult.mockResolvedValue(true);
    mockedTestResultSvc.getTestResultEpochs.mockResolvedValue([1]);
    mockedTestResultSvc.compareTestResults.mockResolvedValue('cmp');
    mockedTestResultSvc.getAggregatedTestResultsByTraining.mockResolvedValue('agg');

    await testResultCtrl.getTestResultById(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedTestResultSvc.getTestResultById).toHaveBeenCalledWith('i', 'u1');

    await testResultCtrl.getTestResultByTestUuid(makeReq({ params: { testUuid: 'tu' } }), makeRes());
    expect(mockedTestResultSvc.getTestResultByTestUuid).toHaveBeenCalledWith('tu', 'u1');

    await testResultCtrl.getTestResultsByEpochUuid(makeReq({ params: { epochUuid: 'e' } }), makeRes());
    expect(mockedTestResultSvc.getTestResultsByEpochUuid).toHaveBeenCalledWith('e', 'u1', expect.anything());

    const createRes = makeRes();
    await testResultCtrl.createTestResult(
      makeReq({ projectId: 'p-token', body: { epoch: 1 } }),
      createRes
    );
    expect(mockedTestResultSvc.createTestResult).toHaveBeenCalledWith('u1', 'p-token', { epoch: 1 });
    expect(createRes.status).toHaveBeenCalledWith(201);

    await testResultCtrl.createTestResultFromJson(makeReq({ body: { epoch: 2 } }), makeRes());
    expect(mockedTestResultSvc.createTestResult).toHaveBeenLastCalledWith('u1', undefined, { epoch: 2 });

    await testResultCtrl.updateTestResult(makeReq({ params: { id: 'i' }, body: { epoch: 3 } }), makeRes());
    expect(mockedTestResultSvc.updateTestResult).toHaveBeenCalledWith('i', 'u1', undefined, { epoch: 3 });

    await testResultCtrl.deleteTestResult(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedTestResultSvc.deleteTestResult).toHaveBeenCalledWith('i', 'u1', undefined);

    const epochsRes = makeRes();
    await testResultCtrl.getTestResultEpochs(makeReq(), epochsRes);
    expect(epochsRes.json).toHaveBeenCalledWith({ success: true, data: { epochs: [1] } });

    await testResultCtrl.compareTestResults(makeReq({ body: { testResultIds: ['a'] } }), makeRes());
    expect(mockedTestResultSvc.compareTestResults).toHaveBeenCalledWith('u1', ['a']);

    await testResultCtrl.compareAggregatedTestResultsByTraining(
      makeReq({ body: { trainingIds: ['t'] } }),
      makeRes()
    );
    expect(mockedTestResultSvc.getAggregatedTestResultsByTraining).toHaveBeenCalledWith('u1', ['t']);
  });
});

describe('benchmarkController', () => {
  it('all handlers delegate with the right identity/scope', async () => {
    mockedBenchmarkSvc.getBenchmarks.mockResolvedValue('page');
    mockedBenchmarkSvc.getBenchmarkById.mockResolvedValue('b');
    mockedBenchmarkSvc.createBenchmark.mockResolvedValue('new');
    mockedBenchmarkSvc.uploadBenchmark.mockResolvedValue('up');
    mockedBenchmarkSvc.getBenchmarkStats.mockResolvedValue('stats');
    mockedBenchmarkSvc.updateBenchmark.mockResolvedValue('upd');
    mockedBenchmarkSvc.deleteBenchmark.mockResolvedValue(undefined);

    await benchmarkCtrl.getBenchmarks(makeReq({ query: { sortBy: 'timestamp' } }), makeRes());
    expect(mockedBenchmarkSvc.getBenchmarks).toHaveBeenCalledWith({ sortBy: 'timestamp' }, 'u1');

    await benchmarkCtrl.getBenchmarkById(makeReq({ params: { id: 'b1' } }), makeRes());
    expect(mockedBenchmarkSvc.getBenchmarkById).toHaveBeenCalledWith('b1', 'u1');

    const createRes = makeRes();
    await benchmarkCtrl.createBenchmark(makeReq({ projectId: 'p1', body: { epoch: 1 } }), createRes);
    expect(mockedBenchmarkSvc.createBenchmark).toHaveBeenCalledWith({ epoch: 1 }, 'p1');
    expect(createRes.status).toHaveBeenCalledWith(201);

    await benchmarkCtrl.uploadBenchmark(makeReq({ body: { epoch: 2 } }), makeRes());
    expect(mockedBenchmarkSvc.uploadBenchmark).toHaveBeenCalledWith({ epoch: 2 }, undefined);

    await benchmarkCtrl.getBenchmarkStats(makeReq({ query: { training_uuid: 'tu' } }), makeRes());
    expect(mockedBenchmarkSvc.getBenchmarkStats).toHaveBeenCalledWith('tu', 'u1');

    await benchmarkCtrl.updateBenchmark(makeReq({ params: { id: 'b1' }, body: { epoch: 3 } }), makeRes());
    expect(mockedBenchmarkSvc.updateBenchmark).toHaveBeenCalledWith('b1', { epoch: 3 }, 'u1', undefined);

    await benchmarkCtrl.deleteBenchmark(makeReq({ params: { id: 'b1' } }), makeRes());
    expect(mockedBenchmarkSvc.deleteBenchmark).toHaveBeenCalledWith('b1', 'u1', undefined);
  });
});

describe('visualizationController', () => {
  it('all handlers delegate with the right identity/scope', async () => {
    mockedVizSvc.getVisualizationUploadUrl.mockResolvedValue('url');
    mockedVizSvc.createVisualization.mockResolvedValue('v');
    mockedVizSvc.getVisualizationByUuid.mockResolvedValue('v');
    mockedVizSvc.deleteVisualization.mockResolvedValue(undefined);
    mockedVizSvc.getVisualizationsByEpoch.mockResolvedValue('list');
    mockedVizSvc.getVisualizationsByTraining.mockResolvedValue('list');
    mockedVizSvc.getVisualizationTypes.mockResolvedValue(['loss']);

    await visualizationCtrl.getVisualizationUploadUrl(
      makeReq({ body: { epoch_uuid: 'e', filename: 'f', type: 't', mimetype: 'm' }, projectId: 'p1' }),
      makeRes()
    );
    expect(mockedVizSvc.getVisualizationUploadUrl).toHaveBeenCalledWith(
      { epoch_uuid: 'e', filename: 'f', type: 't', mimetype: 'm' },
      'u1',
      'p1'
    );

    const createRes = makeRes();
    await visualizationCtrl.createVisualization(makeReq({ body: { epoch_uuid: 'e' } }), createRes);
    expect(mockedVizSvc.createVisualization).toHaveBeenCalledWith({ epoch_uuid: 'e' }, 'u1', undefined);
    expect(createRes.status).toHaveBeenCalledWith(201);

    await visualizationCtrl.getVisualizationByUuid(
      makeReq({ params: { visualization_uuid: 'v1' } }),
      makeRes()
    );
    expect(mockedVizSvc.getVisualizationByUuid).toHaveBeenCalledWith('v1', 'u1');

    await visualizationCtrl.deleteVisualization(
      makeReq({ params: { visualization_uuid: 'v1' } }),
      makeRes()
    );
    expect(mockedVizSvc.deleteVisualization).toHaveBeenCalledWith('v1', 'u1', undefined);

    await visualizationCtrl.getVisualizationsByEpoch(
      makeReq({ params: { epoch_uuid: 'e1' }, query: { type: 'loss' } }),
      makeRes()
    );
    expect(mockedVizSvc.getVisualizationsByEpoch).toHaveBeenCalledWith('e1', 'loss', 'u1');

    await visualizationCtrl.getVisualizationsByTraining(
      makeReq({ params: { training_uuid: 'tu' }, query: { limit: 50, page: 1 } }),
      makeRes()
    );
    expect(mockedVizSvc.getVisualizationsByTraining).toHaveBeenCalledWith(
      'tu',
      { limit: 50, page: 1 },
      'u1'
    );

    const typesRes = makeRes();
    await visualizationCtrl.getVisualizationTypes(makeReq({ query: { epoch_uuid: 'e1' } }), typesRes);
    expect(mockedVizSvc.getVisualizationTypes).toHaveBeenCalledWith(undefined, 'e1', 'u1');
    expect(typesRes.json).toHaveBeenCalledWith({ success: true, data: { types: ['loss'] } });
  });
});

describe('projectController', () => {
  it('all handlers delegate with the right identity', async () => {
    mockedProjectSvc.listProjects.mockResolvedValue([]);
    mockedProjectSvc.getProjectBySlug.mockResolvedValue('p');
    mockedProjectSvc.getProjectById.mockResolvedValue('p');
    mockedProjectSvc.getProjectByIdOrSlug.mockResolvedValue('p');
    mockedProjectSvc.createProject.mockResolvedValue('new');
    mockedProjectSvc.updateProject.mockResolvedValue('upd');
    mockedProjectSvc.deleteProject.mockResolvedValue(undefined);
    mockedProjectSvc.getProjectDashboardStats.mockResolvedValue('stats');

    await projectCtrl.getProjects(makeReq({ query: { sortBy: 'name' } }), makeRes());
    expect(mockedProjectSvc.listProjects).toHaveBeenCalledWith('u1', { sortBy: 'name' });

    await projectCtrl.getProjectBySlug(makeReq({ params: { slug: 's' } }), makeRes());
    expect(mockedProjectSvc.getProjectBySlug).toHaveBeenCalledWith('s', 'u1');

    await projectCtrl.getProjectById(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedProjectSvc.getProjectById).toHaveBeenCalledWith('i', 'u1');

    await projectCtrl.getProjectByIdOrSlug(makeReq({ params: { identifier: 'x' } }), makeRes());
    expect(mockedProjectSvc.getProjectByIdOrSlug).toHaveBeenCalledWith('x', 'u1');

    const createRes = makeRes();
    await projectCtrl.createProject(
      makeReq({ body: { name: 'N', description: 'D', isPublic: true } }),
      createRes
    );
    expect(mockedProjectSvc.createProject).toHaveBeenCalledWith('u1', {
      name: 'N',
      description: 'D',
      isPublic: true,
    });
    expect(createRes.status).toHaveBeenCalledWith(201);

    await projectCtrl.updateProject(makeReq({ params: { id: 'i' }, body: { name: 'N' } }), makeRes());
    expect(mockedProjectSvc.updateProject).toHaveBeenCalledWith('i', 'u1', {
      name: 'N',
      description: undefined,
      isPublic: undefined,
      slug: undefined,
    });

    await projectCtrl.deleteProject(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedProjectSvc.deleteProject).toHaveBeenCalledWith('i', 'u1');

    await projectCtrl.getProjectDashboardStats(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedProjectSvc.getProjectDashboardStats).toHaveBeenCalledWith('i', 'u1');
  });
});
