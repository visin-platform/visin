import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  saveObjects: vi.fn(async () => undefined),
  saveMask: vi.fn(async () => undefined),
  clearMask: vi.fn(async () => undefined)
}));
vi.mock('./imageLoader', () => ({ loadMask: vi.fn() }));
vi.mock('./draftStore', () => ({
  loadDraft: vi.fn(async () => undefined),
  saveDraft: vi.fn(async () => undefined),
  clearDraft: vi.fn(async () => undefined)
}));

import { clearMask, saveMask, saveObjects } from '../services/jobService';
import { loadMask } from './imageLoader';
import { loadDraft } from './draftStore';
import { encodeMaskRle } from './maskCodec';
import { useFrameDocument } from './useFrameDocument';
import { box, makeItem } from '../test/fixtures';
import type { WorkItem } from '../types';

const mask = loadMask as ReturnType<typeof vi.fn>;
const draft = loadDraft as ReturnType<typeof vi.fn>;

const WIDTH = 4;
const HEIGHT = 2;

const withMask = (extra: Partial<WorkItem['annotation']['mine']> = {}): WorkItem =>
  makeItem('t1', {
    images: { frame: { url: 'https://files.example.test/t1.jpg', width: WIDTH, height: HEIGHT, stem: 'a' }, sensors: [] },
    annotation: {
      count: 0,
      mine: {
        status: 'draft',
        objects: [box('o1', [0, 0, 2, 2])],
        mask: { url: 'https://files.example.test/m.png', width: WIDTH, height: HEIGHT },
        updatedAt: '2026-10-01T00:00:00Z',
        ...extra
      },
      latest: null
    }
  });

const open = (item: WorkItem | null, readOnly = false) =>
  renderHook(({ current }) => useFrameDocument(current, { readOnly }), { initialProps: { current: item } });

beforeEach(() => {
  vi.clearAllMocks();
  mask.mockResolvedValue({ width: WIDTH, height: HEIGHT, data: Uint8Array.from([0, 1, 1, 0, 0, 0, 0, 0]) });
  draft.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opening a frame', () => {
  it('starts empty on a frame nobody has labeled', async () => {
    const { result } = open(makeItem('t1', { images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] } }));

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.boxes).toEqual([]);
    expect(result.current.openedFrom).toBe('empty');
    expect(result.current.loading).toBe(false);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('opens with the annotator’s own boxes and mask', async () => {
    const { result } = open(withMask());

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.boxes).toHaveLength(1);
    expect(Array.from(result.current.doc!.mask.subarray(0, 3))).toEqual([0, 1, 1]);
    expect(result.current.openedFrom).toBe('mine');
    expect(mask).toHaveBeenCalledWith('https://files.example.test/m.png');
  });

  it('shows the latest finished labels when the annotator has none of their own', async () => {
    const item = makeItem('t1', {
      images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] },
      annotation: {
        count: 1,
        mine: null,
        latest: { status: 'done', objects: [box('x')], updatedAt: '2026-10-01T00:00:00Z' }
      }
    });

    const { result } = open(item);

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.openedFrom).toBe('latest');
    expect(result.current.doc!.boxes).toHaveLength(1);
  });

  it('starts an annotator on an independent job from nothing, not from someone else’s labels', async () => {
    const item = makeItem('t1', {
      images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] },
      annotation: { count: 1, mine: null, latest: { status: 'done', objects: [box('x')], updatedAt: '2026-10-01T00:00:00Z' } }
    });

    const { result } = renderHook(() => useFrameDocument(item, { readOnly: false, independent: true }));

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.boxes).toEqual([]);
    expect(result.current.openedFrom).toBe('empty');
  });

  it('lets a viewer of an independent job still see the latest labels', async () => {
    const item = makeItem('t1', {
      images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] },
      annotation: { count: 1, mine: null, latest: { status: 'done', objects: [box('x')], updatedAt: '2026-10-01T00:00:00Z' } }
    });

    const { result } = renderHook(() => useFrameDocument(item, { readOnly: true, independent: true }));

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.openedFrom).toBe('latest');
  });

  it('saves a copy of the latest labels as the annotator’s own when they finish it', async () => {
    const item = makeItem('t1', {
      images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] },
      annotation: { count: 1, mine: null, latest: { status: 'done', objects: [box('x')], updatedAt: '2026-10-01T00:00:00Z' } }
    });
    const { result } = open(item);
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    await act(async () => {
      await result.current.flush();
    });
    expect(saveObjects).not.toHaveBeenCalled();

    act(() => result.current.adoptCopy());
    await act(async () => {
      await result.current.flush();
    });
    expect(saveObjects).toHaveBeenCalledWith('t1', [expect.objectContaining({ id: 'x' })], expect.any(Number));
  });

  it('adopting does nothing for a viewer', async () => {
    const { result } = open(withMask(), true);
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    act(() => result.current.adoptCopy());
    expect(saveObjects).not.toHaveBeenCalled();
  });

  it('refuses a stored mask that is not the frame’s size, rather than overwrite it with the wrong one', async () => {
    mask.mockResolvedValue({ width: 9, height: 9, data: new Uint8Array(81) });

    const { result } = open(withMask());

    await waitFor(() => expect(result.current.error).toBe('The saved mask does not match this frame'));
    expect(result.current.doc).toBeNull();
  });

  it('reports a mask that cannot be loaded', async () => {
    mask.mockRejectedValue(new Error('Failed to load mask (403)'));

    const { result } = open(withMask());

    await waitFor(() => expect(result.current.error).toBe('Failed to load mask (403)'));
  });

  it('measures a frame the dataset gave no size for', async () => {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 640;
        naturalHeight = 480;
        onload: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => this.onload?.(), 0);
        }
      }
    );
    const item = makeItem('t1', { images: { frame: { url: 'https://files.example.test/t1.jpg' }, sensors: [] } });

    const { result } = open(item);

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.width).toBe(640);
    expect(result.current.doc!.height).toBe(480);
  });

  it('waits for a frame, and reads nothing when there is none', () => {
    const { result } = open(null);
    expect(result.current.doc).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('builds a new document for a new task, and keeps the one it has when only the item changes', async () => {
    const first = withMask();
    const { result, rerender } = open(first);
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    const doc = result.current.doc;

    rerender({ current: { ...first, annotation: { ...first.annotation, count: 3 } } });
    expect(result.current.doc).toBe(doc);

    rerender({ current: makeItem('t2', { images: { frame: { url: 'u2', width: WIDTH, height: HEIGHT }, sensors: [] } }) });
    await waitFor(() => expect(result.current.doc).not.toBe(doc));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
  });
});

