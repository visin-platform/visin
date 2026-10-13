import { describe, expect, it } from 'vitest';
import {
  boxAt,
  clampBox,
  containsPoint,
  handleAt,
  handlePoint,
  isDrawable,
  MIN_BOX_SIZE,
  moveBox,
  rectFromPoints,
  resizeBox,
  sameBox
} from './boxes';
import type { BoxObject } from '../types';

const box = (id: string, bbox: BoxObject['bbox']): BoxObject => ({ id, classKey: 'car', bbox, source: 'human' });

describe('rectFromPoints', () => {
  it('gives the same box whichever way the drag went', () => {
    expect(rectFromPoints(10, 20, 40, 60)).toEqual([10, 20, 30, 40]);
    expect(rectFromPoints(40, 60, 10, 20)).toEqual([10, 20, 30, 40]);
    expect(rectFromPoints(40, 20, 10, 60)).toEqual([10, 20, 30, 40]);
  });
});

describe('clampBox', () => {
  it('shrinks a box that crosses the frame edge rather than moving it', () => {
    expect(clampBox([-10, -10, 30, 30], 100, 100)).toEqual([0, 0, 20, 20]);
    expect(clampBox([90, 90, 30, 30], 100, 100)).toEqual([90, 90, 10, 10]);
    expect(clampBox([10, 10, 30, 30], 100, 100)).toEqual([10, 10, 30, 30]);
  });

  it('gives a box with no area when it is wholly outside', () => {
    const [, , w, h] = clampBox([200, 200, 10, 10], 100, 100);
    expect(w).toBe(0);
    expect(h).toBe(0);
  });
});

describe('isDrawable', () => {
  it('rejects a stray click and keeps a real drag', () => {
    expect(isDrawable([0, 0, MIN_BOX_SIZE - 1, 50])).toBe(false);
    expect(isDrawable([0, 0, 50, MIN_BOX_SIZE - 1])).toBe(false);
    expect(isDrawable([0, 0, MIN_BOX_SIZE, MIN_BOX_SIZE])).toBe(true);
  });
});

describe('hit testing', () => {
  it('knows when a point is in a box, with a tolerance around it', () => {
    expect(containsPoint([10, 10, 20, 20], 15, 15)).toBe(true);
    expect(containsPoint([10, 10, 20, 20], 31, 15)).toBe(false);
    expect(containsPoint([10, 10, 20, 20], 31, 15, 2)).toBe(true);
  });

  it('picks the smallest box under the point, so a box inside another stays reachable', () => {
    const big = box('big', [0, 0, 100, 100]);
    const small = box('small', [40, 40, 10, 10]);
    expect(boxAt([big, small], 45, 45)?.id).toBe('small');
    expect(boxAt([small, big], 45, 45)?.id).toBe('small');
    expect(boxAt([big, small], 10, 10)?.id).toBe('big');
    expect(boxAt([big, small], 500, 500)).toBeUndefined();
  });

  it('prefers the later box when two are the same size', () => {
    const a = box('a', [0, 0, 10, 10]);
    const b = box('b', [0, 0, 10, 10]);
    expect(boxAt([a, b], 5, 5)?.id).toBe('b');
  });
});

describe('handles', () => {
  const bbox: BoxObject['bbox'] = [10, 20, 40, 60];

  it('puts each handle on its corner or edge midpoint', () => {
    expect(handlePoint(bbox, 'nw')).toEqual({ x: 10, y: 20 });
    expect(handlePoint(bbox, 'se')).toEqual({ x: 50, y: 80 });
    expect(handlePoint(bbox, 'n')).toEqual({ x: 30, y: 20 });
    expect(handlePoint(bbox, 'e')).toEqual({ x: 50, y: 50 });
    expect(handlePoint(bbox, 's')).toEqual({ x: 30, y: 80 });
    expect(handlePoint(bbox, 'w')).toEqual({ x: 10, y: 50 });
    expect(handlePoint(bbox, 'ne')).toEqual({ x: 50, y: 20 });
    expect(handlePoint(bbox, 'sw')).toEqual({ x: 10, y: 80 });
  });

  it('finds the handle under a point, the nearest one when several are in reach', () => {
    expect(handleAt(bbox, 11, 21, 5)).toBe('nw');
    expect(handleAt(bbox, 49, 81, 5)).toBe('se');
    expect(handleAt(bbox, 30, 21, 5)).toBe('n');
    expect(handleAt(bbox, 30, 50, 5)).toBeNull();
    // A tiny box has handles on top of each other; the closest still wins.
    expect(handleAt([0, 0, 4, 4], 0.5, 0.5, 5)).toBe('nw');
  });
});

describe('resizeBox', () => {
  const bbox: BoxObject['bbox'] = [10, 10, 40, 40];

  it('moves only the edges its handle owns', () => {
    expect(resizeBox(bbox, 'se', 70, 80, 100, 100)).toEqual([10, 10, 60, 70]);
    expect(resizeBox(bbox, 'nw', 0, 5, 100, 100)).toEqual([0, 5, 50, 45]);
    expect(resizeBox(bbox, 'e', 90, 999, 100, 100)).toEqual([10, 10, 80, 40]);
    expect(resizeBox(bbox, 's', 999, 70, 100, 100)).toEqual([10, 10, 40, 60]);
    expect(resizeBox(bbox, 'n', 0, 0, 100, 100)).toEqual([10, 0, 40, 50]);
    expect(resizeBox(bbox, 'w', 0, 0, 100, 100)).toEqual([0, 10, 50, 40]);
  });

  it('keeps the edge inside the frame', () => {
    expect(resizeBox(bbox, 'se', 500, 500, 100, 100)).toEqual([10, 10, 90, 90]);
    expect(resizeBox(bbox, 'nw', -50, -50, 100, 100)).toEqual([0, 0, 50, 50]);
  });

  it('flips the box when an edge is dragged past the opposite one', () => {
    expect(resizeBox(bbox, 'e', 0, 0, 100, 100)).toEqual([0, 10, 10, 40]);
    expect(resizeBox(bbox, 's', 0, 0, 100, 100)).toEqual([10, 0, 40, 10]);
  });
});

describe('moveBox', () => {
  it('moves by a delta and stops at the frame edge', () => {
    expect(moveBox([10, 10, 20, 20], 5, -3, 100, 100)).toEqual([15, 7, 20, 20]);
    expect(moveBox([10, 10, 20, 20], -50, -50, 100, 100)).toEqual([0, 0, 20, 20]);
    expect(moveBox([10, 10, 20, 20], 500, 500, 100, 100)).toEqual([80, 80, 20, 20]);
  });

  it('keeps a box larger than the frame at the origin', () => {
    expect(moveBox([0, 0, 200, 200], 10, 10, 100, 100)).toEqual([0, 0, 200, 200]);
  });
});

describe('sameBox', () => {
  it('compares all four numbers', () => {
    expect(sameBox([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
    expect(sameBox([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false);
  });
});
