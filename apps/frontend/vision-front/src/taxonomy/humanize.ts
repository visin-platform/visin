/**
 * Turns a raw payload key into something printable: `day_fair` → "Day Fair",
 * `mIoU_foreground` → "mIoU Foreground", `cyclist + pedestrian` → "Cyclist + Pedestrian".
 *
 * Only ever a fallback. A project that cares supplies its own label, and acronyms
 * are the reason it must stay overridable — no rule turns `fw_iou` into "FW IoU".
 */

/** Casings we know, so the common metric keys don't come out looking wrong. */
const KNOWN_CASINGS: Record<string, string> = {
  iou: 'IoU',
  miou: 'mIoU',
  ap: 'AP',
  map: 'mAP',
  f1: 'F1',
  fw: 'FW',
  fps: 'FPS',
  ms: 'ms',
  rmse: 'RMSE',
  mae: 'MAE',
  psnr: 'PSNR',
  ssim: 'SSIM',
  auc: 'AUC',
  gpu: 'GPU',
  cpu: 'CPU',
  ram: 'RAM'
};

export const humanize = (key: string): string =>
  key
    .split(/[\s_]+/)
    .filter(part => part.length > 0)
    .map(part => {
      const known = KNOWN_CASINGS[part.toLowerCase()];
      if (known) {
        return known;
      }
      // preserve a deliberate internal capital (mIoU_foreground, epoch_uuid)
      if (part !== part.toLowerCase() && part !== part.toUpperCase()) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