describe('autosave and drafts', () => {
  it('sends a restored mask deletion to the server before clearing the local draft', async () => {
    draft.mockResolvedValue({ taskId: 't1', objects: [], mask: null, savedAt: Date.parse('2026-10-02T00:00:00Z') });
    const { result } = open(withMask());
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.hasMask).toBe(false);
    await act(async () => { expect(await result.current.flush()).toBe(true); });
    expect(clearMask).toHaveBeenCalledWith('t1');
  });
  it('sends edits through the service and reports the status', async () => {
    const { result } = open(withMask());
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    act(() => result.current.doc!.addBox(box('new', [1, 1, 2, 1])));
    let ok = false;
    await act(async () => {
      ok = await result.current.flush();
    });

    expect(ok).toBe(true);
    expect(saveObjects).toHaveBeenCalledWith('t1', expect.arrayContaining([expect.objectContaining({ id: 'new' })]), expect.any(Number));
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.elapsedMs()).toBeGreaterThanOrEqual(0);
  });

  it('restores a draft that is newer than the server’s copy, and sends it', async () => {
    draft.mockResolvedValue({
      taskId: 't1',
      objects: [box('local-1'), box('local-2')],
      mask: encodeMaskRle(WIDTH, HEIGHT, Uint8Array.from([2, 2, 2, 2, 0, 0, 0, 0])),
      savedAt: Date.parse('2026-10-02T00:00:00Z')
    });

    const { result } = open(withMask());

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.boxes.map((entry) => entry.id)).toEqual(['local-1', 'local-2']);
    expect(result.current.doc!.mask[0]).toBe(2);
    await act(async () => {
      await result.current.flush();
    });
    expect(saveObjects).toHaveBeenCalled();
    expect(saveMask).toHaveBeenCalled();
  });

  it('keeps the server’s mask when the draft never touched it, and drops it when the draft cleared it', async () => {
    draft.mockResolvedValue({ taskId: 't1', objects: [box('local')], savedAt: Date.parse('2026-10-02T00:00:00Z') });
    const kept = open(withMask());
    await waitFor(() => expect(kept.result.current.doc).not.toBeNull());
    expect(kept.result.current.doc!.hasMask).toBe(true);

    draft.mockResolvedValue({ taskId: 't1', objects: [], mask: null, savedAt: Date.parse('2026-10-02T00:00:00Z') });
    const cleared = open(withMask());
    await waitFor(() => expect(cleared.result.current.doc).not.toBeNull());
    expect(cleared.result.current.doc!.hasMask).toBe(false);
  });

  it('ignores a draft older than what the server holds', async () => {
    draft.mockResolvedValue({ taskId: 't1', objects: [box('stale')], savedAt: Date.parse('2026-09-01T00:00:00Z') });

    const { result } = open(withMask());

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.boxes.map((entry) => entry.id)).toEqual(['o1']);
  });

  it('restores a draft on a frame the server has no labels for', async () => {
    draft.mockResolvedValue({
      taskId: 't1',
      objects: [box('local')],
      mask: encodeMaskRle(WIDTH, HEIGHT, new Uint8Array(8).fill(1)),
      savedAt: 5
    });
    const { result } = open(makeItem('t1', { images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] } }));

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.doc!.boxes[0].id).toBe('local');
    expect(result.current.doc!.hasMask).toBe(true);
  });

  it('falls back to the server mask when the draft’s mask is unreadable', async () => {
    draft.mockResolvedValue({
      taskId: 't1',
      objects: [],
      mask: Uint8Array.from([1, 2, 3]),
      savedAt: Date.parse('2026-10-02T00:00:00Z')
    });

    const { result } = open(withMask());

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(Array.from(result.current.doc!.mask.subarray(0, 3))).toEqual([0, 1, 1]);
  });

  it('does not save or read drafts for a viewer, and has nothing to flush', async () => {
    const { result } = open(withMask(), true);
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    act(() => result.current.doc!.addBox(box('x')));

    expect(draft).not.toHaveBeenCalled();
    expect(await result.current.flush()).toBe(true);
    expect(saveObjects).not.toHaveBeenCalled();
  });
});

