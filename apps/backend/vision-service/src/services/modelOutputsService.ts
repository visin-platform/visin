import { ConflictError, licenseView } from '@visin/backend-core';
import Epoch from '../models/Epoch';
import EpochVisualization from '../models/EpochVisualization';
import Evaluation from '../models/Evaluation';
import Project from '../models/Project';
import type { ITraining } from '../models/Training';
import { servableModel } from './trainingModelService';
import { evaluationScope, readerVisible } from './evaluationScope';
import { z } from '@visin/backend-core';
import { OUTPUT_FOLDER_NAMES, VISIN, type OutputFolder, type VisinModelLink } from './visinModels';

/**
 * What a model produced on the frames it was run on, described: which model, epoch, dataset and licence the outputs
 * belong to, how to read each kind, the checkpoint's results, and one row per output. The images themselves are the
 * visualizations the run uploaded against the model's epoch (a kind is a visualization `type`), read through the
 * visualization API by their `visualizationUuid`.
 */
export const OUTPUT_FOLDERS: Record<OutputFolder, string> = {
  mask: 'The predicted class of every pixel: an 8-bit PNG whose pixel values are class indices, named in modelInfo.train_classes.',
  segment: 'The prediction drawn in the class colours, for looking at.',
  confidence:
    'The probability of the predicted class at every pixel, stored as each row’s confidenceEncoding says (see confidence.encodings).'
};

/** Most output rows one answer lists; `totals` still counts every one. */
const MAX_LISTED_FILES = 5_000;

type StoredModel = VisinModelLink & { _id: { toString(): string } };

const baseName = (filename: string): string => filename.split(/[\\/]/).pop() ?? filename;

/** The other stored formats of the same checkpoint that are ready to be served, beside the one described. */
const siblingsOf = (training: ITraining, model: StoredModel) => {
  const digest = model.format === 'pth' ? model.sha256 : model.sourceSha256;
  if (!digest) return [];
  return (training.models ?? [])
    .filter((other) => other.provider === VISIN)
    .map((other) => other as unknown as StoredModel)
    .filter((other) => String(other._id) !== String(model._id) && other.status === 'ready' && other.license)
    .filter((other) => (other.format === 'pth' ? other.sha256 : other.sourceSha256) === digest)
    .map((other) => ({
      id: String(other._id),
      format: other.format,
      size: other.size,
      sha256: other.sha256,
      file: `/api/trainings/${training._id}/models/${other._id}/file`
    }));
};

/** The results an epoch's checkpoint scored, as the run reported them: what a consumer compares models by. */
async function metricsOf(
  trainingId: string,
  projectId: string | undefined,
  epochNumber: number,
  epochUuid: string,
  results: unknown,
  userId?: string
) {
  const scope = await evaluationScope(userId);
  const evaluations = await Evaluation.find({
    projectId,
    status: 'completed',
    deletedAt: null,
    hiddenAt: { $exists: false },
    $and: [
      { $or: [{ 'source.epochUuid': epochUuid }, { 'source.trainingId': trainingId, 'source.epoch': epochNumber }] },
      ...(projectId && scope.full.includes(projectId) ? [] : [readerVisible])
    ]
  })
    .select('results sampleCounts suite executedAt receivedAt provenance')
    .sort({ receivedAt: 1 })
    .lean();
  return {
    epoch: epochNumber,
    /** what the epoch itself reported while training (losses, validation scores) */
    results,
    /** one entry per test the checkpoint was scored on, with the sample counts behind each condition */
    evaluations: evaluations.map((evaluation) => ({
      id: String(evaluation._id),
      suite: evaluation.suite ? { slug: evaluation.suite.slug, version: evaluation.suite.version } : undefined,
      executedAt: evaluation.executedAt ?? evaluation.receivedAt,
      sampleCounts: evaluation.sampleCounts,
      results: evaluation.results
    }))
  };
}

interface Located {
  type: OutputFolder;
  filename: string;
  visualizationUuid: string;
  size?: number;
  prediction?: z.infer<typeof predictionSchema>;
}

/** Optional provenance reported with a visualization. Missing metadata stays unknown, never inferred from the training dataset. */
const predictionSchema = z.object({
  frame: z.string().min(1).max(300).optional(),
  dataset: z
    .object({
      source: z.literal('visin'),
      id: z.string().min(1),
      revision: z.string().min(1).optional(),
      archiveRevision: z.string().min(1).optional()
    })
    .optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  confidenceEncoding: z.enum(['uint8', 'uint16']).optional()
});

