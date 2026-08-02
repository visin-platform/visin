import { Types } from 'mongoose';
import { BadRequestError, ConflictError } from '@visin/backend-core';
import { ILabelJob } from '../models/LabelJob';
import { LabelBundle, IManifestRow } from '../models/LabelBundle';
import { LabelImage, ILabelImage } from '../models/LabelImage';
import { IMaskMeta } from '../models/LabelImage';
import { LabelTask, ITaskLayer, ITaskMaskMap } from '../models/LabelTask';
import { parseManifest } from '../utils/manifest';
import { seededSample } from '../utils/seededRandom';
import { MaskSelector, MaterializeBody } from '../validation/jobSchemas';

interface ResolvedRow {
  frame: ILabelImage;
  stratum?: string;
}

/** A mask's value for the selector's field, as the string the UI offers. */
const fieldValue = (mask: IMaskMeta, field: string): string | undefined => {
  const value = (mask as Record<string, unknown>)[field];
  return value === undefined || value === null ? undefined : String(value);
};

/**
 * Pick the masks a job asks for, out of every mask in its annotation set.
 *
 * The cap is global rather than per frame: a group like "only one of the two
 * runs confirmed this candidate" has ~1,100 members spread one per frame across
 * thousands of frames, so a per-frame cap could never reach a target count for
 * it. Sampling is seeded, so the same (bundle, selector, seed) always yields the
 * same task set.
 */
const selectMasks = (
  rows: ResolvedRow[],
  idmapsByKey: Map<string, ILabelImage>,
  set: string,
  selector: MaskSelector
): { byStem: Map<string, IMaskMeta[]>; counts: Record<string, number> } => {
  const include = selector.include ? new Set(selector.include) : undefined;
  const byValue = new Map<string, { stem: string; mask: IMaskMeta }[]>();

  for (const row of rows) {
    const idmap = idmapsByKey.get(`${set} ${row.frame.stem}`);
    for (const mask of idmap?.metadata?.masks || []) {
      const value = fieldValue(mask, selector.field);
      if (value === undefined || (include && !include.has(value))) {
        continue;
      }
      byValue.set(value, [...(byValue.get(value) || []), { stem: row.frame.stem, mask }]);
    }
  }

  const byStem = new Map<string, IMaskMeta[]>();
  const counts: Record<string, number> = {};
  for (const [value, entries] of byValue) {
    const picked = selector.perValue
      ? seededSample(entries, selector.perValue, selector.seed ?? 42)
      : entries;
    counts[value] = picked.length;
    for (const entry of picked) {
      byStem.set(entry.stem, [...(byStem.get(entry.stem) || []), entry.mask]);
    }
  }
  // Sampling shuffles; restore the bundle's own mask order so the workbench
  // walks masks in a stable, frame-local order.
  for (const [stem, masks] of byStem) {
    byStem.set(stem, [...masks].sort((a, b) => Number(a.id) - Number(b.id)));
  }
  return { byStem, counts };
};

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
  idmapsByKey: Map<string, ILabelImage>,
  selectedMasks?: Map<string, IMaskMeta[]>
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
      const masks = selectedMasks ? selectedMasks.get(stem) || [] : idmap.metadata?.masks || [];
      maskMap = { imageId: idmap._id, masks };
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
): Promise<{ tasks: number; missing: string[]; masks?: Record<string, number> }> => {
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
    // "All frames" means all frames this job's set actually covers. A bundle can
    // carry several sets over different frames — one zip holding a mask-review
    // set and a candidate-review set, each painted on the frames it applies to —
    // and a mask_toggle job over one of them is not missing the other's frames,
    // it simply doesn't include them. A named manifest is different: that lists
    // frames on purpose, so a gap there stays an error below.
    const covered =
      job.taskType === 'mask_toggle'
        ? frames.filter((frame) => idmapsByKey.has(`${job.annotationSets[0]} ${frame.stem}`))
        : frames;
    const all: ResolvedRow[] = covered.map((frame) => ({ frame }));
    rows = body.sampleN ? seededSample(all, body.sampleN, body.seed ?? 42) : all;
    if (rows.length === 0) {
      throw new BadRequestError(
        job.taskType === 'mask_toggle'
          ? `No frame in the bundle has an .ids.png in "${job.annotationSets[0]}"`
          : 'Bundle has no frames'
      );
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

  let selectedMasks: Map<string, IMaskMeta[]> | undefined;
  let maskCounts: Record<string, number> | undefined;
  if (body.masks) {
    if (job.taskType !== 'mask_toggle') {
      throw new BadRequestError('A mask selection only applies to mask_toggle jobs');
    }
    ({ byStem: selectedMasks, counts: maskCounts } = selectMasks(
      rows,
      idmapsByKey,
      job.annotationSets[0],
      body.masks
    ));
    // A frame none of whose masks were selected has nothing to ask about.
    rows = rows.filter((row) => selectedMasks!.has(row.frame.stem));
    if (rows.length === 0) {
      throw new BadRequestError(
        `No mask matches the selection on "${body.masks.field}" in "${job.annotationSets[0]}"`
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
      const payload = buildPayload(job, row.frame.stem, layersByKey, idmapsByKey, selectedMasks);
      return payload ? { payload } : {};
    })()
  }));
  await LabelTask.insertMany(tasks);

  job.selection = {
    kind: body.kind,
    spec: {
      ...(body.kind === 'manifest'
        ? { source: body.content ? 'inline' : 'bundle', rows: rows.length, missing: missing.length }
        : { sampleN: body.sampleN ?? null, seed: body.seed ?? 42, rows: rows.length }),
      ...(body.masks ? { masks: { ...body.masks, seed: body.masks.seed ?? 42, counts: maskCounts } } : {})
    }
  };
  job.tasksCount = rows.length;
  await job.save();

  return { tasks: rows.length, missing, ...(maskCounts ? { masks: maskCounts } : {}) };
};
