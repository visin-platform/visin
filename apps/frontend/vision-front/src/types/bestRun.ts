/** The run that did best on a project or a dataset, and by what measure. */
export interface BestRun {
  /** how many runs were looked at */
  runs: number;
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
