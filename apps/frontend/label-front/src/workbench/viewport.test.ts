import { describe, it, expect } from 'vitest';
import { MAX_SCALE, MIN_SCALE, fitViewport, focusBbox, panBy, toImagePoint, zoomAt } from './viewport';

describe('fitViewport', () => {
  it('fits and centers a wide image in a container', () => {
    const viewport = fitViewport(1000, 500, 500, 500);

    expect(viewport.scale).toBe(0.5);
    expect(viewport.offsetX).toBe(0);
    expect(viewport.offsetY).toBe(125); // (500 - 250) / 2
  });
});

describe('zoomAt', () => {
  it('keeps the anchor point fixed', () => {
    const viewport = { scale: 1, offsetX: 0, offsetY: 0 };
    const zoomed = zoomAt(viewport, 2, 100, 50);

    const before = toImagePoint(viewport, 100, 50);
    const after = toImagePoint(zoomed, 100, 50);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomed.scale).toBe(2);
  });

  it('clamps to min/max scale', () => {
    expect(zoomAt({ scale: MAX_SCALE, offsetX: 0, offsetY: 0 }, 10, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: MIN_SCALE, offsetX: 0, offsetY: 0 }, 0.01, 0, 0).scale).toBe(MIN_SCALE);
  });
});

describe('panBy / toImagePoint', () => {
  it('pans offsets and converts screen to image coordinates', () => {
    const panned = panBy({ scale: 2, offsetX: 10, offsetY: 20 }, 5, -5);

    expect(panned).toEqual({ scale: 2, offsetX: 15, offsetY: 15 });
    expect(toImagePoint(panned, 35, 35)).toEqual({ x: 10, y: 10 });
  });
});

describe('focusBbox', () => {
  it('centers the bbox in the container', () => {
    const viewport = focusBbox([100, 100, 200, 200], 600, 600);

    const center = toImagePoint(viewport, 300, 300);
    expect(center.x).toBeCloseTo(150);
    expect(center.y).toBeCloseTo(150);
    expect(viewport.scale).toBe(2); // 600 / (100 * 3 padding)
  });

  it('handles degenerate bboxes via the minimum size', () => {
    const viewport = focusBbox([50, 50, 50, 50], 240, 240);

    expect(viewport.scale).toBe(10); // 240 / (8 * 3)
  });
});