describe('suggestions', () => {
  const suggested = (): WorkItem =>
    makeItem('t1', {
      images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] },
      suggestions: {
        objects: [box('s1', [0, 0, 2, 2], { source: 'import' }), box('s2', [2, 0, 2, 2], { source: 'import' })],
        mask: { url: 'https://files.example.test/s.png', width: WIDTH, height: HEIGHT }
      }
    });

  it('offers them on a frame the annotator has not started, loading the mask behind the boxes', async () => {
    mask.mockResolvedValue({ width: WIDTH, height: HEIGHT, data: Uint8Array.from([3, 3, 0, 0, 0, 0, 0, 0]) });

    const { result } = open(suggested());

    await waitFor(() => expect(result.current.suggestions?.mask ?? null).not.toBeNull());
    expect(result.current.suggestions!.boxes).toHaveLength(2);
  });

  it('accepts one box as the annotator’s own, and leaves the rest waiting', async () => {
    const { result } = open(suggested());
    await waitFor(() => expect(result.current.suggestions).not.toBeNull());
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    act(() => result.current.acceptSuggestion('s1'));

    expect(result.current.doc!.boxes.map((entry) => entry.id)).toEqual(['s1']);
    expect(result.current.suggestions!.boxes.map((entry) => entry.id)).toEqual(['s2']);

    act(() => result.current.acceptSuggestion('missing'));
    expect(result.current.doc!.boxes).toHaveLength(1);
  });

  it('accepts everything: the boxes, and the mask where nothing is painted', async () => {
    mask.mockResolvedValue({ width: WIDTH, height: HEIGHT, data: Uint8Array.from([3, 3, 0, 0, 0, 0, 0, 0]) });
    const { result } = open(suggested());
    await waitFor(() => expect(result.current.suggestions?.mask ?? null).not.toBeNull());

    act(() => result.current.acceptAllSuggestions());

    expect(result.current.doc!.boxes).toHaveLength(2);
    expect(Array.from(result.current.doc!.mask.subarray(0, 3))).toEqual([3, 3, 0]);
    expect(result.current.suggestions).toBeNull();
  });

  it('dismisses them', async () => {
    const { result } = open(suggested());
    await waitFor(() => expect(result.current.suggestions).not.toBeNull());

    act(() => result.current.dismissSuggestions());

    expect(result.current.suggestions).toBeNull();
    expect(result.current.doc!.boxes).toEqual([]);
  });

  it('does not offer them once the annotator has labels of their own', async () => {
    const item = { ...withMask(), suggestions: { objects: [box('s1')], mask: undefined } };

    const { result } = open(item);

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.suggestions).toBeNull();
  });

  it('does not offer them where a draft was restored', async () => {
    draft.mockResolvedValue({ taskId: 't1', objects: [box('local')], savedAt: 1 });

    const { result } = open(suggested());

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.suggestions).toBeNull();
  });

  it('works without the suggested mask when it cannot be loaded or is the wrong size', async () => {
    mask.mockRejectedValueOnce(new Error('nope'));
    const failed = open(suggested());
    await waitFor(() => expect(failed.result.current.suggestions).not.toBeNull());
    expect(failed.result.current.suggestions!.mask).toBeNull();

    mask.mockResolvedValueOnce({ width: 9, height: 9, data: new Uint8Array(81) });
    const wrong = open(suggested());
    await waitFor(() => expect(wrong.result.current.suggestions).not.toBeNull());
    await act(async () => undefined);
    expect(wrong.result.current.suggestions!.mask).toBeNull();
  });

  it('accepting does nothing before the document has loaded', () => {
    const { result } = open(null);
    act(() => {
      result.current.acceptSuggestion('s1');
      result.current.acceptAllSuggestions();
    });
    expect(result.current.doc).toBeNull();
  });
});

