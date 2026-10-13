import { randomUUID } from 'node:crypto';
import { BadRequestError, UserPayload, logger } from '@visin/backend-core';
import { ILabelJob, IJobClass } from '../models/LabelJob';
import { LabelTask, ILabelTask } from '../models/LabelTask';
import { LabelAnnotation, IAnnotationMask, IBoxObject } from '../models/LabelAnnotation';
import { LabelJob } from '../models/LabelJob';
import { LabelSuggestion } from '../models/LabelSuggestion';
import * as files from '../clients/fileServiceClient';
import { detectFormat, getFormat } from '../formats';
import type { ImportedFrame, ImportedLabels, ImportSource } from '../formats';
import { countPixels } from '../utils/mask';
import { encodeGrayscalePng } from '../utils/png';
import { openZip } from '../utils/zip';
import type { FormatId, ImportQuery } from '../validation/jobSchemas';
import { buildClasses } from './jobService';
import { clampBox, maybeCompleteJob, recordTaskCompletion } from './taskService';

export interface ClassPlan {
  /** the class as the file names it */
  name: string;
  boxes: number;
  /** frames whose mask paints this class */
  maskFrames: number;
  /** a job class key, `"+"` to add it as a new class, or null to leave its labels out */
  target: string | null;
  /** true when the name matched a job class by itself, false when the caller chose */
  matched: boolean;
}

export interface ImportReport {
  format: FormatId;
  formatName: string;
  dryRun: boolean;
  as: 'suggestions' | 'done';
  frames: { inFile: number; matched: number; unmatched: number; unmatchedSample: string[] };
  classes: ClassPlan[];
  /** boxes and masks that will be (or were) kept, after class choices and what each class takes */
  boxes: number;
  maskFrames: number;
  /** keys of the classes the import added to the job */
  createdClasses: string[];
  warnings: string[];
}

/** Archives often wrap everything in one folder, and macOS adds `__MACOSX`; neither is part of the format. */
export const normalizeNames = (names: string[]): { names: string[]; strip: string } => {
  const kept = names.filter((name) => !name.endsWith('/') && !name.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(name));
  const roots = new Set(kept.map((name) => (name.includes('/') ? name.slice(0, name.indexOf('/') + 1) : '')));
  const strip = roots.size === 1 && !roots.has('') ? [...roots][0] : '';
  return { names: kept.map((name) => name.slice(strip.length)), strip };
};

const similar = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The job class an imported class name belongs to when nobody said otherwise. */
const autoMatch = (classes: IJobClass[], name: string): IJobClass | undefined =>
  classes.find((entry) => similar(entry.name, name) || similar(entry.key, name) || (entry.modelClass && similar(entry.modelClass, name)));

const planClasses = (job: ILabelJob, labels: ImportedLabels, classMap: Record<string, string | null>): ClassPlan[] => {
  const plans = new Map<string, ClassPlan>();
  labels.classes.forEach((name) => {
    if (name) plans.set(name, { name, boxes: 0, maskFrames: 0, target: null, matched: false });
  });
  for (const frame of labels.frames) {
    for (const box of frame.boxes) {
      const plan = plans.get(box.className) || { name: box.className, boxes: 0, maskFrames: 0, target: null, matched: false };
      plan.boxes += 1;
      plans.set(box.className, plan);
    }
    if (frame.mask) {
      const present = new Set(frame.mask.data);
      labels.classes.forEach((name, i) => {
        if (name && present.has(i + 1)) plans.get(name)!.maskFrames += 1;
      });
    }
  }
  for (const plan of plans.values()) {
    if (Object.prototype.hasOwnProperty.call(classMap, plan.name)) {
      const chosen = classMap[plan.name];
      if (chosen !== null && chosen !== '+' && !job.classes.some((entry) => entry.key === chosen)) {
        throw new BadRequestError(`"${chosen}" is not a class of this job`);
      }
      plan.target = chosen;
    } else {
      const found = autoMatch(job.classes, plan.name);
      plan.target = found ? found.key : null;
      plan.matched = Boolean(found);
    }
  }
  // Classes the file declares but nothing uses are not worth a row in the report.
  return [...plans.values()].filter((plan) => plan.boxes > 0 || plan.maskFrames > 0);
};

