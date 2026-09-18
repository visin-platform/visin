import { Types } from 'mongoose';
import { BadRequestError, ConflictError } from '@visin/backend-core';
import { ILabelJob } from '../models/LabelJob';
import { IMaskMeta, ITaskFrame, ITaskLayer, ITaskMaskMap, LabelTask } from '../models/LabelTask';
import * as datasets from '../clients/datasetServiceClient';
import { parseManifest } from '../utils/manifest';
import { seededSample } from '../utils/seededRandom';
import { MaskSelector, MaterializeBody } from '../validation/jobSchemas';

/**
 * The file-name variants that mean something to labeling, inside an annotation
 * group of a dataset: `0001.png` is the overlay layer, `0001.ids.png` the id map
 * whose pixel values are mask ids, and `0001.masks.json` those masks' metadata.
 */
export const IDS_VARIANT = 'ids';
export const MASKS_VARIANT = 'masks';

interface ResolvedRow {
  frame: ITaskFrame;
  stratum?: string;
}

interface AnnotationFiles {
  layers: Map<string, string>; // `${set} ${stem}` → fileId
  idmaps: Map<string, string>;
  masks: Map<string, IMaskMeta[]>;
}

const key = (set: string, stem: string): string => `${set} ${stem}`;

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
 * it. Sampling is seeded, so the same (dataset, selector, seed) always yields the
 * same task set.
 */