/** The outputs of an epoch, one per kind and frame (the newest upload wins), in a stable order. */
async function outputsOf(epochUuid: string): Promise<Located[]> {
  const rows = await EpochVisualization.find({ epoch_uuid: epochUuid, type: { $in: OUTPUT_FOLDER_NAMES } })
    .select('type filename visualization_uuid uploadedAt metadata')
    .sort({ uploadedAt: 1 })
    .lean();
  const latest = new Map<string, Located>();
  for (const row of rows) {
    const filename = baseName(row.filename);
    const size = (row.metadata as { size?: unknown } | undefined)?.size;
    const prediction = predictionSchema.safeParse((row.metadata as { prediction?: unknown } | undefined)?.prediction);
    latest.set(`${row.type}/${filename}`, {
      type: row.type as OutputFolder,
      filename,
      visualizationUuid: row.visualization_uuid,
      ...(prediction.success ? { prediction: prediction.data } : {}),
      ...(typeof size === 'number' ? { size } : {})
    });
  }
  return [...latest.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, located]) => located);
}

/** The input frame an output was made from: the one the upload named, or its file name without the extension. */
const frameOf = (output: Located): string => output.prediction?.frame ?? output.filename.replace(/\.[^.]+$/, '');

/**
 * Describe the outputs of a stored model. The model must be one that is served and name an epoch the run recorded;
 * the outputs are listed, not read.
 */
export async function describeModelOutputs(training: ITraining, modelId: string, userId?: string) {
  const model = servableModel(training, modelId) as StoredModel & { sha256: string; size: number };
  if (model.epoch === undefined) throw new ConflictError('This model names no epoch, so it has no outputs');
  const trainingId = String(training._id);
  const epoch = await Epoch.findOne({ trainingId, epoch: model.epoch, deletedAt: null })
    .select('epoch_uuid results epoch')
    .lean();
  if (!epoch) throw new ConflictError(`This run has no recorded epoch ${model.epoch}`);

  const outputs = await outputsOf(epoch.epoch_uuid);
  const metrics = await metricsOf(trainingId, training.projectId, model.epoch, epoch.epoch_uuid, epoch.results, userId);
  const project = training.projectId ? await Project.findById(training.projectId).select('name slug').lean() : null;
  const predicted = new Map<
    string,
    { dataset: z.infer<typeof predictionSchema>['dataset'] | null; frames: Set<string> }
  >();
  for (const output of outputs) {
    const dataset = output.prediction?.dataset ?? null;
    const key = JSON.stringify(dataset);
    const entry = predicted.get(key) ?? { dataset, frames: new Set<string>() };
    entry.frames.add(frameOf(output));
    predicted.set(key, entry);
  }

  return {
    run: {
      id: trainingId,
      uuid: training.uuid,
      name: training.name,
      status: training.status,
      project: project ? { id: String(project._id), name: project.name, slug: project.slug } : undefined,
      epoch: model.epoch,
      epochUuid: epoch.epoch_uuid
    },
    model: {
      id: String(model._id),
      format: model.format,
      filename: model.filename,
      size: model.size,
      sha256: model.sha256,
      epoch: model.epoch,
      license: licenseView(model.license),
      credit: model.credit,
      modelInfo: model.modelInfo,
      parity: model.parity,
      sourceSha256: model.sourceSha256,
      file: `/api/trainings/${trainingId}/models/${model._id}/file`
    },
    sameCheckpoint: siblingsOf(training, model),
    trainedOn: training.dataset ?? (training.datasetId ? { id: training.datasetId } : undefined),
    checkpoint: { epoch: model.epoch, sha256: model.format === 'pth' ? model.sha256 : model.sourceSha256 },
    predictedOn: [...predicted.values()].map(({ dataset, frames }) => ({ dataset, frames: [...frames].sort() })),
    outputGeometry: {
      coordinateSpace: 'input-image',
      modelInput: model.modelInfo?.transforms ?? null,
      mapping:
        'Resize class logits bilinearly to the input image size, then softmax and argmax. For ONNX probabilities, take log probabilities before bilinear resizing, then softmax and argmax. ONNX outputs use the square model input size without preserving aspect ratio.'
    },
    confidence: {
      quantity: 'p_max',
      range: '[1/C, 1], where C is the number of classes',
      encodings: { uint8: 'round(255 * p)', uint16: 'round(65535 * p)' }
    },
    folders: Object.fromEntries(OUTPUT_FOLDER_NAMES.map((folder) => [folder, OUTPUT_FOLDERS[folder]])),
    totals: Object.fromEntries(
      OUTPUT_FOLDER_NAMES.map((folder) => [folder, outputs.filter((output) => output.type === folder).length])
    ),
    metrics,
    files: outputs.slice(0, MAX_LISTED_FILES).map((output) => ({
      visualizationUuid: output.visualizationUuid,
      folder: output.type,
      frame: frameOf(output),
      filename: output.filename,
      ...(output.size === undefined ? {} : { size: output.size }),
      ...(output.prediction?.width || output.prediction?.height
        ? { geometry: { width: output.prediction.width, height: output.prediction.height } }
        : {}),
      ...(output.type === 'confidence'
        ? { confidenceEncoding: output.prediction?.confidenceEncoding ?? 'unknown' }
        : {})
    })),
    truncated: outputs.length > MAX_LISTED_FILES
  };
}
