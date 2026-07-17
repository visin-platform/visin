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

/** maskId under an image-space coordinate, or null. */
export const maskIdAtPoint = (index: MaskIndex, x: number, y: number): number | null => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= index.width || yi >= index.height) {
    return null;
  }
  const id = index.maskIdAt[yi * index.width + xi];
  return id >= 0 ? id : null;
};

/**
 * RGBA highlight overlay: rejected masks tinted red, the focused mask outlined
 * amber (drawn as a translucent fill — cheap and visible at any zoom).
 */
export const buildHighlightOverlay = (
  index: MaskIndex,
  rejected: ReadonlySet<number>,
  focusedMaskId: number | null
): Uint8ClampedArray<ArrayBuffer> => {
  const out = new Uint8ClampedArray(index.width * index.height * 4);
  for (let i = 0; i < index.maskIdAt.length; i++) {
    const id = index.maskIdAt[i];
    if (id < 0) continue;
    const offset = i * 4;
    if (rejected.has(id)) {
      out[offset] = 244; // red fill for "marked incorrect"
      out[offset + 1] = 32;
      out[offset + 2] = 32;
      out[offset + 3] = 140;
    } else if (id === focusedMaskId) {
      out[offset] = 255; // amber fill for the mask-walk focus
      out[offset + 1] = 193;
      out[offset + 2] = 7;
      out[offset + 3] = 90;
    }
  }
  return out;
};
