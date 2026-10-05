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
    visibility: z.enum(['private', 'public']).catch('private'),
    owner: z.object({ kind: z.enum(['user', 'group']), id: z.string(), name: z.string().optional() }).optional(),
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

/**
 * `GET /trainings/{id}/summary`: how a run did, in one call. Each result carries its best
 * epoch beside its last, in the direction the project set (`directionFrom: 'taxonomy'`) or
 * guessed from the result's name (`'default'`), so a caller can say which it is relying on.
 */
export const trainingSummarySchema = z
  .object({
    epochCount: z.number(),
    lastEpoch: z.number().nullable(),
    metrics: z
      .array(
        z
          .object({
            path: z.string(),
            direction: z.enum(['higher', 'lower']),
            directionFrom: z.enum(['taxonomy', 'default']),
            best: z.object({ value: z.number(), epoch: z.number() }),
            last: z.object({ value: z.number(), epoch: z.number() })
          })
          .loose()
      )
      .catch([]),
    models: z.array(z.object({ repo: z.string(), revision: z.string(), space: z.string().optional() }).loose()).catch([]),
    provenance: z
      .object({
        git: z.object({ commit: z.string(), branch: z.string().optional(), dirty: z.boolean().optional() }).loose().optional(),
        command: z.string().optional()
      })
      .loose()
      .optional()
  })
  .loose();
export type TrainingSummary = z.infer<typeof trainingSummarySchema>;

