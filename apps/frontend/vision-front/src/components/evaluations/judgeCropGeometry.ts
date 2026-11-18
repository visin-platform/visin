import type { JudgeDisagreement } from '../../types/evaluation';

/** Bounding boxes are [left, top, right, bottom] in original-image pixels. */
export function sampleBox(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(item => typeof item === 'number' && Number.isFinite(item))) return undefined;
  const [left, top, right, bottom] = value;
  return left >= 0 && top >= 0 && right > left && bottom > top ? [left, top, right, bottom] : undefined;
}

export function sampleFrame(sample: JudgeDisagreement): string {
  const frame = typeof sample.attrs.frame === 'string' ? sample.attrs.frame : sample.id.split('/')[0];
  return frame.replace(/\\/g, '/').split('/').pop()!.replace(/\.(?:png|jpe?g|webp)$/i, '');
}
