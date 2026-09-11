import { ILabelJob } from '../models/LabelJob';
import { LabelTask, ILabelTask } from '../models/LabelTask';
import { LabelAnswer, ILabelAnswer } from '../models/LabelAnswer';
import { LabelImage, IMaskMeta } from '../models/LabelImage';
import { LabelBundle } from '../models/LabelBundle';
import { maskFields } from './bundleService';

interface TaskContext {
  task: ILabelTask;
  framePath: string;
  answers: ILabelAnswer[];
}

/**
 * Mask metadata keys that already have a column of their own.
 *
 * Everything else a bundle shipped in `<stem>.masks.json` rides along verbatim.
 * An uploader puts its provenance there — which pipeline run produced a mask,
 * what each automated agent decided about it, which stratum it was drawn from —
 * and an export that dropped it would force every consumer to keep the original
 * bundle beside the export and re-join the two by hand.
 */
const MASK_OWN_COLUMNS = new Set(['id', 'class']);

/** Extra mask columns, as `mask_<field>`; prefixed because a bundle is free to
 *  name a mask field `stratum` or `frame`, which are task-level columns here. */
const maskExtras = (mask: IMaskMeta): Record<string, unknown> => {
  const extras: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(mask)) {
    if (!MASK_OWN_COLUMNS.has(field) && value !== undefined) {
      extras[`mask_${field}`] = value;
    }
  }
  return extras;
};

const loadJobData = async (job: ILabelJob): Promise<TaskContext[]> => {
  const [tasks, answers] = await Promise.all([
    LabelTask.find({ jobId: job._id }).sort({ order: 1 }),
    LabelAnswer.find({ jobId: job._id })
  ]);
  const frames = await LabelImage.find({ _id: { $in: tasks.map((task) => task.labelImageId) } });
  const framePaths = new Map(frames.map((frame) => [frame._id.toString(), frame.path]));
  const answersByTask = new Map<string, ILabelAnswer[]>();
  for (const answer of answers) {
    const key = answer.taskId.toString();
    answersByTask.set(key, [...(answersByTask.get(key) || []), answer]);
  }
  return tasks.map((task) => ({
    task,
    framePath: framePaths.get(task.labelImageId.toString()) || '(missing)',
    answers: answersByTask.get(task._id.toString()) || []
  }));
};

const majority = <T>(values: T[]): T | null => {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null; // tie
  return sorted[0][0];
};

const maskVerdict = (answer: ILabelAnswer, maskId: number): 'correct' | 'incorrect' =>
  (answer.rejectedMaskIds || []).includes(maskId) ? 'incorrect' : 'correct';

/** When the labeler submitted, and how long they took — both are quality signals
 *  offline (a 40-mask frame answered in three seconds is a rubber stamp). */
const answerTiming = (answer: ILabelAnswer) => ({
  elapsedMs: answer.elapsedMs,
  answeredAt: answer.createdAt?.toISOString()
});

/** One JSON object per task (single_choice) or per mask (mask_toggle). */
export const exportRows = async (job: ILabelJob): Promise<Record<string, unknown>[]> => {
  const contexts = await loadJobData(job);
  const rows: Record<string, unknown>[] = [];

  for (const { task, framePath, answers } of contexts) {
    const base = {
      taskId: task._id.toString(),
      frame: framePath,
      ...(task.stratum ? { stratum: task.stratum } : {})
    };

    if (job.taskType === 'single_choice') {
      rows.push({
        ...base,
        answers: answers.map((answer) => ({
          userEmail: answer.userEmail,
          userName: answer.userName,
          choiceKey: answer.choiceKey,
          ...answerTiming(answer)
        })),
        consensus: majority(answers.map((answer) => answer.choiceKey))
      });
      continue;
    }

    for (const mask of task.payload?.maskMap?.masks || []) {
      rows.push({
        ...base,
        maskId: mask.id,
        class: mask.class,
        // The bundle's own metadata for this mask, nested rather than spread so
        // a field named `frame` or `stratum` cannot shadow the task's.
        mask,
        verdicts: answers.map((answer) => ({
          userEmail: answer.userEmail,
          userName: answer.userName,
          verdict: maskVerdict(answer, mask.id),
          ...answerTiming(answer)
        })),
        consensus: majority(answers.map((answer) => maskVerdict(answer, mask.id)))
      });
    }
  }
  return rows;
};

