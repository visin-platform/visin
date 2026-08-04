import { describe, it, expect } from 'vitest';
import { buildMaskIndex, maskIdAtPoint, buildHighlightOverlay, applyMaskCutout } from './maskIndex';

// 2×2 id map: [bg, mask0; mask1, mask2] (pixel value = maskId+1)
const rgba = new Uint8ClampedArray([
  0, 0, 0, 255,   1, 1, 1, 255,
  2, 2, 2, 255,   3, 3, 3, 255,
]);
const index = buildMaskIndex(rgba, 2, 2);

describe('buildMaskIndex', () => {
  it('decodes pixel values into maskIds with -1 background', () => {
    expect([...index.maskIdAt]).toEqual([-1, 0, 1, 2]);
    expect(index.width).toBe(2);
    expect(index.height).toBe(2);
  });
});

describe('maskIdAtPoint', () => {
  it('returns the mask under a point and null on background', () => {
    expect(maskIdAtPoint(index, 1, 0)).toBe(0);
    expect(maskIdAtPoint(index, 0.4, 1.9)).toBe(1); // floors fractional coords
    expect(maskIdAtPoint(index, 0, 0)).toBeNull();
  });

  it('ignores masks outside the task scope', () => {
    // The layer paints masks 0-2, but this job only asked about mask 1.
    const scope = new Set([1]);
    expect(maskIdAtPoint(index, 1, 0, scope)).toBeNull();
    expect(maskIdAtPoint(index, 0, 1, scope)).toBe(1);
  });

  it('returns null outside the image', () => {
    expect(maskIdAtPoint(index, -1, 0)).toBeNull();
    expect(maskIdAtPoint(index, 2, 0)).toBeNull();
    expect(maskIdAtPoint(index, 0, 5)).toBeNull();
  });
});

describe('buildHighlightOverlay scope', () => {
  it('dims masks the job did not select, ahead of the focus tint', () => {
    const overlay = buildHighlightOverlay(index, 2, new Set([1]));

    expect([...overlay.slice(4, 8)]).toEqual([18, 22, 30, 165]); // mask 0 out of scope → dimmed
    expect(overlay.slice(8, 12)).toEqual(new Uint8ClampedArray([0, 0, 0, 0])); // mask 1 in scope, plain
    expect([...overlay.slice(12, 16)]).toEqual([18, 22, 30, 165]); // focus loses to scope
  });
});

describe('buildHighlightOverlay', () => {
  it('tints the focused mask amber and leaves every other mask alone', () => {
    const overlay = buildHighlightOverlay(index, 2);

    expect(overlay.slice(0, 4)).toEqual(new Uint8ClampedArray([0, 0, 0, 0])); // background untouched
    expect(overlay.slice(4, 8)).toEqual(new Uint8ClampedArray([0, 0, 0, 0])); // mask 0 unselected
    expect(overlay.slice(8, 12)).toEqual(new Uint8ClampedArray([0, 0, 0, 0])); // mask 1 unselected
    expect([...overlay.slice(12, 16)]).toEqual([255, 193, 7, 90]); // mask 2 focused → amber
  });
});

describe('buildHighlightOverlay hover', () => {
  it('washes the mask under the cursor white so the click target is visible', () => {
    const overlay = buildHighlightOverlay(index, null, null, 0);

    expect([...overlay.slice(4, 8)]).toEqual([255, 255, 255, 80]); // mask 0 hovered
    expect(overlay.slice(8, 12)).toEqual(new Uint8ClampedArray([0, 0, 0, 0])); // mask 1 untouched
  });

  it('deepens rather than replaces the focus tint', () => {
    expect([...buildHighlightOverlay(index, 2, null, 2).slice(12, 16)]).toEqual([255, 193, 7, 140]);
  });

  // Hover must never make an out-of-scope mask look clickable.
  it('never lights a mask outside the job scope', () => {
    const overlay = buildHighlightOverlay(index, null, new Set([1]), 0);

    expect([...overlay.slice(4, 8)]).toEqual([18, 22, 30, 165]);
  });
});

describe('applyMaskCutout', () => {
  // A layer painting all three masks opaque red.
  const layer = new Uint8ClampedArray([
    0, 0, 0, 0,       255, 0, 0, 255,
    255, 0, 0, 255,   255, 0, 0, 255,
  ]);

  it('erases only the marked masks, leaving the rest of the layer intact', () => {
    const cut = applyMaskCutout(index, layer, new Set([1]));

    expect([...cut.slice(4, 8)]).toEqual([255, 0, 0, 255]); // mask 0 still painted
    expect([...cut.slice(8, 12)]).toEqual([255, 0, 0, 0]); // mask 1 marked → transparent
    expect([...cut.slice(12, 16)]).toEqual([255, 0, 0, 255]); // mask 2 still painted
  });

  it('returns a copy, so the decoded layer survives for the next toggle', () => {
    const cut = applyMaskCutout(index, layer, new Set([1, 2]));

    expect(cut).not.toBe(layer);
    expect([...layer.slice(8, 12)]).toEqual([255, 0, 0, 255]);
    expect([...cut.slice(12, 16)]).toEqual([255, 0, 0, 0]);
  });

  it('is a plain copy when nothing is marked', () => {
    expect([...applyMaskCutout(index, layer, new Set())]).toEqual([...layer]);
  });
});
