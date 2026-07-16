import { ILabelJob } from '../models/LabelJob';
import { LabelTask, ILabelTask } from '../models/LabelTask';
import { LabelAnswer, ILabelAnswer } from '../models/LabelAnswer';
import { LabelImage } from '../models/LabelImage';

interface TaskContext {
  task: ILabelTask;
  framePath: string;
  answers: ILabelAnswer[];
}

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
          elapsedMs: answer.elapsedMs
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
        verdicts: answers.map((answer) => ({
          userEmail: answer.userEmail,
          verdict: maskVerdict(answer, mask.id)
        })),
        consensus: majority(answers.map((answer) => maskVerdict(answer, mask.id)))
      });
    }
  }
  return rows;
};

const csvEscape = (value: unknown): string => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Long format: one CSV row per user-answer (single_choice) or user-mask-verdict (mask_toggle). */
export const exportCsv = async (job: ILabelJob): Promise<string> => {
  const contexts = await loadJobData(job);
  const lines: string[] = [];

  if (job.taskType === 'single_choice') {
    lines.push('taskId,frame,stratum,userEmail,choiceKey,elapsedMs');
    for (const { task, framePath, answers } of contexts) {
      for (const answer of answers) {
        lines.push(
          [task._id, framePath, task.stratum, answer.userEmail, answer.choiceKey, answer.elapsedMs]
            .map(csvEscape)
            .join(',')
        );
      }
    }
  } else {
    lines.push('taskId,frame,stratum,maskId,class,userEmail,verdict');
    for (const { task, framePath, answers } of contexts) {
      for (const mask of task.payload?.maskMap?.masks || []) {
        for (const answer of answers) {
          lines.push(
            [task._id, framePath, task.stratum, mask.id, mask.class, answer.userEmail, maskVerdict(answer, mask.id)]
              .map(csvEscape)
              .join(',')
          );
        }
      }
    }
  }
  return lines.join('\n') + '\n';
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