const csvEscape = (value: unknown): string => {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Render rows to CSV under a fixed leading column order, with any further keys
 * appended in sorted order.
 *
 * The leading columns are the ones consumers already parse, so they keep their
 * names and their positions; mask metadata varies per bundle and lands after
 * them. A key absent from a row writes an empty cell rather than shifting the
 * row, so a bundle whose masks carry different fields per source still exports
 * as one rectangular table.
 */
const toCsv = (rows: Record<string, unknown>[], leading: string[]): string => {
  const extra = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    .filter((key) => !leading.includes(key))
    .sort();
  const columns = [...leading, ...extra];
  return (
    [columns.join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))].join('\n') +
    '\n'
  );
};

/**
 * Long format: one CSV row per user-answer (single_choice) or user-mask-verdict
 * (mask_toggle), plus every field the bundle attached to the mask.
 *
 * A task nobody has answered yet still emits a row, with the answer columns
 * blank. Without it an unanswered task is indistinguishable from a mask that was
 * never in the job, and the export loses its own denominator: a consumer cannot
 * tell 300 masks all judged correct from 300 masks nobody has reached.
 */
export const exportCsv = async (job: ILabelJob): Promise<string> => {
  const contexts = await loadJobData(job);
  const rows: Record<string, unknown>[] = [];

  if (job.taskType === 'single_choice') {
    for (const { task, framePath, answers } of contexts) {
      const base = { taskId: task._id.toString(), frame: framePath, stratum: task.stratum };
      if (answers.length === 0) {
        rows.push(base);
        continue;
      }
      for (const answer of answers) {
        rows.push({
          ...base,
          userEmail: answer.userEmail,
          userName: answer.userName,
          choiceKey: answer.choiceKey,
          ...answerTiming(answer)
        });
      }
    }
    return toCsv(rows, ['taskId', 'frame', 'stratum', 'userEmail', 'choiceKey', 'elapsedMs']);
  }

  for (const { task, framePath, answers } of contexts) {
    for (const mask of task.payload?.maskMap?.masks || []) {
      const base = {
        taskId: task._id.toString(),
        frame: framePath,
        stratum: task.stratum,
        maskId: mask.id,
        class: mask.class,
        ...maskExtras(mask)
      };
      if (answers.length === 0) {
        rows.push(base);
        continue;
      }
      for (const answer of answers) {
        rows.push({
          ...base,
          userEmail: answer.userEmail,
          userName: answer.userName,
          verdict: maskVerdict(answer, mask.id),
          ...answerTiming(answer)
        });
      }
    }
  }
  return toCsv(rows, ['taskId', 'frame', 'stratum', 'maskId', 'class', 'userEmail', 'verdict', 'elapsedMs']);
};


export interface JobStats {
  tasks: number;
  completed: number;
  answers: number;
  perUser: { userEmail: string; userName?: string; answered: number }[];
  perStratum: { stratum: string; tasks: number; completed: number }[];
  agreement: number | null; // mean pairwise observed agreement, K>1 tasks only
}

/** Progress + per-stratum counts + (K>1) mean pairwise observed agreement. */
export const jobStats = async (job: ILabelJob): Promise<JobStats> => {
  const contexts = await loadJobData(job);

  const perUserCounts = new Map<string, { userEmail: string; userName?: string; answered: number }>();
  const perStratumCounts = new Map<string, { stratum: string; tasks: number; completed: number }>();
  let completed = 0;
  let answers = 0;
  const pairAgreements: number[] = [];

  for (const { task, answers: taskAnswers } of contexts) {
    answers += taskAnswers.length;
    const isCompleted = task.answersCount >= job.redundancy;
    if (isCompleted) completed += 1;

    for (const answer of taskAnswers) {
      const entry = perUserCounts.get(answer.userId) || {
        userEmail: answer.userEmail,
        userName: answer.userName,
        answered: 0
      };
      entry.answered += 1;
      perUserCounts.set(answer.userId, entry);
    }

    const stratum = task.stratum || '(none)';
    const stratumEntry = perStratumCounts.get(stratum) || { stratum, tasks: 0, completed: 0 };
    stratumEntry.tasks += 1;
    if (isCompleted) stratumEntry.completed += 1;
    perStratumCounts.set(stratum, stratumEntry);

    // Pairwise agreement across every pair of answers on this task.
    for (let i = 0; i < taskAnswers.length; i++) {
      for (let j = i + 1; j < taskAnswers.length; j++) {
        if (job.taskType === 'single_choice') {
          pairAgreements.push(taskAnswers[i].choiceKey === taskAnswers[j].choiceKey ? 1 : 0);
        } else {
          const masks = task.payload?.maskMap?.masks || [];
          if (masks.length === 0) continue;
          const matching = masks.filter(
            (mask) => maskVerdict(taskAnswers[i], mask.id) === maskVerdict(taskAnswers[j], mask.id)
          ).length;
          pairAgreements.push(matching / masks.length);
        }
      }
    }
  }

  return {
    tasks: contexts.length,
    completed,
    answers,
    perUser: [...perUserCounts.values()].sort((a, b) => b.answered - a.answered),
    perStratum: [...perStratumCounts.values()].sort((a, b) => a.stratum.localeCompare(b.stratum)),
    agreement:
      pairAgreements.length === 0
        ? null
        : pairAgreements.reduce((sum, value) => sum + value, 0) / pairAgreements.length
  };
};

