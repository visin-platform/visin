import { describe, expect, it, vi } from 'vitest';
import { EditorDocument } from './EditorDocument';
import type { BoxObject } from '../types';

const box = (id: string, bbox: BoxObject['bbox'] = [0, 0, 10, 10], extra: Partial<BoxObject> = {}): BoxObject => ({
  id,
  classKey: 'car',
  bbox,
  source: 'human',
  ...extra
});

const paint = (doc: EditorDocument, x: number, y: number, value = 1, radius = 1.5, overwrite = false) => {
  doc.beginStroke(value, overwrite);
  doc.strokeTo(x, y, radius);
  doc.endStroke();
};

describe('loading', () => {
  it('opens with stored boxes and mask, with nothing to undo', () => {
    const doc = new EditorDocument(4, 2);
    const mask = Uint8Array.from([0, 1, 1, 0, 0, 0, 2, 0]);

    doc.load([box('a')], mask);

    expect(doc.boxes).toHaveLength(1);
    expect(Array.from(doc.mask)).toEqual(Array.from(mask));
    expect(doc.hasMask).toBe(true);
    expect(doc.canUndo).toBe(false);
    // Loaded labels are the saved state, not unsaved work: neither revision moved.
    expect(doc.takeDirty()).toEqual({ x0: 0, y0: 0, x1: 4, y1: 2 });
  });

  it('copies what it is given, so the caller’s arrays are not edited in place', () => {
    const doc = new EditorDocument(2, 2);
    const mask = new Uint8Array(4);
    const source = [box('a')];

    doc.load(source, mask);
    paint(doc, 0.5, 0.5);

    expect(mask[0]).toBe(0);
    source[0].bbox[0] = 99;
    expect(doc.boxes[0].bbox[0]).toBe(0);
  });

  it('starts empty, and ignores a mask of the wrong size', () => {
    const doc = new EditorDocument(3, 3);

    doc.load([], new Uint8Array(4));

    expect(doc.hasMask).toBe(false);
    expect(doc.mask).toHaveLength(9);
  });

  it('resets history and selection on a new load', () => {
    const doc = new EditorDocument(10, 10);
    doc.addBox(box('a'));
    doc.load([], null);

    expect(doc.canUndo).toBe(false);
    expect(doc.selectedId).toBeNull();
    expect(doc.boxes).toEqual([]);
  });
});

