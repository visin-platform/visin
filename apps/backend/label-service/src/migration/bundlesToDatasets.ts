import { Types } from 'mongoose';
import { IMaskMeta } from '../models/LabelTask';

/**
 * One-off migration: label bundles become dataset-service datasets.
 *
 * Pure and offline — it takes documents read out of a backup and returns the
 * documents to load, so it can be checked against the real data before anything
 * is written. Nothing on file-service moves: every image keeps the `fileId` it
 * already has, and the dataset records that prefix as its own.
 *
 * What labeling must not lose is spelled out in the checks below: every answer
 * keeps its task, every task keeps its order, its counters and its masks, and
 * every task image resolves to the same stored file it does today.
 *
 * Delete this module, its CLI and its tests once the migration has run.
 */

export const FRAMES_GROUP = 'frames';
export const IDS_VARIANT = 'ids';
export const MASKS_VARIANT = 'masks';

type Id = Types.ObjectId | string;

export interface BundleDoc {
  _id: Id;
  name: string;
  description?: string;
  groupId: string;
  createdBy: { userId: string; email: string; name?: string };
  annotationSets?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LabelImageDoc {
  _id: Id;
  bundleId: Id;
  path: string;
  stem: string;
  kind: 'frame' | 'layer' | 'idmap';
  annotationSet?: string;
  fileId: string;
  thumbnailFileId?: string;
  width?: number;
  height?: number;
  size: number;
  mimetype: string;
  metadata?: { masks?: IMaskMeta[] };
}

export interface ImportJobDoc {
  _id: Id;
  bundleId: Id;
  zipFileId: string;
  status: string;
  finishedAt?: Date;
}

export interface JobDoc {
  _id: Id;
  bundleId?: Id;
  [key: string]: unknown;
}

export interface TaskDoc {
  _id: Id;
  jobId: Id;
  labelImageId: Id;
  order: number;
  stratum?: string;
  answersCount?: number;
  answeredBy?: string[];
  payload?: {
    layers?: { set: string; imageId: Id }[];
    maskMap?: { imageId: Id; masks: IMaskMeta[] };
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AnswerDoc {
  _id: Id;
  taskId: Id;
  jobId: Id;
  userId: string;
  [key: string]: unknown;
}

export interface BackupData {
  bundles: BundleDoc[];
  images: LabelImageDoc[];
  imports: ImportJobDoc[];
  jobs: JobDoc[];
  tasks: TaskDoc[];
  answers: AnswerDoc[];
}

export interface MigrationReport {
  datasets: number;
  datasetItems: { images: number; json: number };
  jobs: number;
  tasks: number;
  answers: number;
  /** per job: what must still be true after the load */
  perJob: { jobId: string; datasetId?: string; tasks: number; answers: number; answersCountDistribution: Record<string, number> }[];
  /** inconsistencies that are not fatal but an operator should see */
  warnings: string[];
}

export interface MigrationResult {
  datasets: Record<string, unknown>[];
  dataset_items: Record<string, unknown>[];
  label_jobs: Record<string, unknown>[];
  label_tasks: Record<string, unknown>[];
  label_answers: Record<string, unknown>[];
  report: MigrationReport;
}

const key = (id: Id): string => String(id);

/** `annotations/verify/0001.ids.png` → `annotations/verify/0001.masks.json`. */
const masksPathFor = (idmapPath: string): string =>
  idmapPath.endsWith('.ids.png') ? `${idmapPath.slice(0, -'.ids.png'.length)}.masks.json` : `${idmapPath}.masks.json`;

const groupOf = (image: LabelImageDoc): string => (image.kind === 'frame' ? FRAMES_GROUP : image.annotationSet || FRAMES_GROUP);

const bail = (message: string, offenders: string[]): never => {
  throw new Error(`${message}: ${offenders.slice(0, 5).join(', ')}${offenders.length > 5 ? ` (+${offenders.length - 5} more)` : ''}`);
};

export const migrateBundlesToDatasets = (backup: BackupData): MigrationResult => {
  const imagesById = new Map(backup.images.map((image) => [key(image._id), image]));
  const bundlesById = new Map(backup.bundles.map((bundle) => [key(bundle._id), bundle]));
  const jobIds = new Set(backup.jobs.map((job) => key(job._id)));
  const taskIds = new Set(backup.tasks.map((task) => key(task._id)));
  const warnings: string[] = [];

  // Check everything before building anything: a partial answer here is worse
  // than a refusal, because the load step would write it.
  const missingImages = backup.tasks.flatMap((task) =>
    [task.labelImageId, ...(task.payload?.layers?.map((layer) => layer.imageId) || []), ...(task.payload?.maskMap ? [task.payload.maskMap.imageId] : [])]
      .filter((id) => !imagesById.has(key(id)))
      .map((id) => `task ${key(task._id)} → image ${key(id)}`)
  );
  if (missingImages.length > 0) bail('Tasks reference images that are not in the backup', missingImages);

  const orphanTasks = backup.tasks.filter((task) => !jobIds.has(key(task.jobId))).map((task) => key(task._id));
  if (orphanTasks.length > 0) bail('Tasks belong to jobs that are not in the backup', orphanTasks);

  const orphanAnswers = backup.answers.filter((answer) => !taskIds.has(key(answer.taskId))).map((answer) => key(answer._id));
  if (orphanAnswers.length > 0) bail('Answers belong to tasks that are not in the backup', orphanAnswers);

  const answersByTask = new Map<string, AnswerDoc[]>();
  for (const answer of backup.answers) {
    answersByTask.set(key(answer.taskId), [...(answersByTask.get(key(answer.taskId)) || []), answer]);
  }
  for (const task of backup.tasks) {
    const answers = answersByTask.get(key(task._id)) || [];
    if ((task.answersCount ?? 0) !== answers.length) {
      warnings.push(`task ${key(task._id)} counts ${task.answersCount ?? 0} answers but ${answers.length} exist`);
    }
    const answered = new Set(answers.map((answer) => answer.userId));
    const recorded = new Set(task.answeredBy || []);
    if (answered.size !== recorded.size || [...answered].some((userId) => !recorded.has(userId))) {
      warnings.push(`task ${key(task._id)} lists different labelers than its answers do`);
    }
  }

  // One dataset per bundle, over the files the bundle already has.
  const lastImport = new Map<string, ImportJobDoc>();
  for (const importJob of backup.imports) {
    if (importJob.status !== 'done') continue;
    const current = lastImport.get(key(importJob.bundleId));
    if (!current || (importJob.finishedAt ?? 0) > (current.finishedAt ?? 0)) lastImport.set(key(importJob.bundleId), importJob);
  }

  const dataset_items: Record<string, unknown>[] = [];
  const datasets = backup.bundles.map((bundle) => {
    const bundleImages = backup.images.filter((image) => key(image.bundleId) === key(bundle._id));
    const groups = new Map<string, { name: string; images: number; jsons: number }>();

    for (const image of bundleImages) {
      const group = groupOf(image);
      const counts = groups.get(group) || { name: group, images: 0, jsons: 0 };
      counts.images += 1;
      groups.set(group, counts);
      dataset_items.push({
        _id: image._id,
        datasetId: bundle._id,
        group,
        path: image.path,
        stem: image.stem,
        ...(image.kind === 'idmap' ? { variant: IDS_VARIANT } : {}),
        kind: 'image',
        fileId: image.fileId,
        ...(image.thumbnailFileId ? { thumbnailFileId: image.thumbnailFileId } : {}),
        ...(image.width !== undefined ? { width: image.width } : {}),
        ...(image.height !== undefined ? { height: image.height } : {}),
        size: image.size,
        mimetype: image.mimetype
      });

      // An id map's masks were metadata on the image; as a dataset they are the
      // JSON sidecar the zip shipped, which is what a mask job reads.
      const masks = image.kind === 'idmap' ? image.metadata?.masks : undefined;
      if (masks) {
        const counts = groups.get(group)!;
        counts.jsons += 1;
        dataset_items.push({
          _id: new Types.ObjectId(),
          datasetId: bundle._id,
          group,
          path: masksPathFor(image.path),
          stem: image.stem,
          variant: MASKS_VARIANT,
          kind: 'json',
          size: Buffer.byteLength(JSON.stringify(masks)),
          data: masks
        });
      }
    }

    const cover = bundleImages.find((image) => image.kind === 'frame');
    const archive = lastImport.get(key(bundle._id));
    const now = new Date();
    return {
      _id: bundle._id,
      ownerId: bundle.createdBy.userId,
      name: bundle.name,
      ...(bundle.description ? { description: bundle.description } : {}),
      visibility: 'group',
      groupId: bundle.groupId,
      // The files stay where label-service put them; this is what says so.
      storagePrefix: `label-bundles/${key(bundle._id)}/`,
      ...(archive
        ? {
            archive: {
              fileId: archive.zipFileId,
              filename: archive.zipFileId.slice(archive.zipFileId.lastIndexOf('/') + 1),
              // Size and contents are unknown until the zip is scanned in the app.
              uploadedAt: archive.finishedAt ?? bundle.createdAt ?? now
            }
          }
        : {}),
      groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
      imageCount: bundleImages.length,
      ...(cover?.thumbnailFileId || cover?.fileId ? { coverFileId: cover.thumbnailFileId || cover.fileId } : {}),
      holds: backup.jobs
        .filter((job) => job.bundleId && key(job.bundleId) === key(bundle._id))
        .map((job) => ({ service: 'label-service', ref: key(job._id), createdAt: now })),
      createdAt: bundle.createdAt ?? now,
      updatedAt: bundle.updatedAt ?? now
    };
  });

  const label_jobs = backup.jobs.map((job) => {
    const { bundleId, ...rest } = job;
    if (bundleId && !bundlesById.has(key(bundleId))) {
      warnings.push(`job ${key(job._id)} references bundle ${key(bundleId)}, which is not in the backup`);
    }
    return {
      ...rest,
      ...(bundleId ? { datasetId: key(bundleId), framesGroup: FRAMES_GROUP } : {})
    };
  });

  // Each task keeps its id, order, counters and masks, and carries the files it
  // shows instead of pointing at image records that are about to go away.
  const label_tasks = backup.tasks.map((task) => {
    const frame = imagesById.get(key(task.labelImageId))!;
    const layers = (task.payload?.layers || []).map((layer) => ({
      set: layer.set,
      fileId: imagesById.get(key(layer.imageId))!.fileId
    }));
    const maskMap = task.payload?.maskMap
      ? { fileId: imagesById.get(key(task.payload.maskMap.imageId))!.fileId, masks: task.payload.maskMap.masks }
      : undefined;
    const payload = layers.length > 0 || maskMap ? { ...(layers.length ? { layers } : {}), ...(maskMap ? { maskMap } : {}) } : undefined;
    return {
      _id: task._id,
      jobId: task.jobId,
      frame: {
        fileId: frame.fileId,
        path: frame.path,
        stem: frame.stem,
        ...(frame.width !== undefined ? { width: frame.width } : {}),
        ...(frame.height !== undefined ? { height: frame.height } : {})
      },
      order: task.order,
      ...(task.stratum ? { stratum: task.stratum } : {}),
      ...(payload ? { payload } : {}),
      answersCount: task.answersCount ?? 0,
      answeredBy: task.answeredBy ?? [],
      ...(task.createdAt ? { createdAt: task.createdAt } : {}),
      ...(task.updatedAt ? { updatedAt: task.updatedAt } : {})
    };
  });

  const perJob = backup.jobs.map((job) => {
    const tasks = backup.tasks.filter((task) => key(task.jobId) === key(job._id));
    const distribution: Record<string, number> = {};
    for (const task of tasks) distribution[String(task.answersCount ?? 0)] = (distribution[String(task.answersCount ?? 0)] ?? 0) + 1;
    return {
      jobId: key(job._id),
      ...(job.bundleId ? { datasetId: key(job.bundleId) } : {}),
      tasks: tasks.length,
      answers: backup.answers.filter((answer) => key(answer.jobId) === key(job._id)).length,
      answersCountDistribution: distribution
    };
  });

  return {
    datasets,
    dataset_items,
    label_jobs,
    label_tasks,
    // Answers are copied exactly: they are the labeling work itself.
    label_answers: backup.answers.map((answer) => ({ ...answer })),
    report: {
      datasets: datasets.length,
      datasetItems: {
        images: dataset_items.filter((item) => item.kind === 'image').length,
        json: dataset_items.filter((item) => item.kind === 'json').length
      },
      jobs: label_jobs.length,
      tasks: label_tasks.length,
      answers: backup.answers.length,
      perJob,
      warnings
    }
  };
};
