/** The callouts a sample run's tour shows, in order. */
export interface TourStep {
  /** the `data-guide` value of the element the callout points at */
  anchor: string;
  title: string;
  body: string;
  /** the last step can end in deleting the sample, instead of only closing */
  deletes?: boolean;
}

export const SAMPLE_TOUR: TourStep[] = [
  {
    anchor: 'loss-chart',
    title: 'Every epoch lands here',
    body: 'Each epoch your script sends adds a point. What it sends under train and val is drawn as two lines, so you can see a model start to overfit.'
  },
  {
    anchor: 'miou-chart',
    title: 'Nothing to declare',
    body: 'Any metric you send gets its chart the first time it arrives. This one is mean_iou; a new class or metric shows up the same way.'
  },
  {
    anchor: 'training-actions',
    title: 'That was a sample',
    body: 'Delete it when you are done looking. It moves to deleted trainings, where you can restore it.',
    deletes: true
  }
];

