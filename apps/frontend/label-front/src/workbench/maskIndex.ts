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
 * RGBA highlight overlay: the focused mask filled amber (cheap and visible at
 * any zoom), the mask under the cursor lit white, and anything outside the
 * task's mask scope greyed back so the labeler can see at a glance which regions
 * this job is asking about.
 *
 * Marking a mask incorrect is *not* drawn here — `applyMaskCutout` removes that
 * mask's paint instead, so the answer to "which ones did I mark" is the absence
 * of colour rather than more of it.
 *
 * The hover tint is what makes a click land where the labeler intends: masks are
 * often small, adjacent or nested, and a cursor alone does not say which one the
 * pixel under it belongs to. It applies to hidden masks too — a hidden mask is
 * still a click target, and the wash is the only thing that says so. Callers
 * repaint only when the hovered id *changes*, not on every pointer move — this
 * walks every pixel.
 */
export const buildHighlightOverlay = (
  index: MaskIndex,
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

/**
 * The annotation layer with `hidden` masks erased — a copy of its pixels with
 * the alpha zeroed wherever the id map says a hidden mask is painted.
 *
 * This is what a click does. Tinting a mask to say "marked" covers the very
 * pixels the labeler needs to look at to decide whether marking it was right,
 * and on a frame with 40 overlapping regions a second colour on top of the class
 * colours is one more thing to read. Taking the paint away instead leaves the
 * image underneath visible, and the mask stays clickable through the id map, so
 * clicking the same spot paints it back.
 */
export const applyMaskCutout = (
  index: MaskIndex,
  layer: Uint8ClampedArray,
  hidden: ReadonlySet<number>
): Uint8ClampedArray<ArrayBuffer> => {
  const out = new Uint8ClampedArray(layer);
  if (hidden.size === 0) {
    return out;
  }
  for (let i = 0; i < index.maskIdAt.length; i++) {
    const id = index.maskIdAt[i];
    if (id >= 0 && hidden.has(id)) {
      out[i * 4 + 3] = 0;
    }
  }
  return out;
};
