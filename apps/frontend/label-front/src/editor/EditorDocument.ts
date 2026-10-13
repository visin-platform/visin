import type { BoxObject } from '../types';

/**
 * Everything an annotator has drawn on one frame, and the undo history of it.
 *
 * A plain class rather than React state: a brush stroke changes thousands of
 * pixels per pointer move, and routing that through a reducer would copy a
 * two-megabyte mask each time. The mask is mutated in place; components
 * subscribe to `version` and repaint only the rectangle that changed.
 */

export interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Entry =
  | { kind: 'boxes'; before: BoxObject[]; after: BoxObject[] }
  | { kind: 'mask'; index: Uint32Array; before: Uint8Array; after: Uint8Array };

const HISTORY_LIMIT = 100;

const growable = () => ({ values: new Uint32Array(1024), length: 0 });

export class EditorDocument {
  readonly width: number;
  readonly height: number;
  boxes: BoxObject[] = [];
  selectedId: string | null = null;
  /** bumps on every change, including live drags — what a view subscribes to */
  version = 0;
  /** bump only on a change worth saving: a finished gesture, not each pointer move */
  boxRevision = 0;
  maskRevision = 0;

  private maskData: Uint8Array | null = null;
  private labeled = 0;
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private listeners = new Set<() => void>();
  private dirty: DirtyRect | null = null;

  private gestureBefore: BoxObject[] | null = null;

  private stroke: {
    value: number;
    overwrite: boolean;
    seen: Uint8Array;
    index: ReturnType<typeof growable>;
    before: ReturnType<typeof growable>;
  } | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  // --- subscription -------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  private changed(): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  // --- loading ------------------------------------------------------------

  /** Replace everything with stored labels. Not undoable: it is the starting point. */
  load(boxes: BoxObject[], mask?: Uint8Array | null): void {
    this.boxes = boxes.map((box) => ({ ...box, bbox: [...box.bbox] as BoxObject['bbox'] }));
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.gestureBefore = null;
    this.stroke = null;
    this.maskData = null;
    this.labeled = 0;
    if (mask && mask.length === this.width * this.height) {
      this.maskData = Uint8Array.from(mask);
      for (let i = 0; i < this.maskData.length; i++) if (this.maskData[i] !== 0) this.labeled++;
    }
    this.dirty = { x0: 0, y0: 0, x1: this.width, y1: this.height };
    this.changed();
  }

  // --- reading ------------------------------------------------------------

  /** The mask's class index per pixel, row by row; zeros when nothing has been painted. */
  get mask(): Uint8Array {
    return this.ensureMask();
  }

  get hasMask(): boolean {
    return this.labeled > 0;
  }

  private ensureMask(): Uint8Array {
    if (!this.maskData) this.maskData = new Uint8Array(this.width * this.height);
    return this.maskData;
  }

  /** The area repainted since the last call, or null. */
  takeDirty(): DirtyRect | null {
    const dirty = this.dirty;
    this.dirty = null;
    return dirty;
  }

  private markDirty(x0: number, y0: number, x1: number, y1: number): void {
    this.dirty = this.dirty
      ? { x0: Math.min(this.dirty.x0, x0), y0: Math.min(this.dirty.y0, y0), x1: Math.max(this.dirty.x1, x1), y1: Math.max(this.dirty.y1, y1) }
      : { x0, y0, x1, y1 };
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // --- boxes --------------------------------------------------------------

  select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.changed();
  }