export const trainingWithEpochsSchema = z
  .object({
    training: trainingSchema,
    epochs: z.array(epochSchema).catch([]),
    /**
     * How many epochs the run actually has, which is not `epochs.length` when
     * the response was sampled. Optional so a vision-service that predates the
     * `sample` parameter still parses; the caller falls back to counting.
     */
    totalEpochs: z.number().optional()
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
 * A named condition maps to per-class score objects; the top-level `overall`
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
 * What a run's checkpoints scored, as `/evaluations` lists it with `include=results`: the result blob stays open
 * here (a suite's result may carry keys the breakdown has no use for), and `testResultOf` keeps the part that is a
 * condition-by-class breakdown.
 */
export const runEvaluationsResponseSchema = z
  .object({
    evaluations: z.array(
      z
        .object({
          _id: z.string(),
          uuid: z.string().optional(),
          source: z.object({ epochUuid: z.string().optional(), epoch: z.number().optional() }).loose().optional(),
          executedAt: z.string().optional(),
          receivedAt: z.string().optional(),
          results: z.record(z.string(), z.unknown()).default({}),
          run: z.object({ _id: z.string(), name: z.string(), uuid: z.string().optional() }).loose().optional()
        })
        .loose()
    ),
    pagination: pagination.optional()
  })
  .loose();
export type RunEvaluation = z.infer<typeof runEvaluationsResponseSchema>['evaluations'][number];

/** The breakdown of one evaluation: its conditions, each a set of classes (and summary scalars). Anything else is left out. */
export function testResultOf(row: RunEvaluation): TestResult {
  const breakdown: Record<string, Record<string, z.infer<typeof conditionEntrySchema>>> = {};
  for (const [condition, entries] of Object.entries(row.results)) {
    const parsed = z.record(z.string(), conditionEntrySchema).safeParse(entries);
    if (parsed.success) breakdown[condition] = parsed.data;
  }
  return {
    _id: row._id,
    ...(row.source?.epoch !== undefined ? { epoch: row.source.epoch } : {}),
    ...(row.uuid ? { test_uuid: row.uuid } : {}),
    ...(row.source?.epochUuid ? { epoch_uuid: row.source.epochUuid } : {}),
    ...((row.executedAt ?? row.receivedAt) ? { timestamp: row.executedAt ?? row.receivedAt } : {}),
    test_results: breakdown,
    ...(row.run ? { training: row.run } : {})
  };
}

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

/**
 * A dataset as dataset-service describes it: a zip to download, a summary of
 * what the zip holds, and the image groups imported out of it.
 */
/** What a publisher declares the data is licensed under; the server fills in the name, link and commercial use. */
export const licenseSchema = z
  .object({ id: z.string(), name: z.string(), url: z.string().optional(), commercial: z.boolean().optional() })
  .loose();

export const datasetSchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    /** a person or a group; `name` is the group's, when the caller is in it */
    owner: z.object({ kind: z.enum(['user', 'group']), id: z.string(), name: z.string().optional() }).loose().optional(),
    /** `private` or `public` */
    visibility: z.string().optional(),
    license: licenseSchema.optional().catch(undefined),
    credit: z.string().optional(),
    /** set when the dataset lives on the Hugging Face Hub: a pointer, never a copy */
    source: z.object({ provider: z.string(), repo: z.string(), revision: z.string() }).loose().optional().catch(undefined),
    archive: z.object({ filename: z.string(), size: z.number() }).loose().optional(),
    contents: z
      .object({
        entries: z.number(),
        totalBytes: z.number(),
        extensions: z.array(z.object({ ext: z.string(), files: z.number(), bytes: z.number() }).loose()),
        folders: z.array(z.object({ path: z.string(), depth: z.number(), files: z.number(), images: z.number() }).loose())
      })
      .loose()
      .optional(),
    groups: z.array(z.object({ name: z.string(), images: z.number(), jsons: z.number() }).loose()).default([]),
    imageCount: z.number().default(0),
    import: z.object({ status: z.string() }).loose().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
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

/**
 * A cited run, named by vision-service.
 *
 * Without this a finding read back was a title and a list of ObjectIds, which
 * tells the next session nothing about which runs the conclusion rests on —
 * the one thing a citation exists to say.
 */
const citedTrainingSchema = z
  .object({ _id: z.string(), name: z.string(), status: z.string().catch('unknown') })
  .loose();

/**
 * A run's hyperparameters.
 *
 * `config_data` is whatever the pipeline wrote — a nested dict of whatever that
 * model takes — so it stays open and the renderer flattens it. Exposed because
 * an assistant asked "what should I change for the next run" cannot answer
 * without seeing what the last one was set to; before this it could only
 * describe outcomes and guess at causes.
 */
export const configSchema = z
  .object({
    _id: z.string().optional(),
    config_uuid: z.string().optional(),
    config_name: z.string().optional(),
    summary: z.string().catch(''),
    config_data: z.record(z.string(), z.unknown()).catch({})
  })
  .loose();

export const trainingConfigsResponseSchema = z
  .object({ configs: z.array(configSchema).catch([]), total: z.number().optional() })
  .loose();

export const findingSchema = z
  .object({
    _id: z.string(),
    projectId: z.string(),
    trainingId: z.string().optional(),
    title: z.string(),
    body: z.string(),
    /** What to change next time; kept out of the body because a paper never wants it */
    recommendations: z.string().optional(),
    trainingIds: z.array(z.string()).catch([]),
    // `.catch([])` rather than required: mcp-service and vision-service deploy
    // separately, so this must not turn into a ShapeError on every finding for
    // the length of a rolling deploy.
    citedTrainings: z.array(citedTrainingSchema).catch([]),
    authorKind: z.enum(['person', 'assistant']).catch('person'),
    authorLabel: z.string().catch(''),
    createdAt: z.string().optional()
  })
  .loose();

export const findingsResponseSchema = z.array(findingSchema);

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
    /**
     * Every epoch of the run, which this endpoint has always sent and this
     * client used to drop on the floor.
     *
     * None of it is rendered — a 200-epoch series per run is the single most
     * expensive thing this server could hand back. It is parsed so the tool can
     * say where each metric peaked, which is what makes a comparison answerable:
     * `lastEpoch` alone reports a run at whatever it happened to end on.
     */
    epochs: z.array(epochSchema).catch([]),
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
export type Visualization = z.infer<typeof visualizationSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ComparisonEntry = z.infer<typeof comparisonEntrySchema>;
export type Config = z.infer<typeof configSchema>;

/** A finding rendered as a LaTeX section, with its table built from recorded epochs. */
export const findingExportSchema = z
  .object({ filename: z.string(), tex: z.string() })
  .loose();

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

/** A suite: a written-down way of scoring a model. Results on one suite version can be compared. */
export const suiteSchema = z
  .object({
    _id: z.string(),
    slug: z.string(),
    version: z.number(),
    name: z.string(),
    description: z.string().optional(),
    visibility: z.enum(['private', 'public']).catch('private'),
    digest: z.string().optional(),
    archivedAt: z.string().optional(),
    /** what the publisher says about the evaluated data; absent means unstated */
    dataTerms: z
      .object({ license: licenseSchema.optional(), sourceUrl: z.string().optional(), credit: z.string().optional() })
      .loose()
      .optional()
      .catch(undefined),
    protocol: z
      .object({
        task: z.string().optional(),
        split: z.string().optional(),
        aggregation: z.string().optional(),
        conditions: z.array(z.object({ name: z.string(), sampleCount: z.number().optional() }).loose()).catch([]),
        metrics: z
          .array(
            z
              .object({
                key: z.string(),
                direction: z.enum(['max', 'min']).catch('max'),
                unit: z.string().optional(),
                headline: z.boolean().optional()
              })
              .loose()
          )
          .catch([])
      })
      .loose()
  })
  .loose();

export const suitesResponseSchema = z.object({ suites: z.array(suiteSchema), pagination: pagination.optional() }).loose();

/**
 * Where a checkpoint lives. Only its kind is required: each kind's own fields are read where it is named
 * (`checkpointNames` in tools/evaluation.ts), so a kind this server does not know yet is shown by its kind, not lost.
 */
const checkpointSchema = z.object({ kind: z.string() }).loose().optional().catch(undefined);

const evidenceLevel = z.enum(['observed', 'reported', 'attested', 'none']).optional().catch(undefined);

export const leaderboardSchema = z
  .object({
    suite: z
      .object({
        slug: z.string(),
        version: z.number(),
        name: z.string(),
        headline: z.object({ key: z.string(), direction: z.enum(['max', 'min']).catch('max'), unit: z.string().optional() }).loose()
      })
      .loose(),
    scope: z.object({ candidates: z.number().catch(0) }).loose(),
    entries: z.array(
      z
        .object({
          evaluationId: z.string(),
          rank: z.number(),
          attempts: z.number().catch(1),
          checkpoint: checkpointSchema,
          evidenceLevel,
          summary: z
            .object({
              headline: z.object({ value: z.number() }).loose(),
              worst: z.object({ condition: z.string(), value: z.number() }).loose(),
              gap: z.number()
            })
            .loose()
        })
        .loose()
    ),
    unranked: z.array(z.object({ state: z.string().catch('unknown'), reasons: z.array(z.object({ code: z.string() }).loose()).catch([]) }).loose()).catch([]),
    pagination: pagination.optional()
  })
  .loose();

/** One evaluation, with the scores the ranking uses when it is ranked. */
export const evaluationSchema = z
  .object({
    _id: z.string(),
    checkpoint: checkpointSchema,
    suite: z.object({ slug: z.string(), version: z.number() }).loose().optional(),
    validation: z
      .object({
        state: z.string(),
        evidence: evidenceLevel,
        scores: z
          .object({
            conditions: z.record(z.string(), z.record(z.string(), z.number())),
            overall: z.record(z.string(), z.number())
          })
          .loose()
          .optional()
      })
      .loose()
  })
  .loose();

export type Suite = z.infer<typeof suiteSchema>;
export type Leaderboard = z.infer<typeof leaderboardSchema>;
export type EvaluationRecord = z.infer<typeof evaluationSchema>;

/** Parse, or fail with something a person can act on. */
export function parseResponse<T>(schema: z.ZodType<T>, path: string, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const where = issue.path.length > 0 ? issue.path.join('.') : '(root)';
  throw new ShapeError(path, `${where}: ${issue.message}`);
}
