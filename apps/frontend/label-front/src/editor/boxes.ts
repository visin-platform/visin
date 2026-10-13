import type { BoxObject } from '../types';

/**
 * Box geometry in the frame's pixels, kept free of the DOM so it can be tested
 * without a canvas. A box is `[x, y, width, height]`; a handle is named by the
 * compass point of the edge or corner it moves.
 */
export type Bbox = BoxObject['bbox'];
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** The smallest a drawn box may be, in frame pixels: a stray click draws nothing. */
export const MIN_BOX_SIZE = 3;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The box between two corners, whichever way the drag went. */
export const rectFromPoints = (x0: number, y0: number, x1: number, y1: number): Bbox => [
  Math.min(x0, x1),
  Math.min(y0, y1),
  Math.abs(x1 - x0),
  Math.abs(y1 - y0)
];

/** Pull a box back inside the frame, shrinking it rather than moving it. */
export const clampBox = (bbox: Bbox, width: number, height: number): Bbox => {
  const x = clamp(bbox[0], 0, width);
  const y = clamp(bbox[1], 0, height);
  const right = clamp(bbox[0] + bbox[2], 0, width);
  const bottom = clamp(bbox[1] + bbox[3], 0, height);
  return [x, y, right - x, bottom - y];
};

export const isDrawable = (bbox: Bbox): boolean => bbox[2] >= MIN_BOX_SIZE && bbox[3] >= MIN_BOX_SIZE;

export const containsPoint = (bbox: Bbox, x: number, y: number, tolerance = 0): boolean =>
  x >= bbox[0] - tolerance && x <= bbox[0] + bbox[2] + tolerance && y >= bbox[1] - tolerance && y <= bbox[1] + bbox[3] + tolerance;

/**
 * The box under a point. Later boxes are drawn on top, so they win; among boxes
 * that all contain the point the smallest wins, which is how a small box inside
 * a large one stays reachable.
 */
export const boxAt = (boxes: BoxObject[], x: number, y: number, tolerance = 0): BoxObject | undefined => {
  let found: BoxObject | undefined;
  let foundArea = Infinity;
  for (const box of boxes) {
    if (!containsPoint(box.bbox, x, y, tolerance)) continue;
    const area = box.bbox[2] * box.bbox[3];
    if (area <= foundArea) {
      found = box;
      foundArea = area;
    }
  }
  return found;
};

/** Where a handle sits on a box, as a point. */
export const handlePoint = (bbox: Bbox, handle: Handle): { x: number; y: number } => {
  const [x, y, w, h] = bbox;
  return {
    x: handle.includes('w') ? x : handle.includes('e') ? x + w : x + w / 2,
    y: handle.includes('n') ? y : handle.includes('s') ? y + h : y + h / 2
  };
};

/** The handle a point is on, if any. `tolerance` is in frame pixels (screen pixels ÷ zoom). */
export const handleAt = (bbox: Bbox, x: number, y: number, tolerance: number): Handle | null => {
  let best: Handle | null = null;
  let bestDistance = tolerance;
  for (const handle of HANDLES) {
    const point = handlePoint(bbox, handle);
    const distance = Math.max(Math.abs(point.x - x), Math.abs(point.y - y));
    if (distance <= bestDistance) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
};

/** Drag one handle to a point: the edges it moves follow the point, the others stay. */
export const resizeBox = (bbox: Bbox, handle: Handle, x: number, y: number, width: number, height: number): Bbox => {
  let left = bbox[0];
  let top = bbox[1];
  let right = bbox[0] + bbox[2];
  let bottom = bbox[1] + bbox[3];
  const px = clamp(x, 0, width);
  const py = clamp(y, 0, height);
  if (handle.includes('w')) left = px;
  if (handle.includes('e')) right = px;
  if (handle.includes('n')) top = py;
  if (handle.includes('s')) bottom = py;
  // Dragging an edge past the opposite one flips the box rather than inverting it.
  return rectFromPoints(left, top, right, bottom);
};

/** Move a whole box by a delta, keeping it inside the frame. */
export const moveBox = (bbox: Bbox, dx: number, dy: number, width: number, height: number): Bbox => [
  clamp(bbox[0] + dx, 0, Math.max(0, width - bbox[2])),
  clamp(bbox[1] + dy, 0, Math.max(0, height - bbox[3])),
  bbox[2],
  bbox[3]
];

export const sameBox = (a: Bbox, b: Bbox): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