  private push(entry: Entry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private setBoxes(boxes: BoxObject[], record: boolean): void {
    if (record) this.push({ kind: 'boxes', before: this.boxes, after: boxes });
    this.boxes = boxes;
    this.boxRevision += 1;
    this.changed();
  }

  addBox(box: BoxObject): void {
    this.selectedId = box.id;
    this.setBoxes([...this.boxes, box], true);
  }

  deleteBox(id: string): void {
    if (!this.boxes.some((box) => box.id === id)) return;
    if (this.selectedId === id) this.selectedId = null;
    this.setBoxes(
      this.boxes.filter((box) => box.id !== id),
      true
    );
  }

  setBoxClass(id: string, classKey: string): void {
    const box = this.boxes.find((candidate) => candidate.id === id);
    if (!box || box.classKey === classKey) return;
    // A class changed by hand is a person's decision, whatever drew the box first.
    this.setBoxes(
      this.boxes.map((candidate) => (candidate.id === id ? { ...candidate, classKey, source: 'human' as const } : candidate)),
      true
    );
  }

  /** Start a drag: moves and resizes preview live and become one undo step on `commitGesture`. */
  beginGesture(): void {
    this.gestureBefore = this.boxes;
  }

  previewBox(id: string, bbox: BoxObject['bbox']): void {
    this.boxes = this.boxes.map((box) => (box.id === id ? { ...box, bbox } : box));
    this.changed();
  }

  commitGesture(): void {
    const before = this.gestureBefore;
    this.gestureBefore = null;
    if (!before) return;
    const same =
      before.length === this.boxes.length &&
      before.every((box, i) => box.bbox.every((value, k) => value === this.boxes[i].bbox[k]));
    if (same) return;
    // Moving a box is also a person taking responsibility for it.
    const edited = this.boxes.map((box, i) =>
      box.bbox.some((value, k) => value !== before[i]?.bbox[k]) && box.source !== 'human' ? { ...box, source: 'human' as const } : box
    );
    this.push({ kind: 'boxes', before, after: edited });
    this.boxes = edited;
    this.boxRevision += 1;
    this.changed();
  }

  cancelGesture(): void {
    if (!this.gestureBefore) return;
    this.boxes = this.gestureBefore;
    this.gestureBefore = null;
    this.changed();
  }

  /** Boxes that were suggestions become the annotator's own, as one undo step. */
  addBoxes(boxes: BoxObject[]): void {
    if (boxes.length === 0) return;
    this.setBoxes([...this.boxes, ...boxes], true);
  }

  // --- mask ---------------------------------------------------------------

  /**
   * Begin a stroke that paints `value` (0 erases). Unless `overwrite`, pixels
   * already given another class are left alone, so painting near an edge cannot
   * eat the neighbour.
   */
  beginStroke(value: number, overwrite = false): void {
    this.ensureMask();
    this.stroke = {
      value,
      overwrite,
      seen: new Uint8Array(this.width * this.height),
      index: growable(),
      before: growable()
    };
  }

  /** Stamp a disc of `radius` frame pixels at a point, joined to the previous stamp so fast strokes have no gaps. */
  strokeTo(x: number, y: number, radius: number, fromX = x, fromY = y): void {
    const stroke = this.stroke;
    if (!stroke) return;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - fromX, y - fromY) / Math.max(1, radius / 2)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      this.stamp(fromX + (x - fromX) * t, fromY + (y - fromY) * t, radius, stroke);
    }
  }

  private stamp(cx: number, cy: number, radius: number, stroke: NonNullable<EditorDocument['stroke']>): void {
    const mask = this.ensureMask();
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        const current = mask[i];
        if (current === stroke.value) continue;
        if (!stroke.overwrite && stroke.value !== 0 && current !== 0) continue;
        if (!stroke.seen[i]) {
          stroke.seen[i] = 1;
          this.append(stroke.index, i);
          this.append(stroke.before, current);
        }
        mask[i] = stroke.value;
        if (current === 0) this.labeled++;
        else if (stroke.value === 0) this.labeled--;
        touched = true;
      }
    }
    if (touched) {
      this.markDirty(x0, y0, x1 + 1, y1 + 1);
      this.changed();
    }
  }

  private append(list: ReturnType<typeof growable>, value: number): void {
    if (list.length === list.values.length) {
      const bigger = new Uint32Array(list.values.length * 2);
      bigger.set(list.values);
      list.values = bigger;
    }
    list.values[list.length++] = value;
  }

  endStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke || stroke.index.length === 0) return;
    const index = stroke.index.values.slice(0, stroke.index.length);
    const before = Uint8Array.from(stroke.before.values.slice(0, stroke.before.length));
    const mask = this.ensureMask();
    const after = new Uint8Array(index.length);
    for (let k = 0; k < index.length; k++) after[k] = mask[index[k]];
    this.push({ kind: 'mask', index, before, after });
    this.maskRevision += 1;
    this.changed();
  }

  /**
   * Paint every non-zero pixel of `source` as one undo step, as `value` — or as
   * the source's own value when `value` is null. Pixels already given another
   * class are left alone unless `overwrite`, so a suggestion or a SAM result
   * never eats what the annotator drew.
   */
  paintMask(source: Uint8Array, value: number | null = null, overwrite = false): void {
    if (source.length !== this.width * this.height) return;
    this.beginStroke(0, true);
    const mask = this.ensureMask();
    const stroke = this.stroke!;
    let minY = this.height;
    let maxY = -1;
    for (let i = 0; i < source.length; i++) {
      if (source[i] === 0) continue;
      const target = value ?? source[i];
      const current = mask[i];
      if (current === target || (!overwrite && current !== 0)) continue;
      stroke.seen[i] = 1;
      this.append(stroke.index, i);
      this.append(stroke.before, current);
      mask[i] = target;
      if (current === 0) this.labeled++;
      const y = Math.floor(i / this.width);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxY >= 0) this.markDirty(0, minY, this.width, maxY + 1);
    this.endStroke();
  }

  /** Fill pixels from another class-index mask, only where nothing is painted yet. */
  applyMask(source: Uint8Array): void {
    this.paintMask(source, null, false);
  }

  // --- history ------------------------------------------------------------

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(entry);
    this.apply(entry, 'before');
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    this.apply(entry, 'after');
  }

  private apply(entry: Entry, direction: 'before' | 'after'): void {
    if (entry.kind === 'boxes') {
      this.boxes = entry[direction];
      if (this.selectedId && !this.boxes.some((box) => box.id === this.selectedId)) this.selectedId = null;
      this.boxRevision += 1;
    } else {
      const mask = this.ensureMask();
      const values = entry[direction];
      let minY = this.height;
      let maxY = -1;
      for (let k = 0; k < entry.index.length; k++) {
        const i = entry.index[k];
        const was = mask[i];
        const next = values[k];
        if (was === 0 && next !== 0) this.labeled++;
        else if (was !== 0 && next === 0) this.labeled--;
        mask[i] = next;
        const y = Math.floor(i / this.width);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (maxY >= 0) this.markDirty(0, minY, this.width, maxY + 1);
      this.maskRevision += 1;
    }
    this.changed();
  }
}
