import { vi, type Mock } from 'vitest';
/**
 * Covers the thin delegation controllers (training / benchmark /
 * visualization / project): each handler extracts request data, calls its
 * service, and shapes the JSON response — so one parametrized suite per
 * controller keeps this compact.
 */
vi.mock('../../services/trainingService', async () => {
  const module = await (() => ({
    trainingService: {
      getTrainings: vi.fn(),
      getTrainingById: vi.fn(),
      getTrainingByUuid: vi.fn(),
      getTrainingWithEpochs: vi.fn(),
      createTraining: vi.fn(),
      updateTraining: vi.fn(),
      deleteTraining: vi.fn(),
      getTrainingStats: vi.fn(),
      getTrainingTags: vi.fn(),
      compareTrainings: vi.fn(),
      getDeletedTrainings: vi.fn(),
      restoreTraining: vi.fn()
    }
  }))();
  return Object.assign({ default: module }, module);
});

vi.mock('../../services/benchmarkService', async () => {
  const module = await (() => ({
    getBenchmarks: vi.fn(),
    getBenchmarkById: vi.fn(),
    createBenchmark: vi.fn(),
    uploadBenchmark: vi.fn(),
    getBenchmarkStats: vi.fn(),
    updateBenchmark: vi.fn(),
    deleteBenchmark: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/visualizationService', async () => {
  const module = await (() => ({
    getVisualizationUploadUrl: vi.fn(),
    createVisualization: vi.fn(),
    getVisualizationByUuid: vi.fn(),
    deleteVisualization: vi.fn(),
    getVisualizationsByEpoch: vi.fn(),
    getVisualizationsByTraining: vi.fn(),
    getVisualizationTypes: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/projectService', async () => {
  const module = await (() => ({
    listProjects: vi.fn(),
    getProjectByIdOrSlug: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    trashProject: vi.fn(),
    listTrashedProjects: vi.fn(),
    restoreProject: vi.fn(),
    deleteProjectForever: vi.fn(),
    transferProject: vi.fn(),
    getProjectDashboardStats: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});

import type { Request, Response } from 'express';
import * as trainingCtrl from '../../controllers/trainingController';
import * as benchmarkCtrl from '../../controllers/benchmarkController';
import * as visualizationCtrl from '../../controllers/visualizationController';
import * as projectCtrl from '../../controllers/projectController';
import { trainingService } from '../../services/trainingService';
import * as benchmarkService from '../../services/benchmarkService';
import * as visualizationService from '../../services/visualizationService';
import * as projectService from '../../services/projectService';

const mockedTrainingSvc = trainingService as unknown as Record<string, Mock>;
const mockedBenchmarkSvc = benchmarkService as unknown as Record<string, Mock>;
const mockedVizSvc = visualizationService as unknown as Record<string, Mock>;
const mockedProjectSvc = projectService as unknown as Record<string, Mock>;

type MockRes = Response & { json: Mock; status: Mock };

const makeRes = (): MockRes => {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    params: {},
    query: {},
    body: {},
    user: { id: 'u1' },
    ...overrides
  }) as unknown as Request;

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mockedTrainingSvc.getTrainingWithEpochs).toHaveBeenCalledWith('i1', 'u1', 'epoch', 1, undefined);

    // `sample` reaches the service, so a caller plotting a curve is not sent
    // every epoch of the run to throw most of away.
    await trainingCtrl.getTrainingWithEpochs(
      makeReq({ params: { id: 'i1' }, query: { sortBy: 'epoch', order: 1, sample: 12 } }),
      makeRes()
    );
    expect(mockedTrainingSvc.getTrainingWithEpochs).toHaveBeenCalledWith('i1', 'u1', 'epoch', 1, 12);
  });

  it('createTraining prefers the API-token project scope over the body', async () => {
    mockedTrainingSvc.createTraining.mockResolvedValue('saved');
    const res = makeRes();

    await trainingCtrl.createTraining(makeReq({ projectId: 'p-token', body: { name: 'T', projectId: 'p-body' } }), res);

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

  it('getDeletedTrainings / restoreTraining act for the signed-in caller', async () => {
    mockedTrainingSvc.getDeletedTrainings.mockResolvedValue({ trainings: [] });
    mockedTrainingSvc.restoreTraining.mockResolvedValue('restored');
    const listRes = makeRes();
    const restoreRes = makeRes();

    await trainingCtrl.getDeletedTrainings(makeReq({ query: { page: 2, limit: 10 } }), listRes);
    expect(mockedTrainingSvc.getDeletedTrainings).toHaveBeenCalledWith('u1', { page: 2, limit: 10 });
    expect(listRes.json).toHaveBeenCalledWith({ success: true, data: { trainings: [] } });

    await trainingCtrl.restoreTraining(makeReq({ params: { id: 'i1' } }), restoreRes);
    expect(mockedTrainingSvc.restoreTraining).toHaveBeenCalledWith('i1', 'u1');
    expect(restoreRes.json).toHaveBeenCalledWith({
      success: true,
      message: 'Training restored successfully',
      data: 'restored'
    });
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
    expect(mockedTrainingSvc.getTrainingStats).toHaveBeenCalledWith('u1', expect.objectContaining({ status: 'done' }));

    await trainingCtrl.compareTrainings(makeReq({ body: { trainingIds: ['a'] } }), makeRes());
    expect(mockedTrainingSvc.compareTrainings).toHaveBeenCalledWith('u1', ['a']);
  });

  it('getTrainingTags returns the caller-scoped tag list', async () => {
    mockedTrainingSvc.getTrainingTags.mockResolvedValue(['a', 'b']);
    const res = makeRes();

    await trainingCtrl.getTrainingTags(makeReq({}), res);

    expect(mockedTrainingSvc.getTrainingTags).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: ['a', 'b'] });
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
    expect(mockedBenchmarkSvc.createBenchmark).toHaveBeenCalledWith({ epoch: 1 }, 'p1', 'u1');
    expect(createRes.status).toHaveBeenCalledWith(201);

    await benchmarkCtrl.uploadBenchmark(makeReq({ body: { epoch: 2 } }), makeRes());
    expect(mockedBenchmarkSvc.uploadBenchmark).toHaveBeenCalledWith({ epoch: 2 }, undefined, 'u1');

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

    await visualizationCtrl.getVisualizationByUuid(makeReq({ params: { visualization_uuid: 'v1' } }), makeRes());
    expect(mockedVizSvc.getVisualizationByUuid).toHaveBeenCalledWith('v1', 'u1');

    await visualizationCtrl.deleteVisualization(makeReq({ params: { visualization_uuid: 'v1' } }), makeRes());
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
    expect(mockedVizSvc.getVisualizationsByTraining).toHaveBeenCalledWith('tu', { limit: 50, page: 1 }, 'u1');

    const typesRes = makeRes();
    await visualizationCtrl.getVisualizationTypes(makeReq({ query: { epoch_uuid: 'e1' } }), typesRes);
    expect(mockedVizSvc.getVisualizationTypes).toHaveBeenCalledWith(undefined, 'e1', 'u1');
    expect(typesRes.json).toHaveBeenCalledWith({ success: true, data: { types: ['loss'] } });
  });
});

describe('projectController', () => {
  it('all handlers delegate with the right identity', async () => {
    mockedProjectSvc.listProjects.mockResolvedValue([]);
    mockedProjectSvc.getProjectByIdOrSlug.mockResolvedValue('p');
    mockedProjectSvc.createProject.mockResolvedValue('new');
    mockedProjectSvc.updateProject.mockResolvedValue('upd');
    mockedProjectSvc.trashProject.mockResolvedValue(undefined);
    mockedProjectSvc.listTrashedProjects.mockResolvedValue(['t']);
    mockedProjectSvc.restoreProject.mockResolvedValue('restored');
    mockedProjectSvc.deleteProjectForever.mockResolvedValue(undefined);
    mockedProjectSvc.transferProject.mockResolvedValue('moved');
    mockedProjectSvc.getProjectDashboardStats.mockResolvedValue('stats');

    await projectCtrl.getProjects(makeReq({ query: { sortBy: 'name' } }), makeRes());
    expect(mockedProjectSvc.listProjects).toHaveBeenCalledWith('u1', { sortBy: 'name' });

    await projectCtrl.getProjectByIdOrSlug(makeReq({ params: { id: 'x' } }), makeRes());
    expect(mockedProjectSvc.getProjectByIdOrSlug).toHaveBeenCalledWith('x', 'u1');

    const createRes = makeRes();
    await projectCtrl.createProject(
      makeReq({ body: { name: 'N', description: 'D', visibility: 'public', owner: { kind: 'group', id: 'g' } } }),
      createRes
    );
    expect(mockedProjectSvc.createProject).toHaveBeenCalledWith('u1', {
      name: 'N',
      description: 'D',
      visibility: 'public',
      owner: { kind: 'group', id: 'g' }
    });
    expect(createRes.status).toHaveBeenCalledWith(201);

    await projectCtrl.updateProject(makeReq({ params: { id: 'i' }, body: { name: 'N' } }), makeRes());
    expect(mockedProjectSvc.updateProject).toHaveBeenCalledWith('i', 'u1', {
      name: 'N',
      description: undefined,
      visibility: undefined,
      slug: undefined
    });

    await projectCtrl.deleteProject(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedProjectSvc.trashProject).toHaveBeenCalledWith('i', 'u1');

    const trashRes = makeRes();
    await projectCtrl.listTrashedProjects(makeReq(), trashRes);
    expect(trashRes.json).toHaveBeenCalledWith({ success: true, data: ['t'] });

    await projectCtrl.restoreProject(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedProjectSvc.restoreProject).toHaveBeenCalledWith('i', 'u1');

    await projectCtrl.deleteProjectForever(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedProjectSvc.deleteProjectForever).toHaveBeenCalledWith('i', 'u1');

    await projectCtrl.transferProject(
      makeReq({ params: { id: 'i' }, body: { owner: { kind: 'group', id: 'g' } } }),
      makeRes()
    );
    expect(mockedProjectSvc.transferProject).toHaveBeenCalledWith('i', 'u1', { kind: 'group', id: 'g' });

    await projectCtrl.getProjectDashboardStats(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedProjectSvc.getProjectDashboardStats).toHaveBeenCalledWith('i', 'u1');
  });

  it('forwards cost rates on create and update instead of dropping them', async () => {
    const costing = { cpuRatePerHour: 0.5, gpuRatePerHour: 2, currency: 'USD' };
    mockedProjectSvc.createProject.mockResolvedValue('new');
    mockedProjectSvc.updateProject.mockResolvedValue('upd');

    await projectCtrl.createProject(makeReq({ body: { name: 'N', costing } }), makeRes());
    expect(mockedProjectSvc.createProject).toHaveBeenCalledWith('u1', expect.objectContaining({ costing }));

    // null is how the settings screen clears the rates
    await projectCtrl.updateProject(makeReq({ params: { id: 'i' }, body: { costing: null } }), makeRes());
    expect(mockedProjectSvc.updateProject).toHaveBeenCalledWith('i', 'u1', expect.objectContaining({ costing: null }));
  });
});
