/**
 * One-sentence definitions for the metrics most pipelines report, so a reader who
 * is not a machine-learning engineer can learn what a column means by hovering it.
 *
 * Only a fallback: a project's own `description` in its taxonomy always wins, and
 * a key nobody has defined simply shows no tooltip. Keys are matched in lower case
 * with separators dropped, so `mIoU_foreground`, `miou` and `mean_iou` all find
 * their entry.
 */
const GLOSSARY: Record<string, string> = {
  iou: 'Intersection over Union: how much the predicted area overlaps the true area, from 0 (none) to 1 (perfect).',
  miou: 'Mean IoU: the overlap between prediction and truth (IoU), averaged over the classes.',
  meaniou: 'Mean IoU: the overlap between prediction and truth (IoU), averaged over the classes.',
  miouforeground: 'Mean IoU over the foreground classes only, leaving out the background.',
  fwiou: 'Frequency-weighted IoU: each class counts in proportion to how much of the image it covers.',
  pixelaccuracy: 'The share of all pixels that got the right class.',
  meanaccuracy: 'The share of correct pixels, worked out per class and then averaged, so rare classes count as much as common ones.',
  accuracy: 'The share of predictions that were right.',
  top1: 'The share of images where the single best guess was right.',
  top5: 'The share of images where the right answer was among the five best guesses.',
  precision: 'Of everything the model called a class, how much really was that class.',
  recall: 'Of everything that really was a class, how much the model found.',
  f1: 'F1: one number that balances precision and recall, from 0 to 1.',
  f1score: 'F1: one number that balances precision and recall, from 0 to 1.',
  dice: 'Dice score: another overlap measure, like IoU but a little more forgiving. 1 is a perfect match.',
  dicescore: 'Dice score: another overlap measure, like IoU but a little more forgiving. 1 is a perfect match.',
  ap: 'Average Precision: how well the model ranks its detections, from 0 to 1.',
  map: 'Mean Average Precision: AP averaged over the classes.',
  map50: 'mAP counting a detection as right when its box overlaps the true box by at least 50%.',
  map5095: 'mAP averaged over overlap thresholds from 50% to 95%: a stricter test that rewards tight boxes.',
  loss: 'What training tries to make small. Lower is better; it is only comparable between runs that use the same loss.',
  trainloss: 'The loss on the training images. Lower is better.',
  valloss: 'The loss on images held back from training. If it rises while the training loss falls, the model is overfitting.',
  fps: 'Frames per second: how many images the model processes each second. Higher is faster.',
  throughputfps: 'Frames per second: how many images the model processes each second. Higher is faster.',
  flops: 'Floating-point operations for one image: a hardware-independent measure of how heavy the model is.',
  params: 'The number of learnable weights in the model.',
  latencyms: 'How long one image takes to process, in milliseconds. Lower is faster.',
  rmse: 'Root mean squared error: the typical size of a mistake, with big mistakes counting extra. Lower is better.',
  mae: 'Mean absolute error: the average size of a mistake. Lower is better.',
  psnr: 'Peak signal-to-noise ratio, in decibels: how close a reconstruction is to the original. Higher is better.',
  ssim: 'Structural similarity: how alike two images look, from 0 to 1.',
  auc: 'Area under the ROC curve: how well the model separates the classes, from 0.5 (guessing) to 1.'
};

const normalise = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The built-in definition for a metric key, if there is one. */
export const glossaryFor = (key: string): string | undefined => GLOSSARY[normalise(key)];
