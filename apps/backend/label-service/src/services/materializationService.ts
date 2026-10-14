import { Types } from 'mongoose';
import { BadRequestError, ConflictError, logger } from '@visin/backend-core';
import { ILabelJob, IJobSensor } from '../models/LabelJob';
import { ITaskFrame, ITaskPoint, ITaskSensor, LabelTask } from '../models/LabelTask';
import * as datasets from '../clients/datasetServiceClient';
import { parseManifest } from '../utils/manifest';
import { seededSample } from '../utils/seededRandom';
import { MaterializeBody } from '../validation/jobSchemas';
import { abandonTaskSet, beginTaskSet, publishTaskSet, renewTaskSet, TASK_BATCH_SIZE } from './taskSetService';

/** A point sensor's sidecar can be dense; a frame shows no more than this many of its points. */
export const MAX_POINTS_PER_FRAME = 20_000;

interface ResolvedRow {
  frame: ITaskFrame;
  stratum?: string;
}

/** What each non-camera sensor has on file, by frame stem. */
type SensorFiles = Map<string, Map<string, ITaskSensor>>;

const num = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * A point sensor's JSON sidecar as the points a frame draws.
 *
 * Datasets name their fields differently, so the reading a point carries is
 * whichever of the usual names is present; position is `u`/`v` (or `x`/`y`, or
 * a `[u, v, value?]` triple), always in the camera frame's pixels.
 */
export const toPoints = (data: unknown): ITaskPoint[] | undefined => {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { points?: unknown }).points)
      ? ((data as { points: unknown[] }).points as unknown[])
      : undefined;
  if (!list) return undefined;
  const points: ITaskPoint[] = [];
  for (const entry of list) {
    if (points.length >= MAX_POINTS_PER_FRAME) break;
    let u: number | undefined;
    let v: number | undefined;
    let value: number | undefined;
    if (Array.isArray(entry)) {
      [u, v, value] = [num(entry[0]), num(entry[1]), num(entry[2])];
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      u = num(record.u ?? record.x);
      v = num(record.v ?? record.y);
      for (const field of ['value', 'range', 'depth', 'distance', 'intensity', 'rcs', 'doppler']) {
        value = num(record[field]);
        if (value !== undefined) break;
      }
    }
    if (u !== undefined && v !== undefined) {
      points.push({ u, v, ...(value !== undefined ? { value } : {}) });
    }
  }
  return points;
};

/** A dataset item as the frame a task shows. */
const toFrame = (item: datasets.DatasetItem): ITaskFrame => ({
  fileId: item.fileId!,
  path: item.path,
  stem: item.stem,
  ...(item.width !== undefined ? { width: item.width } : {}),
  ...(item.height !== undefined ? { height: item.height } : {})
});

const itemsOf = (datasetId: string, sensor: IJobSensor): Promise<datasets.DatasetItem[]> =>
  datasets.listItems(datasetId, {
    group: sensor.group,
    kind: sensor.kind === 'points' ? 'json' : 'image',
    ...(sensor.variant ? { variant: sensor.variant } : { noVariant: true })
  });

/** The overlay sensors' files and points, indexed by sensor then stem. */
const loadSensors = async (job: ILabelJob, datasetId: string): Promise<SensorFiles> => {
  const files: SensorFiles = new Map();
  for (const sensor of job.sensors.filter((candidate) => candidate.key !== 'camera')) {
    const byStem = new Map<string, ITaskSensor>();
    for (const item of await itemsOf(datasetId, sensor)) {
      if (sensor.kind === 'points') {
        const points = toPoints(item.data);
        if (points) byStem.set(item.stem, { key: sensor.key, kind: 'points', points });
      } else if (item.fileId) {
        byStem.set(item.stem, { key: sensor.key, kind: 'image', fileId: item.fileId });
      }
    }
    files.set(sensor.key, byStem);
  }
  return files;
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

export interface MaterializeResult {
  tasks: number;
  missing: string[];
  /** frames that have a file for each overlay sensor — a sensor registered with fewer is a mapping worth a look */
  sensors: Record<string, number>;
}

/**
 * Build the job's immutable task set from its dataset. Draft-only; re-running
 * replaces the previous set. Manifest rows (the dataset's, or posted inline) or
 * a seeded sample over the dataset's frames.
 *
 * Each task copies what it shows — file ids, sizes, a point sensor's points — so
 * labeling never has to ask dataset-service for anything; the job's hold on the
 * dataset keeps those files in place.
 */
export const materializeTasks = async (job: ILabelJob, body: MaterializeBody): Promise<MaterializeResult> => {
  if (job.lifecycle) throw new ConflictError('Job creation or deletion is still running');
  if (job.status !== 'draft') {
    throw new ConflictError('Tasks can only be materialized while the job is a draft');
  }
  if (!job.datasetId) {
    throw new ConflictError('Job has no dataset');
  }
  const camera = job.sensors.find((sensor) => sensor.key === 'camera');
  if (!camera) {
    throw new ConflictError('Job has no camera sensor');
  }
  const dataset = await datasets.getDataset(job.datasetId);
  const groupNames = new Set(dataset.groups.map((group) => group.name));
  const absent = job.sensors.filter((sensor) => !groupNames.has(sensor.group));
  if (absent.length > 0) {
    throw new BadRequestError(`The dataset has no image group "${absent[0].group}" (${absent[0].key})`);
  }

  const [frameItems, sensorFiles] = await Promise.all([itemsOf(job.datasetId, camera), loadSensors(job, job.datasetId)]);
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
    const all: ResolvedRow[] = frames.map((frame) => ({ frame }));
    rows = body.sampleN ? seededSample(all, body.sampleN, body.seed ?? 42) : all;
    if (rows.length === 0) {
      throw new BadRequestError(`The dataset has no frames in "${camera.group}"`);
    }
  }

  const coverage: Record<string, number> = {};
  const tasks = rows.map((row, order) => {
    const sensors: ITaskSensor[] = [];
    for (const [key, byStem] of sensorFiles) {
      const sensor = byStem.get(row.frame.stem);
      if (sensor) {
        sensors.push(sensor);
        coverage[key] = (coverage[key] || 0) + 1;
      }
    }
    return {
      jobId: job._id as Types.ObjectId,
      frame: row.frame,
      order,
      ...(row.stratum ? { stratum: row.stratum } : {}),
      ...(sensors.length ? { sensors } : {})
    };
  });
  const selection = {
    kind: body.kind,
    spec:
      body.kind === 'manifest'
        ? { source: body.content ? 'inline' : 'dataset', rows: rows.length, missing: missing.length }
        : { sampleN: body.sampleN ?? null, seed: body.seed ?? 42, rows: rows.length }
  };
  const generation = await beginTaskSet(job);
  try {
    for (let offset = 0; offset < tasks.length; offset += TASK_BATCH_SIZE) {
      await renewTaskSet(job, generation);
      await LabelTask.insertMany(tasks.slice(offset, offset + TASK_BATCH_SIZE).map((task) => ({ ...task, generation })));
    }
    await publishTaskSet(job, generation, rows.length, selection);
  } catch (error) {
    try {
      await abandonTaskSet(job, generation);
    } catch (cleanupError) {
      logger.warn('Could not release task materialization; recovery will retry', { jobId: job._id.toString(), error: (cleanupError as Error).message });
    }
    throw error;
  }

  return {
    tasks: rows.length,
    missing,
    sensors: Object.fromEntries(job.sensors.filter((sensor) => sensor.key !== 'camera').map((sensor) => [sensor.key, coverage[sensor.key] || 0]))
  };
};