export interface JobManifest {
  job: Record<string, unknown>;
  bundle: Record<string, unknown> | null;
  selection: Record<string, unknown> | null;
  progress: { tasks: number; completed: number; answers: number };
  /** field → value → how many masks the bundle has vs how many this job asks about. */
  masks?: Record<string, Record<string, { bundle: number; job: number }>>;
}

/**
 * Everything about *how* a job's rows came to be, as one JSON document.
 *
 * An export answers "what did the labelers say"; it cannot answer "what does
 * that imply about the corpus" without knowing what the job sampled from. A rate
 * measured on a job scales to the bundle only through the inclusion fraction,
 * and `masks` gives it directly: for every groupable field, how many masks the
 * bundle holds per value against how many this job put in front of a human. A
 * job capped at 200 masks per stratum out of 9,878 is 2% inclusion, and without
 * that number a per-stratum precision extrapolates to nothing.
 *
 * The rest is provenance a result has to be able to cite: the question asked,
 * the redundancy, the sampling seed, which bundle, how far along it is.
 */
export const exportManifest = async (job: ILabelJob): Promise<JobManifest> => {
  const [bundle, stats] = await Promise.all([
    job.bundleId ? LabelBundle.findById(job.bundleId) : Promise.resolve(null),
    jobStats(job)
  ]);

  const manifest: JobManifest = {
    job: {
      id: job._id.toString(),
      name: job.name,
      description: job.description,
      taskType: job.taskType,
      question: job.question,
      annotationSets: job.annotationSets,
      redundancy: job.redundancy,
      status: job.status,
      tasksCount: job.tasksCount,
      createdBy: job.createdBy?.email,
      createdAt: job.createdAt?.toISOString()
    },
    bundle: bundle
      ? {
          id: bundle._id.toString(),
          name: bundle.name,
          description: bundle.description,
          annotationSets: bundle.annotationSets,
          counts: bundle.counts
        }
      : null,
    selection: job.selection ? { kind: job.selection.kind, spec: job.selection.spec } : null,
    progress: { tasks: stats.tasks, completed: stats.completed, answers: stats.answers }
  };

  const set = job.annotationSets[0];
  if (job.taskType !== 'mask_toggle' || !job.bundleId || !set) {
    return manifest;
  }

  const inJob = new Map<string, Map<string, number>>();
  // Name the document type: newer mongoose infers a nested projection as selecting no fields.
  const tasks = await LabelTask.find<ILabelTask>({ jobId: job._id }, { 'payload.maskMap.masks': 1 });
  for (const task of tasks) {
    for (const mask of task.payload?.maskMap?.masks || []) {
      for (const [field, value] of Object.entries(mask)) {
        if (field === 'id' || value === null || value === undefined || typeof value === 'object') {
          continue;
        }
        const counts = inJob.get(field) || new Map<string, number>();
        counts.set(String(value), (counts.get(String(value)) || 0) + 1);
        inJob.set(field, counts);
      }
    }
  }

  // Bundle-wide totals come from the same tally the job wizard groups by, so a
  // field the wizard could scope on is a field this can weight by.
  manifest.masks = {};
  for (const { field, values } of await maskFields(job.bundleId.toString(), set)) {
    manifest.masks[field] = Object.fromEntries(
      values.map(({ value, count }) => [value, { bundle: count, job: inJob.get(field)?.get(value) || 0 }])
    );
  }
  return manifest;
};
