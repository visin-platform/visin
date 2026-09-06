import { callService, serviceUrl, type Query } from './http';
import {
  benchmarksResponseSchema,
  comparisonResponseSchema,
  dashboardStatsSchema,
  datasetSchema,
  datasetsResponseSchema,
  imageCategoriesResponseSchema,
  parseResponse,
  trainingConfigsResponseSchema,
  findingExportSchema,
  type Config,
  projectSchema,
  projectsResponseSchema,
  testResultsResponseSchema,
  trainingSchema,
  trainingWithEpochsSchema,
  trainingsResponseSchema,
  type Benchmark,
  type ComparisonEntry,
  type DashboardStats,
  type Dataset,
  type Epoch,
  type ImageCategory,
  type Project,
  type TestResult,
  type Training,
  type Visualization,
  type Finding,
  findingSchema,
  findingsResponseSchema,
  visualizationSchema,
  visualizationTypesResponseSchema,
  visualizationsResponseSchema
} from './schemas';

/**
 * The vision-service client.
 *
 * Every method parses at the boundary — see `schemas.ts` — so a tool never
 * builds an answer out of fields that silently arrived as `undefined`. The
 * base URL is resolved per call rather than at import, so a test can point the
 * client somewhere without re-importing the module.
 */

const base = (): string => serviceUrl('VISION');

const get = async <T>(
  schema: Parameters<typeof parseResponse<T>>[0],
  apiKey: string,
  path: string,
  query?: Query
): Promise<T> => parseResponse(schema, path, await callService(base(), apiKey, 'GET', path, undefined, query));

const post = async <T>(
  schema: Parameters<typeof parseResponse<T>>[0],
  apiKey: string,
  path: string,
  body: unknown
): Promise<T> => parseResponse(schema, path, await callService(base(), apiKey, 'POST', path, body));