const remapMask = (frame: ImportedFrame, lut: Uint8Array): { width: number; height: number; data: Uint8Array } | undefined => {
  if (!frame.mask) return undefined;
  const data = new Uint8Array(frame.mask.data.length);
  let any = false;
  for (let i = 0; i < data.length; i++) {
    const mapped = lut[frame.mask.data[i]];
    data[i] = mapped;
    if (mapped) any = true;
  }
  return any ? { width: frame.mask.width, height: frame.mask.height, data } : undefined;
};

const storeMask = async (
  job: ILabelJob,
  folder: 'masks' | 'suggestions',
  task: ILabelTask,
  mask: { width: number; height: number; data: Uint8Array }
): Promise<IAnnotationMask> => {
  const fileId = `${files.jobFolder(job._id.toString())}${folder}/${task._id}-${randomUUID()}.png`;
  await files.putFile(fileId, encodeGrayscalePng(mask.width, mask.height, mask.data));
  return { fileId, width: mask.width, height: mask.height, pixels: countPixels(mask.data) };
};

const dropFile = (fileId?: string): void => {
  if (!fileId) return;
  files.deleteFile(fileId).catch((error: Error) => {
    logger.warn('Could not remove a replaced label file', { fileId, error: error.message });
  });
};

/**
 * Read an uploaded labels archive and bring its labels into the job.
 *
 * The archive's format is detected (or named by the caller), its classes are
 * matched to the job's by name, and every label whose frame is in the job and
 * whose class has a target is stored — as a suggestion an annotator confirms, or
 * as finished labels. `dryRun` does everything but store, so the dialog can show
 * what would happen before it does.
 *
 * Frames are matched by file stem. Labels for a frame the job does not contain
 * are counted and listed, not an error: an archive routinely covers more of the
 * dataset than the job does.
 */