describe('model suggestions', () => {
  const empty = () => makeItem('t1', { images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] } });

  it('shows a model’s boxes on a frame with nothing waiting, and accepting one keeps saying a model drew it', async () => {
    const { result } = open(empty());
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    act(() => result.current.setModelSuggestions([box('m1', [0, 0, 2, 2], { source: 'model', score: 0.8 })]));
    expect(result.current.suggestions!.boxes).toHaveLength(1);

    act(() => result.current.acceptSuggestion('m1'));
    expect(result.current.doc!.boxes[0]).toMatchObject({ id: 'm1', source: 'model', score: 0.8 });
  });

  it('replaces the model’s earlier boxes and keeps an import’s', async () => {
    const item = makeItem('t1', {
      images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] },
      suggestions: { objects: [box('i1', [0, 0, 2, 2], { source: 'import' })], mask: undefined }
    });
    const { result } = open(item);
    await waitFor(() => expect(result.current.suggestions).not.toBeNull());

    act(() => result.current.setModelSuggestions([box('m1', [1, 1, 2, 1], { source: 'model' })]));
    act(() => result.current.setModelSuggestions([box('m2', [2, 0, 2, 2], { source: 'model' })]));

    expect(result.current.suggestions!.boxes.map((entry) => entry.id)).toEqual(['i1', 'm2']);
  });

  it('clears when the model has nothing and nothing else is waiting', async () => {
    const { result } = open(empty());
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    act(() => result.current.setModelSuggestions([box('m1', [0, 0, 2, 2], { source: 'model' })]));

    act(() => result.current.setModelSuggestions([]));

    expect(result.current.suggestions).toBeNull();
  });

  it('keeps a suggested mask when the model’s boxes change', async () => {
    mask.mockResolvedValue({ width: WIDTH, height: HEIGHT, data: Uint8Array.from([3, 3, 0, 0, 0, 0, 0, 0]) });
    const item = makeItem('t1', {
      images: { frame: { url: 'u', width: WIDTH, height: HEIGHT }, sensors: [] },
      suggestions: { objects: [], mask: { url: 'https://files.example.test/s.png', width: WIDTH, height: HEIGHT } }
    });
    const { result } = open(item);
    await waitFor(() => expect(result.current.suggestions?.mask ?? null).not.toBeNull());

    act(() => result.current.setModelSuggestions([]));

    expect(result.current.suggestions?.mask).not.toBeNull();
  });
});