const selectMasks = (
  rows: ResolvedRow[],
  annotations: AnnotationFiles,
  set: string,
  selector: MaskSelector
): { byStem: Map<string, IMaskMeta[]>; counts: Record<string, number> } => {
  const include = selector.include ? new Set(selector.include) : undefined;
  const byValue = new Map<string, { stem: string; mask: IMaskMeta }[]>();

  for (const row of rows) {
    for (const mask of annotations.masks.get(key(set, row.frame.stem)) || []) {
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
    const picked = selector.perValue ? seededSample(entries, selector.perValue, selector.seed ?? 42) : entries;
    counts[value] = picked.length;
    for (const entry of picked) {
      byStem.set(entry.stem, [...(byStem.get(entry.stem) || []), entry.mask]);
    }
  }
  // Sampling shuffles; restore the dataset's own mask order so the workbench
  // walks masks in a stable, frame-local order.
  for (const [stem, masks] of byStem) {
    byStem.set(stem, [...masks].sort((a, b) => Number(a.id) - Number(b.id)));
  }
  return { byStem, counts };
};

const resolveRows = (
  rows: { stem: string; stratum?: string }[],
  framesByStem: Map<string, ITaskFrame>
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
  annotations: AnnotationFiles,
  selectedMasks?: Map<string, IMaskMeta[]>
): { layers?: ITaskLayer[]; maskMap?: ITaskMaskMap } | undefined => {
  const layers: ITaskLayer[] = [];
  for (const set of job.annotationSets) {
    const fileId = annotations.layers.get(key(set, stem));
    if (fileId) {
      layers.push({ set, fileId });
    }
  }

  let maskMap: ITaskMaskMap | undefined;
  if (job.taskType === 'mask_toggle') {
    const set = job.annotationSets[0];
    const fileId = annotations.idmaps.get(key(set, stem));
    if (fileId) {
      const masks = selectedMasks ? selectedMasks.get(stem) || [] : annotations.masks.get(key(set, stem)) || [];
      maskMap = { fileId, masks };
    }
  }

  if (layers.length === 0 && !maskMap) {
    return undefined;
  }
  return { ...(layers.length ? { layers } : {}), ...(maskMap ? { maskMap } : {}) };
};

/** A dataset item as the frame a task shows. */
const toFrame = (item: datasets.DatasetItem): ITaskFrame => ({
  fileId: item.fileId!,
  path: item.path,
  stem: item.stem,
  ...(item.width !== undefined ? { width: item.width } : {}),
  ...(item.height !== undefined ? { height: item.height } : {})
});

/** Layers, id maps and mask metadata for the job's annotation groups. */
const loadAnnotations = async (job: ILabelJob, datasetId: string): Promise<AnnotationFiles> => {
  const annotations: AnnotationFiles = { layers: new Map(), idmaps: new Map(), masks: new Map() };
  for (const set of job.annotationSets) {
    for (const item of await datasets.listItems(datasetId, { group: set, kind: 'image' })) {
      if (!item.variant) annotations.layers.set(key(set, item.stem), item.fileId!);
      else if (item.variant === IDS_VARIANT) annotations.idmaps.set(key(set, item.stem), item.fileId!);
    }
  }
  if (job.taskType === 'mask_toggle' && job.annotationSets[0]) {
    const set = job.annotationSets[0];
    for (const item of await datasets.listItems(datasetId, { group: set, kind: 'json', variant: MASKS_VARIANT })) {
      if (Array.isArray(item.data)) annotations.masks.set(key(set, item.stem), item.data as IMaskMeta[]);
    }
  }
  return annotations;
};

/**
 * Build the job's immutable task set from its dataset. Draft-only; re-running
 * replaces the previous set. Manifest rows (the dataset's, or posted inline) or
 * a seeded sample over the dataset's frames.
 *
 * Each task copies what it shows — file ids, sizes, the mask list — so labeling
 * never has to ask dataset-service for anything; the job's hold on the dataset
 * keeps those files in place.
 */
export const materializeTasks = async (
  job: ILabelJob,
  body: MaterializeBody
): Promise<{ tasks: number; missing: string[]; masks?: Record<string, number> }> => {
  if (job.status !== 'draft') {
    throw new ConflictError('Tasks can only be materialized while the job is a draft');
  }
  if (!job.datasetId) {
    throw new ConflictError('Job has no dataset');
  }
  const dataset = await datasets.getDataset(job.datasetId);
  const groupNames = new Set(dataset.groups.map((group) => group.name));

  if (!groupNames.has(job.framesGroup)) {
    throw new BadRequestError(`The dataset has no image group "${job.framesGroup}"`);
  }
  const invalidSets = job.annotationSets.filter((set) => !groupNames.has(set));
  if (invalidSets.length > 0) {
    throw new BadRequestError(`Annotation sets not in dataset: ${invalidSets.join(', ')}`);
  }
  if (job.taskType === 'mask_toggle' && job.annotationSets.length !== 1) {
    throw new BadRequestError('mask_toggle jobs verify exactly one annotation set');
  }

  const [frameItems, annotations] = await Promise.all([
    datasets.listItems(job.datasetId, { group: job.framesGroup, kind: 'image', noVariant: true }),
    loadAnnotations(job, job.datasetId)
  ]);
  // Path order — the order the dataset lists its frames in — is the task order.
  const frames = frameItems.map(toFrame).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const framesByStem = new Map(frames.map((frame) => [frame.stem, frame]));

  let rows: ResolvedRow[];
  let missing: string[] = [];

  if (body.kind === 'manifest') {
    const manifestRows = body.content
      ? parseManifest(body.content, body.format || 'csv')
      : (await datasets.getManifest(job.datasetId)).map((row) => ({
          stem: row.stem,
          ...(row.attributes.stratum ? { stratum: row.attributes.stratum } : {})
        }));
    if (manifestRows.length === 0) {
      throw new BadRequestError('No manifest: the dataset has none and none was posted');
    }
    ({ resolved: rows, missing } = resolveRows(manifestRows, framesByStem));
    if (rows.length === 0) {
      throw new BadRequestError('No manifest row matches a frame in the dataset');
    }
  } else {
    // "All frames" means all frames this job's set actually covers. A dataset can
    // carry several sets over different frames — one zip holding a mask-review
    // set and a candidate-review set, each painted on the frames it applies to —
    // and a mask_toggle job over one of them is not missing the other's frames,
    // it simply doesn't include them. A named manifest is different: that lists
    // frames on purpose, so a gap there stays an error below.
    const covered =
      job.taskType === 'mask_toggle'
        ? frames.filter((frame) => annotations.idmaps.has(key(job.annotationSets[0], frame.stem)))
        : frames;
    const all: ResolvedRow[] = covered.map((frame) => ({ frame }));
    rows = body.sampleN ? seededSample(all, body.sampleN, body.seed ?? 42) : all;
    if (rows.length === 0) {
      throw new BadRequestError(
        job.taskType === 'mask_toggle'
          ? `No frame in the dataset has an id map in "${job.annotationSets[0]}"`
          : 'The dataset has no frames'
      );
    }
  }

  if (job.taskType === 'mask_toggle') {
    const set = job.annotationSets[0];
    const withoutIdmap = rows.filter((row) => !annotations.idmaps.has(key(set, row.frame.stem)));
    if (withoutIdmap.length > 0) {
      throw new BadRequestError(
        `mask_toggle needs an id map per frame in "${set}" — missing for: ` +
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
    ({ byStem: selectedMasks, counts: maskCounts } = selectMasks(rows, annotations, job.annotationSets[0], body.masks));
    // A frame none of whose masks were selected has nothing to ask about.
    rows = rows.filter((row) => selectedMasks!.has(row.frame.stem));
    if (rows.length === 0) {
      throw new BadRequestError(`No mask matches the selection on "${body.masks.field}" in "${job.annotationSets[0]}"`);
    }
  }

  await LabelTask.deleteMany({ jobId: job._id });

  const tasks = rows.map((row, order) => {
    const payload = buildPayload(job, row.frame.stem, annotations, selectedMasks);
    return {
      jobId: job._id as Types.ObjectId,
      frame: row.frame,
      order,
      ...(row.stratum ? { stratum: row.stratum } : {}),
      ...(payload ? { payload } : {})
    };
  });
  await LabelTask.insertMany(tasks);

  job.selection = {
    kind: body.kind,
    spec: {
      ...(body.kind === 'manifest'
        ? { source: body.content ? 'inline' : 'dataset', rows: rows.length, missing: missing.length }
        : { sampleN: body.sampleN ?? null, seed: body.seed ?? 42, rows: rows.length }),
      ...(body.masks ? { masks: { ...body.masks, seed: body.masks.seed ?? 42, counts: maskCounts } } : {})
    }
  };
  job.tasksCount = rows.length;
  await job.save();

  return { tasks: rows.length, missing, ...(maskCounts ? { masks: maskCounts } : {}) };
};
