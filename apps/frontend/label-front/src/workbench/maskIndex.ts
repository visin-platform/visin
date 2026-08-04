/**
 * Pixel-level mask logic for mask_toggle jobs, kept free of DOM/canvas glue so
 * it is unit-testable. The id map is a grayscale PNG where pixel value =
 * maskId + 1 (0 = background); jsdom-independent callers pass raw RGBA bytes.
 */

export interface MaskIndex {
  width: number;
  height: number;
  /** maskId per pixel, -1 = background */
  maskIdAt: Int16Array;
}

/** Decode an RGBA buffer of the id map into a per-pixel maskId lookup. */
export const buildMaskIndex = (rgba: Uint8ClampedArray, width: number, height: number): MaskIndex => {
  const maskIdAt = new Int16Array(width * height);
  for (let i = 0; i < width * height; i++) {
    // Grayscale PNG → R=G=B=value; value 0 is background.
    maskIdAt[i] = rgba[i * 4] - 1;
  }
  return { width, height, maskIdAt };
};

/**
 * maskId under an image-space coordinate, or null.
 *
 * `scope` is the task's own mask list, which can be a subset of what the id map
 * paints: one full-corpus bundle backs several jobs, so a frame's layer may show
 * masks this job never asked about. Those are out of scope — not clickable, and
 * dimmed by the overlay below — so a judgement is only ever recorded for a mask
 * the job actually selected.
 */
export const maskIdAtPoint = (
  index: MaskIndex,
  x: number,
  y: number,
  scope?: ReadonlySet<number> | null
): number | null => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= index.width || yi >= index.height) {
    return null;
  }
  const id = index.maskIdAt[yi * index.width + xi];
  if (id < 0 || (scope && !scope.has(id))) {
    return null;
  }
  return id;
};

/**
 * RGBA highlight overlay: rejected masks tinted red, the focused mask outlined
 * amber (drawn as a translucent fill — cheap and visible at any zoom), the mask
 * under the cursor lit white, and anything outside the task's mask scope greyed
 * back so the labeler can see at a glance which regions this job is asking about.
 *
 * The hover tint is what makes a click land where the labeler intends: masks are
 * often small, adjacent or nested, and a cursor alone does not say which one the
 * pixel under it belongs to. Callers repaint only when the hovered id *changes*,
 * not on every pointer move — this walks every pixel.
 */
export const buildHighlightOverlay = (
  index: MaskIndex,
  rejected: ReadonlySet<number>,
  focusedMaskId: number | null,
  scope?: ReadonlySet<number> | null,
  hoveredMaskId?: number | null
): Uint8ClampedArray<ArrayBuffer> => {
  const out = new Uint8ClampedArray(index.width * index.height * 4);
  for (let i = 0; i < index.maskIdAt.length; i++) {
    const id = index.maskIdAt[i];
    if (id < 0) continue;
    const offset = i * 4;
    if (scope && !scope.has(id)) {
      out[offset] = 18; // out of scope for this job — mute the layer's colour
      out[offset + 1] = 22;
      out[offset + 2] = 30;
      out[offset + 3] = 165;
    } else if (rejected.has(id)) {
      out[offset] = 244; // red fill for "marked incorrect"
      out[offset + 1] = 32;
      out[offset + 2] = 32;
      out[offset + 3] = 140;
      if (id === hoveredMaskId) {
        out[offset + 3] = 190; // deepen, so un-marking is as targetable as marking
      }
    } else if (id === focusedMaskId) {
      out[offset] = 255; // amber fill for the mask-walk focus
      out[offset + 1] = 193;
      out[offset + 2] = 7;
      out[offset + 3] = id === hoveredMaskId ? 140 : 90;
    } else if (id === hoveredMaskId) {
      out[offset] = 255; // white wash: "this is the mask you are about to click"
      out[offset + 1] = 255;
      out[offset + 2] = 255;
      out[offset + 3] = 80;
    }
  }
  return out;
};