export const vision = {
  listProjects: (apiKey: string, search?: string): Promise<Project[]> =>
    get(projectsResponseSchema, apiKey, '/projects', { search }),

  getProject: (apiKey: string, identifier: string): Promise<Project> =>
    get(projectSchema, apiKey, `/projects/${encodeURIComponent(identifier)}`),

  getDashboardStats: (apiKey: string, identifier: string): Promise<DashboardStats> =>
    get(dashboardStatsSchema, apiKey, `/projects/${encodeURIComponent(identifier)}/dashboard-stats`),

  createProject: (
    apiKey: string,
    body: { name: string; description?: string; isPublic?: boolean }
  ): Promise<Project> => post(projectSchema, apiKey, '/projects', body),

  updateProject: async (
    apiKey: string,
    id: string,
    body: { name?: string; description?: string; isPublic?: boolean }
  ): Promise<Project> =>
    parseResponse(
      projectSchema,
      `/projects/${id}`,
      await callService(base(), apiKey, 'PUT', `/projects/${encodeURIComponent(id)}`, body)
    ),

  listTrainings: (
    apiKey: string,
    query: Query
  ): Promise<{ trainings: Training[]; pagination?: { total?: number } }> =>
    get(trainingsResponseSchema, apiKey, '/trainings', { page: 1, ...query }),

  getTraining: (apiKey: string, id: string): Promise<Training> =>
    get(trainingSchema, apiKey, `/trainings/${encodeURIComponent(id)}`),

  /**
   * The hyperparameters a run was launched with.
   *
   * Reached through the run rather than `/configs/:id` because the run is what
   * the caller's access was checked against — the config library itself is
   * deliberately unscoped, and addressing it directly would read around that
   * check rather than through it.
   */
  getTrainingConfigs: (apiKey: string, id: string): Promise<Config[]> =>
    get(trainingConfigsResponseSchema, apiKey, `/trainings/${encodeURIComponent(id)}/configs`).then(
      (response) => response.configs
    ),

  getTrainingWithEpochs: (
    apiKey: string,
    id: string
  ): Promise<{ training: Training; epochs: Epoch[] }> =>
    // `order` is an enum on vision-service (`sortOrderSchema`), not a Mongo
    // sort direction. Sending 1 was a 400 on every call, which took out
    // get_training and get_training_curve together.
    get(trainingWithEpochsSchema, apiKey, `/trainings/${encodeURIComponent(id)}/epochs`, {
      sortBy: 'epoch',
      order: 'asc'
    }),

  updateTraining: async (
    apiKey: string,
    id: string,
    body: { name?: string; description?: string; status?: string; tags?: string[] }
  ): Promise<Training> =>
    parseResponse(
      trainingSchema,
      `/trainings/${id}`,
      await callService(base(), apiKey, 'PUT', `/trainings/${encodeURIComponent(id)}`, body)
    ),

  compareTrainings: (
    apiKey: string,
    trainingIds: string[]
  ): Promise<{ comparison: ComparisonEntry[] }> =>
    post(comparisonResponseSchema, apiKey, '/trainings/compare', { trainingIds }),

  /**
   * `page` is sent alongside `limit`, and must be.
   *
   * testResultService only paginates when it has both — given `limit` alone it
   * silently returns every row. That is not a small overshoot: it fetched all
   * 989 results, 3 MB of JSON that rendered to 164,000 tokens, from a call
   * asking for five. Every other list endpoint honours `limit` on its own, so
   * the pairing is sent everywhere rather than only here: the contract has
   * surprised us once already.
   *
   * The filter key is `training_uuid` — see `getTestResultsQuerySchema`. Zod
   * strips a key it does not define rather than rejecting it, so the earlier
   * `trainingId` was accepted, ignored, and returned every run's results as
   * though they belonged to the one asked about. Silence is the danger here:
   * a wrong answer that looks right.
   */
  listTestResults: (
    apiKey: string,
    query: Query
  ): Promise<{ testResults: TestResult[]; total?: number }> =>
    get(testResultsResponseSchema, apiKey, '/test-results', { page: 1, ...query }),

  listBenchmarks: (apiKey: string, query: Query): Promise<{ benchmarks: Benchmark[] }> =>
    get(benchmarksResponseSchema, apiKey, '/benchmarks', { page: 1, ...query }),

  listDatasets: (
    apiKey: string,
    query: Query
  ): Promise<{ datasets: Dataset[]; pagination?: { total?: number } }> =>
    get(datasetsResponseSchema, apiKey, '/datasets', { page: 1, ...query }),

  getDataset: (apiKey: string, id: string): Promise<Dataset> =>
    get(datasetSchema, apiKey, `/datasets/${encodeURIComponent(id)}`),

  /**
   * The run is a path segment, not a query parameter.
   *
   * `/visualizations/training` without one is a real route that deliberately
   * returns every visualization there is — so sending `training_uuid` in the
   * query string was not a no-op filter, it was a request for all 8,000 frames
   * dressed up as a request for one run's 44.
   */
  listVisualizations: (
    apiKey: string,
    trainingUuid: string,
    query: Query
  ): Promise<{ visualizations: Visualization[]; total?: number }> =>
    get(
      visualizationsResponseSchema,
      apiKey,
      `/visualizations/training/${encodeURIComponent(trainingUuid)}`,
      { page: 1, ...query }
    ),

  listVisualizationTypes: (apiKey: string, trainingUuid: string): Promise<{ types: string[] }> =>
    get(visualizationTypesResponseSchema, apiKey, '/visualizations/types', {
      training_uuid: trainingUuid
    }),

  getVisualization: (apiKey: string, uuid: string): Promise<Visualization> =>
    get(visualizationSchema, apiKey, `/visualizations/${encodeURIComponent(uuid)}`),

  listFindings: (apiKey: string, query: Query): Promise<Finding[]> =>
    get(findingsResponseSchema, apiKey, '/findings', query),

  getFinding: (apiKey: string, id: string): Promise<Finding> =>
    get(findingSchema, apiKey, `/findings/${encodeURIComponent(id)}`),

  exportFinding: (
    apiKey: string,
    id: string,
    query?: Query
  ): Promise<{ filename: string; tex: string }> =>
    get(findingExportSchema, apiKey, `/findings/${encodeURIComponent(id)}/latex`, query),

  createFinding: (
    apiKey: string,
    body: {
      project: string;
      training?: string;
      title: string;
      body: string;
      recommendations?: string;
      trainingIds?: string[];
    }
  ): Promise<Finding> => post(findingSchema, apiKey, '/findings', body),

  listImageCategories: (apiKey: string, datasetId: string): Promise<ImageCategory[]> =>
    get(
      imageCategoriesResponseSchema,
      apiKey,
      `/image-categories/dataset/${encodeURIComponent(datasetId)}`
    )
};
