import type { Training } from './training';

/** One run's standing on the result the project is judged on. */
export interface RankedRun {
  training: { _id: string; name: string; status: Training['status']; createdAt: string };
  value: number;
  /** the epoch it peaked at */
  epoch: number;
}

/** The run that did best on a project or a dataset, and by what measure. */
export interface BestRun {
  /** how many runs were looked at */
  runs: number;
  /** a project's runs that reported the result, best first: only for a project query */
  ranking?: RankedRun[];
  best: {
    training: { _id: string; uuid: string; name: string; status: string; projectId?: string };
    project: { _id: string; name: string; slug?: string };
    metric: {
      /** where the result sits in an epoch, e.g. `val.mean_iou` */
      path: string;
      direction: 'higher' | 'lower';
      /** `taxonomy` when the project said which way is better, `default` when it was guessed from the name */
      directionFrom: 'taxonomy' | 'default';
      /** `project` when the project named its headline result, `guessed` otherwise */
      source: 'project' | 'guessed';
    };
    value: number;
    epoch: number;
  } | null;
}
