import { z } from 'zod';

/**
 * What vision-service actually returns, checked at the boundary.
 *
 * Parsing here rather than trusting the shape is the difference between a
 * changed contract surfacing as a message that names the field, on the first
 * call, and surfacing as a plausible-looking answer built from `undefined` —
 * which is by far the worse of the two, because nobody notices. A tool that
 * quietly reports "0 epochs" for a run with three hundred of them is a bug that
 * reaches the user as a fact.
 *
 * Every object is `.loose()`: these endpoints carry far more than the tools
 * read, and rejecting a response for containing an extra field would be a
 * self-inflicted outage on the next unrelated deploy.
 */

/** Every paginated endpoint answers with a named collection plus this. */
const pagination = z
  .object({
    page: z.number().optional(),
    limit: z.number().optional(),
    total: z.number().optional(),
    pages: z.number().optional()
  })
  .loose();

export const projectSchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    isPublic: z.boolean().catch(false),
    ownerId: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
  })
  .loose();

/** `/projects` answers with a bare array, not a named collection. */
export const projectsResponseSchema = z.array(projectSchema);

export const dashboardStatsSchema = z
  .object({
    trainingStats: z
      .object({
        totalTrainings: z.number().catch(0),
        totalTime: z.number().catch(0),
        totalEpochs: z.number().catch(0),
        avgEpochTime: z.number().catch(0),
        totalCpuCost: z.number().catch(0),
        totalGpuCost: z.number().catch(0),
        totalCost: z.number().catch(0)
      })
      .loose(),
    testResultsCount: z.number().catch(0),
    visualizationsCount: z.number().catch(0),
    benchmarksCount: z.number().catch(0)
  })
  .loose();

/**
 * The per-training rollup `/trainings` attaches when it can.
 *
 * Absent on a run with no epochs, so every field is optional rather than
 * defaulted — "no epochs yet" and "zero seconds of training" are different
 * things to say to someone asking how a run is going.
 */
const trainingMetricsSchema = z
  .object({
    totalTime: z.number().optional(),
    epochCount: z.number().optional(),
    maxEpoch: z.number().optional(),
    lastEpochTimestamp: z.string().nullable().optional(),
    totalCost: z.number().optional()
  })
  .loose();

export const trainingSchema = z
  .object({
    _id: z.string(),
    uuid: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    status: z.string().catch('unknown'),
    projectId: z.string().optional(),
    datasetId: z.string().optional(),
    configId: z.string().optional(),
    tags: z.array(z.string()).catch([]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    metrics: trainingMetricsSchema.optional()
  })
  .loose();

export const trainingsResponseSchema = z
  .object({
    trainings: z.array(trainingSchema),
    pagination: pagination.optional()
  })
  .loose();

/**
 * One epoch.
 *
 * `results` is an open record because it genuinely is: what a run records per
 * epoch depends on the model and the config, so the tools render whatever keys
 * are there rather than naming metrics this service cannot know about.
 */
export const epochSchema = z
  .object({
    epoch: z.number(),
    epoch_uuid: z.string().optional(),
    results: z.record(z.string(), z.unknown()).catch({}),
    epoch_time: z.number().optional(),
    learning_rate: z.number().optional(),
    timestamp: z.string().optional()
  })
  .loose();

export const trainingWithEpochsSchema = z
  .object({
    training: trainingSchema,
    epochs: z.array(epochSchema).catch([])
  })
  .loose();

/** One class's scores under one condition. `.loose()` — runs record extras. */
const classScoresSchema = z
  .object({
    iou: z.number().optional(),
    precision: z.number().optional(),
    recall: z.number().optional(),
    f1_score: z.number().optional(),
    ap: z.number().optional()
  })
  .loose();

/**
 * What sits under a condition, which is not one shape.
 *
 * A weather condition maps to per-class score objects; the top-level `overall`
 * maps straight to summary scalars (`mIoU_foreground`, `fw_iou`, ...). Demanding
 * objects everywhere failed the whole parse on that one key, and the `.catch({})`
 * that used to sit here turned the failure into an empty result — so the tool
 * printed a header with no rows under it and looked merely uninteresting rather
 * than broken.
 */
const conditionEntrySchema = z.union([classScoresSchema, z.number()]);

export const testResultSchema = z
  .object({
    _id: z.string(),
    epoch: z.number().optional(),
    test_uuid: z.string().optional(),
    epoch_uuid: z.string().optional(),
    timestamp: z.string().optional(),
    // `.default({})` for a row that has none, but deliberately no `.catch`:
    // a shape this permissive failing means the contract really has moved, and
    // that should surface as a named ShapeError rather than as empty output.
    test_results: z.record(z.string(), z.record(z.string(), conditionEntrySchema)).default({}),
    training: z
      .object({ _id: z.string(), name: z.string(), uuid: z.string().optional() })
      .loose()
      .nullable()
      .optional()
  })
  .loose();

/**
 * `/test-results` answers with pagination when asked for a page and a bare
 * total when not. Both are accepted because both are real.
 */
export const testResultsResponseSchema = z
  .object({
    testResults: z.array(testResultSchema),
    pagination: pagination.optional(),
    total: z.number().optional()
  })
  .loose();

const benchmarkResultSchema = z
  .object({
    model_name: z.string().optional(),
    backbone: z.string().optional(),
    modality: z.string().optional(),
    dataset: z.string().optional(),
    image_size: z.number().optional(),
    total_parameters_m: z.number().optional(),
    trainable_parameters_m: z.number().optional(),
    flops_giga: z.number().optional(),
    mean_time_ms: z.number().optional(),
    fps: z.number().optional(),
    gpu_memory_mean_mb: z.number().optional(),
    gpu_memory_max_mb: z.number().optional(),
    ram_memory_mean_mb: z.number().optional(),
    device: z.string().optional()
  })
  .loose();

export const benchmarkSchema = z
  .object({
    _id: z.string(),
    epoch: z.number().optional(),
    timestamp: z.string().optional(),
    system_info: z
      .object({
        cpu_count: z.number().optional(),
        memory_total_gb: z.number().optional(),
        gpu_name: z.string().optional(),
        gpu_memory_total_gb: z.number().optional()
      })
      .loose()
      .optional(),
    results: z.array(benchmarkResultSchema).catch([])
  })
  .loose();

export const benchmarksResponseSchema = z
  .object({
    benchmarks: z.array(benchmarkSchema),
    pagination: pagination.optional()
  })
  .loose();

export const datasetSchema = z
  .object({
    _id: z.string(),
    uuid: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    timestamp: z.string().optional(),
    dataset_info: z.record(z.string(), z.unknown()).optional(),
    annotations: z.record(z.string(), z.unknown()).optional(),
    camera: z.record(z.string(), z.unknown()).optional(),
    lidar: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().optional()
  })
  .loose();

export const datasetsResponseSchema = z
  .object({
    datasets: z.array(datasetSchema),
    pagination: pagination.optional()
  })
  .loose();

/**
 * One rendered frame: a prediction overlay, a ground-truth comparison, a
 * segmentation map. The signed URL comes back on the listing itself, already
 * scoped by the project-access check that produced it.
 */
export const visualizationSchema = z
  .object({
    visualization_uuid: z.string(),
    epoch_uuid: z.string().optional(),
    training_uuid: z.string().optional(),
    epoch: z.number().optional(),
    filename: z.string().optional(),
    type: z.string().catch('unknown'),
    signedUrl: z.string().optional(),
    uploadedAt: z.string().optional()
  })
  .loose();

export const visualizationsResponseSchema = z
  .object({
    visualizations: z.array(visualizationSchema),
    total: z.number().optional(),
    pagination: pagination.optional()
  })
  .loose();

export const visualizationTypesResponseSchema = z
  .object({ types: z.array(z.string()).catch([]) })
  .loose();

export const findingSchema = z
  .object({
    _id: z.string(),
    projectId: z.string(),
    trainingId: z.string().optional(),
    title: z.string(),
    body: z.string(),
    trainingIds: z.array(z.string()).catch([]),
    authorKind: z.enum(['person', 'assistant']).catch('person'),
    authorLabel: z.string().catch(''),
    createdAt: z.string().optional()
  })
  .loose();

export const findingsResponseSchema = z.array(findingSchema);

export const imageCategorySchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    color: z.string().optional(),
    datasetId: z.string().optional()
  })
  .loose();

