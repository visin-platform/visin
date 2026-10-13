import { ILabelJob } from '../models/LabelJob';
import { LabelTask } from '../models/LabelTask';
import { LabelAnnotation } from '../models/LabelAnnotation';
import * as datasets from '../clients/datasetServiceClient';

export interface JobStats {
  tasks: number;
  /** tasks that reached the job's redundancy */
  completed: number;
  done: number;
  skipped: number;
  /** boxes on finished frames */
  objects: number;
  perUser: { userEmail: string; userName?: string; done: number; skipped: number }[];
  perClass: { classKey: string; name: string; boxes: number; pixels: number }[];
  perStratum: { stratum: string; tasks: number; completed: number }[];
}

/** Progress, who did how much, and how much of each class has been drawn. */
export const jobStats = async (job: ILabelJob): Promise<JobStats> => {
  const [tasks, annotations] = await Promise.all([
    LabelTask.find({ jobId: job._id }, { stratum: 1, answersCount: 1 }).lean(),
    LabelAnnotation.find(
      { jobId: job._id, status: { $in: ['done', 'skipped'] } },
      { userId: 1, userEmail: 1, userName: 1, status: 1, 'objects.classKey': 1, 'mask.pixels': 1 }
    ).lean()
  ]);

  const perStratumCounts = new Map<string, { stratum: string; tasks: number; completed: number }>();
  let completed = 0;
  for (const task of tasks) {
    const isCompleted = task.answersCount >= job.redundancy;
    if (isCompleted) completed += 1;
    const stratum = task.stratum || '(none)';
    const entry = perStratumCounts.get(stratum) || { stratum, tasks: 0, completed: 0 };
    entry.tasks += 1;
    if (isCompleted) entry.completed += 1;
    perStratumCounts.set(stratum, entry);
  }

  const perUserCounts = new Map<string, JobStats['perUser'][number]>();
  const classes = new Map(job.classes.map((entry) => [entry.key, { classKey: entry.key, name: entry.name, boxes: 0, pixels: 0 }]));
  const keyByIndex = new Map(job.classes.map((entry) => [String(entry.maskIndex), entry.key]));
  let done = 0;
  let skipped = 0;
  let objects = 0;
  for (const annotation of annotations) {
    const user = perUserCounts.get(annotation.userId) || {
      userEmail: annotation.userEmail,
      userName: annotation.userName,
      done: 0,
      skipped: 0
    };
    if (annotation.status === 'skipped') {
      skipped += 1;
      user.skipped += 1;
    } else {
      done += 1;
      user.done += 1;
      for (const object of annotation.objects || []) {
        objects += 1;
        const entry = classes.get(object.classKey);
        if (entry) entry.boxes += 1;
      }
      for (const [index, count] of Object.entries((annotation.mask?.pixels as Record<string, number>) || {})) {
        const entry = classes.get(keyByIndex.get(index) || '');
        if (entry) entry.pixels += count;
      }
    }
    perUserCounts.set(annotation.userId, user);
  }

  return {
    tasks: tasks.length,
    completed,
    done,
    skipped,
    objects,
    perUser: [...perUserCounts.values()].sort((a, b) => b.done - a.done),
    perClass: [...classes.values()],
    perStratum: [...perStratumCounts.values()].sort((a, b) => a.stratum.localeCompare(b.stratum))
  };
};

export interface JobManifest {
  job: Record<string, unknown>;
  dataset: Record<string, unknown> | null;
  selection: Record<string, unknown> | null;
  progress: { tasks: number; completed: number; done: number; skipped: number };
}

/**
 * Everything about *how* a job's labels came to be, as one JSON document: the
 * classes and their mask values, the sensors, which dataset, how the frames were
 * chosen and how far along it is. Labels without it cannot be read back — a mask
 * value means nothing without the class list it was written under.
 */
export const exportManifest = async (job: ILabelJob): Promise<JobManifest> => {
  const [dataset, stats] = await Promise.all([
    job.datasetId ? datasets.getDataset(job.datasetId) : Promise.resolve(null),
    jobStats(job)
  ]);

  return {
    job: {
      id: job._id.toString(),
      name: job.name,
      description: job.description,
      taskType: job.taskType,
      classes: job.classes,
      sensors: job.sensors,
      redundancy: job.redundancy,
      status: job.status,
      tasksCount: job.tasksCount,
      createdBy: job.createdBy?.email,
      createdAt: job.createdAt?.toISOString()
    },
    dataset: dataset
      ? { id: dataset._id, name: dataset.name, description: dataset.description, groups: dataset.groups }
      : null,
    selection: job.selection ? { kind: job.selection.kind, spec: job.selection.spec } : null,
    progress: { tasks: stats.tasks, completed: stats.completed, done: stats.done, skipped: stats.skipped }
  };
};