describe('subscription', () => {
  it('tells listeners on every change, and not after they leave', () => {
    const doc = new EditorDocument(10, 10);
    const listener = vi.fn();
    const unsubscribe = doc.subscribe(listener);

    doc.addBox(box('a'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(doc.getVersion()).toBe(doc.version);

    unsubscribe();
    doc.addBox(box('b'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('boxes', () => {
  it('adds a box, selects it, and bumps the box revision', () => {
    const doc = new EditorDocument(100, 100);

    doc.addBox(box('a'));

    expect(doc.selectedId).toBe('a');
    expect(doc.boxRevision).toBe(1);
    expect(doc.maskRevision).toBe(0);
  });

  it('deletes a box, clears the selection, and ignores an unknown id', () => {
    const doc = new EditorDocument(100, 100);
    doc.addBox(box('a'));
    doc.addBox(box('b'));

    doc.deleteBox('b');
    expect(doc.boxes.map((entry) => entry.id)).toEqual(['a']);
    expect(doc.selectedId).toBeNull();

    const revision = doc.boxRevision;
    doc.deleteBox('missing');
    expect(doc.boxRevision).toBe(revision);

    doc.deleteBox('a');
    expect(doc.boxes).toEqual([]);
  });

  it('changes a class by hand and marks the box as a person’s', () => {
    const doc = new EditorDocument(100, 100);
    doc.addBox(box('a', [0, 0, 10, 10], { source: 'import', score: 0.7 }));

    doc.setBoxClass('a', 'bus');
    expect(doc.boxes[0]).toMatchObject({ classKey: 'bus', source: 'human' });

    const revision = doc.boxRevision;
    doc.setBoxClass('a', 'bus');
    doc.setBoxClass('nope', 'bus');
    expect(doc.boxRevision).toBe(revision);
  });

  it('selects a box and clears the selection, without repeating itself', () => {
    const doc = new EditorDocument(100, 100);
    doc.addBox(box('a'));
    const listener = vi.fn();
    doc.subscribe(listener);

    doc.select('a');
    expect(listener).not.toHaveBeenCalled();
    doc.select(null);
    expect(doc.selectedId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('adds several boxes as one undo step, and none as nothing', () => {
    const doc = new EditorDocument(100, 100);
    doc.addBoxes([]);
    expect(doc.canUndo).toBe(false);

    doc.addBoxes([box('a'), box('b')]);
    expect(doc.boxes).toHaveLength(2);
    doc.undo();
    expect(doc.boxes).toEqual([]);
  });
});

describe('drag gestures', () => {
  it('previews live and commits one undo step, marking a moved suggestion as human', () => {
    const doc = new EditorDocument(100, 100);
    doc.load([box('a', [0, 0, 10, 10], { source: 'import' })]);
    const revision = doc.boxRevision;

    doc.beginGesture();
    doc.previewBox('a', [5, 5, 10, 10]);
    doc.previewBox('a', [8, 8, 10, 10]);
    // Previewing is not yet worth saving.
    expect(doc.boxRevision).toBe(revision);
    expect(doc.boxes[0].bbox).toEqual([8, 8, 10, 10]);

    doc.commitGesture();
    expect(doc.boxRevision).toBe(revision + 1);
    expect(doc.boxes[0].source).toBe('human');

    doc.undo();
    expect(doc.boxes[0]).toMatchObject({ bbox: [0, 0, 10, 10], source: 'import' });
  });

  it('records nothing when the drag ended where it began', () => {
    const doc = new EditorDocument(100, 100);
    doc.load([box('a')]);

    doc.beginGesture();
    doc.previewBox('a', [3, 3, 10, 10]);
    doc.previewBox('a', [0, 0, 10, 10]);
    doc.commitGesture();

    expect(doc.canUndo).toBe(false);
    expect(doc.boxRevision).toBe(0);
  });

  it('puts the boxes back on cancel, and commit with no gesture does nothing', () => {
    const doc = new EditorDocument(100, 100);
    doc.load([box('a')]);

    doc.commitGesture();
    doc.cancelGesture();

    doc.beginGesture();
    doc.previewBox('a', [50, 50, 10, 10]);
    doc.cancelGesture();
    expect(doc.boxes[0].bbox).toEqual([0, 0, 10, 10]);
  });

  it('keeps a human box human when it is moved', () => {
    const doc = new EditorDocument(100, 100);
    doc.load([box('a'), box('b', [20, 20, 5, 5], { source: 'model' })]);

    doc.beginGesture();
    doc.previewBox('a', [1, 1, 10, 10]);
    doc.commitGesture();

    expect(doc.boxes.map((entry) => entry.source)).toEqual(['human', 'model']);
  });
});

describe('painting', () => {
  it('paints a disc of the class, leaving its edge alone', () => {
    const doc = new EditorDocument(10, 10);

    paint(doc, 5, 5, 2, 2);

    expect(doc.mask[5 * 10 + 5]).toBe(2);
    expect(doc.mask[5 * 10 + 4]).toBe(2);
    expect(doc.mask[0]).toBe(0);
    expect(doc.hasMask).toBe(true);
    expect(doc.maskRevision).toBe(1);
  });

  it('joins fast strokes so they leave no gaps', () => {
    const doc = new EditorDocument(40, 5);

    doc.beginStroke(1);
    doc.strokeTo(35, 2, 1.5, 3, 2);
    doc.endStroke();

    for (let x = 4; x <= 34; x++) expect(doc.mask[2 * 40 + x]).toBe(1);
  });

  it('does not paint over another class unless told to', () => {
    const doc = new EditorDocument(10, 10);
    paint(doc, 5, 5, 1, 2);

    paint(doc, 5, 5, 2, 2);
    expect(doc.mask[5 * 10 + 5]).toBe(1);

    paint(doc, 5, 5, 2, 2, true);
    expect(doc.mask[5 * 10 + 5]).toBe(2);
  });

  it('erases any class and reports an empty mask again', () => {
    const doc = new EditorDocument(10, 10);
    paint(doc, 5, 5, 1, 2);

    paint(doc, 5, 5, 0, 5);

    expect(doc.hasMask).toBe(false);
    expect(Array.from(doc.mask).every((value) => value === 0)).toBe(true);
  });

  it('counts a pixel once however many times the stroke crosses it', () => {
    const doc = new EditorDocument(10, 10);

    doc.beginStroke(1);
    for (let i = 0; i < 5; i++) doc.strokeTo(5, 5, 2);
    doc.endStroke();
    doc.undo();

    expect(doc.hasMask).toBe(false);
  });

  it('records nothing for a stroke that changed nothing, and ignores strokes never begun', () => {
    const doc = new EditorDocument(10, 10);
    paint(doc, 5, 5, 1, 2);
    const revision = doc.maskRevision;

    paint(doc, 5, 5, 1, 2);
    doc.strokeTo(1, 1, 3);
    doc.endStroke();

    expect(doc.maskRevision).toBe(revision);
  });

  it('stays inside the frame', () => {
    const doc = new EditorDocument(4, 4);

    paint(doc, -3, -3, 1, 6);
    paint(doc, 10, 10, 1, 6);

    expect(doc.mask).toHaveLength(16);
    expect(doc.hasMask).toBe(true);
  });

  it('grows its change list past the first allocation', () => {
    const doc = new EditorDocument(100, 100);

    doc.beginStroke(1);
    doc.strokeTo(50, 50, 40);
    doc.endStroke();
    expect(doc.mask.filter((value) => value === 1).length).toBeGreaterThan(1024);

    doc.undo();
    expect(doc.hasMask).toBe(false);
  });

  it('reports the rectangle a stroke touched, once', () => {
    const doc = new EditorDocument(20, 20);
    doc.takeDirty();

    paint(doc, 10, 10, 1, 2);
    paint(doc, 3, 3, 1, 1.5);

    const dirty = doc.takeDirty()!;
    expect(dirty.x0).toBeLessThanOrEqual(2);
    expect(dirty.x1).toBeGreaterThanOrEqual(12);
    expect(doc.takeDirty()).toBeNull();
  });
});

describe('applyMask', () => {
  it('fills only where nothing is painted, as one undo step', () => {
    const doc = new EditorDocument(4, 1);
    doc.load([], Uint8Array.from([0, 3, 0, 0]));

    doc.applyMask(Uint8Array.from([1, 1, 2, 0]));

    expect(Array.from(doc.mask)).toEqual([1, 3, 2, 0]);
    expect(doc.maskRevision).toBe(1);
    doc.undo();
    expect(Array.from(doc.mask)).toEqual([0, 3, 0, 0]);
  });

  it('does nothing for a mask of the wrong size or one with nothing to add', () => {
    const doc = new EditorDocument(4, 1);

    doc.applyMask(new Uint8Array(3));
    doc.applyMask(new Uint8Array(4));

    expect(doc.canUndo).toBe(false);
  });
});

describe('paintMask', () => {
  it('paints a binary result as one class, leaving other classes alone', () => {
    const doc = new EditorDocument(4, 1);
    doc.load([], Uint8Array.from([0, 3, 0, 0]));

    doc.paintMask(Uint8Array.from([1, 1, 1, 0]), 2);

    expect(Array.from(doc.mask)).toEqual([2, 3, 2, 0]);
    expect(doc.maskRevision).toBe(1);
    doc.undo();
    expect(Array.from(doc.mask)).toEqual([0, 3, 0, 0]);
  });

  it('paints over other classes when asked, and counts a pixel changing class as still labeled', () => {
    const doc = new EditorDocument(3, 1);
    doc.load([], Uint8Array.from([1, 1, 0]));

    doc.paintMask(Uint8Array.from([1, 1, 1]), 2, true);

    expect(Array.from(doc.mask)).toEqual([2, 2, 2]);
    doc.undo();
    expect(Array.from(doc.mask)).toEqual([1, 1, 0]);
    expect(doc.hasMask).toBe(true);
  });

  it('records nothing when nothing would change', () => {
    const doc = new EditorDocument(2, 1);
    doc.load([], Uint8Array.from([2, 0]));

    doc.paintMask(Uint8Array.from([1, 0]), 2);
    doc.paintMask(new Uint8Array(2), 1);

    expect(doc.canUndo).toBe(false);
  });
});

describe('history', () => {
  it('undoes and redoes boxes and strokes in order', () => {
    const doc = new EditorDocument(20, 20);
    doc.addBox(box('a'));
    paint(doc, 10, 10, 1, 2);

    expect(doc.canUndo).toBe(true);
    doc.undo();
    expect(doc.hasMask).toBe(false);
    expect(doc.boxes).toHaveLength(1);
    expect(doc.canRedo).toBe(true);

    doc.undo();
    expect(doc.boxes).toEqual([]);
    expect(doc.selectedId).toBeNull();

    doc.redo();
    doc.redo();
    expect(doc.boxes).toHaveLength(1);
    expect(doc.hasMask).toBe(true);
    expect(doc.canRedo).toBe(false);
  });

  it('bumps the revision a save watches, so an undo is saved too', () => {
    const doc = new EditorDocument(20, 20);
    paint(doc, 10, 10, 1, 2);
    const revision = doc.maskRevision;

    doc.undo();
    expect(doc.maskRevision).toBe(revision + 1);
    doc.redo();
    expect(doc.maskRevision).toBe(revision + 2);
  });

  it('drops the redo stack when something new is done', () => {
    const doc = new EditorDocument(20, 20);
    doc.addBox(box('a'));
    doc.undo();
    expect(doc.canRedo).toBe(true);

    doc.addBox(box('b'));
    expect(doc.canRedo).toBe(false);
  });

  it('does nothing at either end of the history', () => {
    const doc = new EditorDocument(20, 20);
    doc.undo();
    doc.redo();
    expect(doc.version).toBe(0);
  });

  it('keeps only the most recent hundred steps', () => {
    const doc = new EditorDocument(100, 100);
    for (let i = 0; i < 105; i++) doc.addBox(box(`b${i}`));

    for (let i = 0; i < 200; i++) doc.undo();

    expect(doc.boxes).toHaveLength(5);
  });

  it('keeps the selection when an undone box still exists', () => {
    const doc = new EditorDocument(100, 100);
    doc.addBox(box('a'));
    doc.addBox(box('b'));
    doc.select('a');

    doc.undo();

    expect(doc.selectedId).toBe('a');
  });
});