export const imageCategoriesResponseSchema = z.array(imageCategorySchema);

/** One training's slice of a comparison. */
export const comparisonEntrySchema = z
  .object({
    training: z
      .object({
        _id: z.string(),
        name: z.string(),
        status: z.string().optional(),
        description: z.string().optional()
      })
      .loose(),
    metrics: z
      .object({
        totalEpochs: z.number().catch(0),
        totalTime: z.number().catch(0),
        avgEpochTime: z.number().catch(0),
        cost: z.object({ totalHours: z.number(), totalCost: z.number() }).loose().optional()
      })
      .loose(),
    lastEpoch: z
      .object({
        epoch: z.number(),
        results: z.record(z.string(), z.unknown()).catch({})
      })
      .loose()
      .nullable()
      .optional(),
    testResultsCount: z.number().catch(0),
    benchmarks: z.array(benchmarkSchema).catch([])
  })
  .loose();

export const comparisonResponseSchema = z
  .object({
    comparison: z.array(comparisonEntrySchema),
    summary: z
      .object({
        totalTrainings: z.number().optional(),
        trainingsWithEpochs: z.number().optional(),
        trainingsWithTestResults: z.number().optional(),
        trainingsWithBenchmarks: z.number().optional()
      })
      .loose()
      .optional()
  })
  .loose();

export type Project = z.infer<typeof projectSchema>;
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type Training = z.infer<typeof trainingSchema>;
export type Epoch = z.infer<typeof epochSchema>;
export type TestResult = z.infer<typeof testResultSchema>;
export type Benchmark = z.infer<typeof benchmarkSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type ImageCategory = z.infer<typeof imageCategorySchema>;
export type Visualization = z.infer<typeof visualizationSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ComparisonEntry = z.infer<typeof comparisonEntrySchema>;

/**
 * A response that did not look the way this client expects.
 *
 * Named separately from a transport failure because the two want different
 * responses: a 500 is worth retrying, a changed contract is not, and a model
 * told only "something went wrong" will retry either.
 */
export class ShapeError extends Error {
  constructor(
    readonly path: string,
    readonly detail: string
  ) {
    super(
      `The response from ${path} was not the shape this server expects (${detail}). ` +
        'The Visin API has probably changed; this is a bug to report rather than something to retry.'
    );
    this.name = 'ShapeError';
  }
}

/** Parse, or fail with something a person can act on. */
export function parseResponse<T>(schema: z.ZodType<T>, path: string, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
  throw new ShapeError(path, `${where}: ${issue.message}`);
}