export const importLabels = async (
  job: ILabelJob,
  user: UserPayload,
  archivePath: string,
  query: ImportQuery
): Promise<ImportReport> => {
  const archive = await openZip(archivePath);
  try {
    const { names, strip } = normalizeNames(archive.entries.map((entry) => entry.name));
    const entryOf = new Map(archive.entries.map((entry) => [entry.name.slice(strip.length), entry]));
    const source: ImportSource = {
      names,
      read: async (name) => {
        const entry = entryOf.get(name);
        if (!entry) throw new BadRequestError(`"${name}" is not in the archive`);
        return archive.read(entry);
      }
    };

    const format = query.format ? getFormat(query.format) : await detectFormat(source);
    if (!format) {
      throw new BadRequestError(
        'Could not recognise these labels. Supported: YOLO, COCO, Pascal VOC, semantic PNG and Visin bundles.'
      );
    }

    const tasks = await LabelTask.find({ jobId: job._id }).sort({ order: 1 });
    const taskByStem = new Map(tasks.map((task) => [task.frame.stem, task]));
    const labels = await format.parse(source, {
      sizeOf: (stem) => {
        const frame = taskByStem.get(stem)?.frame;
        return frame?.width && frame.height ? { width: frame.width, height: frame.height } : undefined;
      }
    });
    // A frame the job does not have is reported, not silently lost: the readers
    // that need a frame's size hand those back as `unsized`.
    const matchedFrames = labels.frames.filter((frame) => taskByStem.has(frame.stem));
    const unmatched = [
      ...labels.frames.filter((frame) => !taskByStem.has(frame.stem)).map((frame) => frame.stem),
      ...(labels.unsized ?? [])
    ];

    const plans = planClasses(job, { ...labels, frames: matchedFrames }, query.classMap);
    const report: ImportReport = {
      format: format.id,
      formatName: format.name,
      dryRun: query.dryRun === 'true',
      as: query.as,
      frames: {
        inFile: labels.frames.length + (labels.unsized?.length ?? 0),
        matched: matchedFrames.length,
        unmatched: unmatched.length,
        unmatchedSample: unmatched.slice(0, 10)
      },
      classes: plans,
      boxes: 0,
      maskFrames: 0,
      createdClasses: [],
      warnings: labels.warnings.slice(0, 50)
    };

    // Add the classes the caller asked to create, then everything below can
    // refer to them by key like any other.
    const created = plans.filter((plan) => plan.target === '+');
    let classes = job.classes;
    if (!report.dryRun && created.length > 0) {
      const added = buildClasses(
        created.map((plan) => ({ name: plan.name, tools: ['box', 'mask'] as ('box' | 'mask')[] })),
        job.classes
      );
      await LabelJob.updateOne({ _id: job._id }, { $push: { classes: { $each: added } } });
      classes = [...job.classes, ...added];
      added.forEach((entry, i) => {
        created[i].target = entry.key;
        report.createdClasses.push(entry.key);
      });
    }
    const classOf = new Map(classes.map((entry) => [entry.key, entry]));
    // Only a dry run still has a class waiting to be created; it counts as one
    // that takes boxes and masks, which is what a created class is.
    const WILL_BE_CREATED: IJobClass = { key: '+', name: '', color: '', tools: ['box', 'mask'], maskIndex: 255 };
    const targetOf = (name: string): IJobClass | undefined => {
      const plan = plans.find((candidate) => candidate.name === name);
      if (!plan?.target) return undefined;
      return plan.target === '+' ? WILL_BE_CREATED : classOf.get(plan.target);
    };

    // Mask values → this job's mask indexes, only for classes that take a mask.
    const lut = new Uint8Array(256);
    labels.classes.forEach((name, i) => {
      const target = name ? targetOf(name) : undefined;
      if (target?.tools.includes('mask')) lut[i + 1] = target.maskIndex;
    });

    let newlyDone = 0;
    for (const frame of matchedFrames) {
      const task = taskByStem.get(frame.stem)!;
      const objects: IBoxObject[] = [];
      for (const box of frame.boxes) {
        const target = targetOf(box.className);
        if (!target?.tools.includes('box')) continue;
        const bbox = clampBox(box.bbox, task.frame.width, task.frame.height);
        if (!bbox) continue;
        objects.push({
          id: randomUUID(),
          classKey: target.key,
          bbox,
          source: 'import',
          ...(box.score !== undefined ? { score: box.score } : {})
        });
      }

      let mask = remapMask(frame, lut);
      if (mask && task.frame.width !== undefined && task.frame.height !== undefined) {
        if (mask.width !== task.frame.width || mask.height !== task.frame.height) {
          report.warnings.push(`${frame.stem}: mask is ${mask.width}×${mask.height}, the frame is ${task.frame.width}×${task.frame.height}`);
          mask = undefined;
        }
      }
      // What is actually kept: a box of a class that takes masks only is not.
      report.boxes += objects.length;
      if (mask) report.maskFrames += 1;
      if (report.dryRun || (objects.length === 0 && !mask && !(query.as === 'done' && frame.negative))) continue;

      if (query.as === 'suggestions') {
        const previous = await LabelSuggestion.findOne({ taskId: task._id, source: 'import' });
        const stored = mask ? await storeMask(job, 'suggestions', task, mask) : undefined;
        await LabelSuggestion.findOneAndUpdate(
          { taskId: task._id, source: 'import' },
          { $set: { jobId: job._id, objects, ...(stored ? { mask: stored } : {}) }, ...(stored ? {} : { $unset: { mask: '' } }) },
          { upsert: true }
        );
        dropFile(previous?.mask?.fileId);
      } else {
        const stored = mask ? await storeMask(job, 'masks', task, mask) : undefined;
        const previous = await LabelAnnotation.findOneAndUpdate(
          { taskId: task._id, userId: user.id },
          {
            $set: {
              jobId: job._id,
              userEmail: (user.email || '').toLowerCase(),
              ...(user.name ? { userName: user.name } : {}),
              status: 'done',
              doneAt: new Date(),
              objects,
              ...(stored ? { mask: stored } : {})
            },
            ...(stored ? {} : { $unset: { mask: '' } })
          },
          { upsert: true, returnDocument: 'before' }
        );
        dropFile(previous?.mask?.fileId);
        const first = await recordTaskCompletion(task._id, user.id);
        if (first) newlyDone += 1;
      }
    }
    if (newlyDone > 0 && job.status === 'active') {
      await maybeCompleteJob(job);
    }
    return report;
  } finally {
    await archive.close();
  }
};
