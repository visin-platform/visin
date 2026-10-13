/**
 * A point sensor's readings (range, depth, RCS) as colours: a fixed blue → red
 * ramp over the frame's own min and max, so near and far read the same way on
 * every frame. Built from numbers rather than written as colour literals, which
 * belong to the theme; a reading is data, not a palette choice.
 */
const STOPS: [number, number, number][] = [
  [49, 54, 149],
  [69, 117, 180],
  [116, 173, 209],
  [171, 217, 233],
  [254, 224, 144],
  [253, 174, 97],
  [244, 109, 67],
  [215, 48, 39]
];

/** `t` in 0..1 → `#rrggbb`. */
export const rampColor = (t: number): string => {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const position = clamped * (STOPS.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(STOPS.length - 1, lower + 1);
  const fraction = position - lower;
  const channel = (c: number): number => Math.round(STOPS[lower][c] + (STOPS[upper][c] - STOPS[lower][c]) * fraction);
  return `#${[0, 1, 2].map((c) => channel(c).toString(16).padStart(2, '0')).join('')}`;
};

/** The range readings span, for normalising them; null when no point carries one. */
export const valueRange = (values: (number | undefined)[]): { min: number; max: number } | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value === undefined || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min <= max ? { min, max } : null;
};
