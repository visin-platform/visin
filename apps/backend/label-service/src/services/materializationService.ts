import { Types } from 'mongoose';
import { BadRequestError, ConflictError } from '@visin/backend-core';
import { ILabelJob } from '../models/LabelJob';
import { LabelBundle, IManifestRow } from '../models/LabelBundle';
import { LabelImage, ILabelImage } from '../models/LabelImage';
import { LabelTask, ITaskLayer, ITaskMaskMap } from '../models/LabelTask';
import { parseManifest } from '../utils/manifest';
import { seededSample } from '../utils/seededRandom';
import { MaterializeBody } from '../validation/jobSchemas';

interface ResolvedRow {
  frame: ILabelImage;
  stratum?: string;
}

const resolveRows = (
  rows: IManifestRow[],
  framesByStem: Map<string, ILabelImage>
): { resolved: ResolvedRow[]; missing: string[] } => {
  const resolved: ResolvedRow[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    const frame = framesByStem.get(row.stem);
    if (!frame) {
      missing.push(row.stem);
    } else {
      resolved.push({ frame, ...(row.stratum ? { stratum: row.stratum } : {}) });
    }
  }
  return { resolved, missing };
};

const buildPayload = (
  job: ILabelJob,
  stem: string,
  layersByKey: Map<string, ILabelImage>,
  idmapsByKey: Map<string, ILabelImage>
): { layers?: ITaskLayer[]; maskMap?: ITaskMaskMap } | undefined => {
  const layers: ITaskLayer[] = [];
  for (const set of job.annotationSets) {
    const layer = layersByKey.get(`${set} ${stem}`);
    if (layer) {
      layers.push({ set, imageId: layer._id });
    }
  }

  let maskMap: ITaskMaskMap | undefined;
  if (job.taskType === 'mask_toggle') {
    const set = job.annotationSets[0];
    const idmap = idmapsByKey.get(`${set} ${stem}`);
    if (idmap) {
      maskMap = { imageId: idmap._id, masks: idmap.metadata?.masks || [] };
    }
  }

  if (layers.length === 0 && !maskMap) {
    return undefined;
  }
  return { ...(layers.length ? { layers } : {}), ...(maskMap ? { maskMap } : {}) };
};

/**
 * Build the job's immutable task set from its bundle. Draft-only; re-running
 * replaces the previous set. Manifest rows (from the bundle zip or posted inline)
 * or a seeded sample over the bundle's frames.
 */
export const materializeTasks = async (
  job: ILabelJob,
  body: MaterializeBody
): Promise<{ tasks: number; missing: string[] }> => {
  if (job.status !== 'draft') {
    throw new ConflictError('Tasks can only be materialized while the job is a draft');
  }
  if (!job.bundleId) {
    throw new ConflictError('Job has no bundle');
  }
  const bundle = await LabelBundle.findById(job.bundleId);
  if (!bundle || bundle.status !== 'ready') {
    throw new ConflictError('Bundle is not ready');
  }

  const invalidSets = job.annotationSets.filter((set) => !bundle.annotationSets.includes(set));
  if (invalidSets.length > 0) {
    throw new BadRequestError(`Annotation sets not in bundle: ${invalidSets.join(', ')}`);
  }
  if (job.taskType === 'mask_toggle' && job.annotationSets.length !== 1) {
    throw new BadRequestError('mask_toggle jobs verify exactly one annotation set');
  }

  const [frames, annotationImages] = await Promise.all([
    LabelImage.find({ bundleId: bundle._id, kind: 'frame' }).sort({ path: 1 }),
    job.annotationSets.length
      ? LabelImage.find({ bundleId: bundle._id, kind: { $in: ['layer', 'idmap'] }, annotationSet: { $in: job.annotationSets } })
      : Promise.resolve([] as ILabelImage[])
  ]);

  const framesByStem = new Map(frames.map((frame) => [frame.stem, frame]));
  const layersByKey = new Map(
    annotationImages.filter((i) => i.kind === 'layer').map((i) => [`${i.annotationSet} ${i.stem}`, i])
  );
  const idmapsByKey = new Map(
    annotationImages.filter((i) => i.kind === 'idmap').map((i) => [`${i.annotationSet} ${i.stem}`, i])
  );

  let rows: ResolvedRow[];
  let missing: string[] = [];

  if (body.kind === 'manifest') {
    const manifestRows = body.content
      ? parseManifest(body.content, body.format || 'csv')
      : bundle.manifest;
    if (!manifestRows || manifestRows.length === 0) {
      throw new BadRequestError('No manifest: the bundle zip had none and none was posted');
    }
    ({ resolved: rows, missing } = resolveRows(manifestRows, framesByStem));
    if (rows.length === 0) {
      throw new BadRequestError('No manifest row matches a frame in the bundle');
    }
  } else {
    const all: ResolvedRow[] = frames.map((frame) => ({ frame }));
    rows = body.sampleN ? seededSample(all, body.sampleN, body.seed ?? 42) : all;
    if (rows.length === 0) {
      throw new BadRequestError('Bundle has no frames');
    }
  }

  if (job.taskType === 'mask_toggle') {
    const set = job.annotationSets[0];
    const withoutIdmap = rows.filter((row) => !idmapsByKey.has(`${set} ${row.frame.stem}`));
    if (withoutIdmap.length > 0) {
      throw new BadRequestError(
        `mask_toggle needs an .ids.png per frame in "${set}" — missing for: ` +
          withoutIdmap.slice(0, 5).map((row) => row.frame.stem).join(', ') +
          (withoutIdmap.length > 5 ? ` (+${withoutIdmap.length - 5} more)` : '')
      );
    }
  }

  await LabelTask.deleteMany({ jobId: job._id });

  const tasks = rows.map((row, order) => ({
    jobId: job._id as Types.ObjectId,
    labelImageId: row.frame._id as Types.ObjectId,
    order,
    ...(row.stratum ? { stratum: row.stratum } : {}),
    ...(() => {
      const payload = buildPayload(job, row.frame.stem, layersByKey, idmapsByKey);
      return payload ? { payload } : {};
    })()
  }));
  await LabelTask.insertMany(tasks);

  job.selection = {
    kind: body.kind,
    spec:
      body.kind === 'manifest'
        ? { source: body.content ? 'inline' : 'bundle', rows: rows.length, missing: missing.length }
        : { sampleN: body.sampleN ?? null, seed: body.seed ?? 42, rows: rows.length }
  };
  job.tasksCount = rows.length;
  await job.save();

  return { tasks: rows.length, missing };
};
