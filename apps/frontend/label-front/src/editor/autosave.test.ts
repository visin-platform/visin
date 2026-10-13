import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@visin/frontend-core';
import { Autosave, AutosaveApi, AutosaveStore } from './autosave';
import { EditorDocument } from './EditorDocument';
import { decodeMaskRle } from './maskCodec';
import type { BoxObject } from '../types';

const box = (id: string): BoxObject => ({ id, classKey: 'car', bbox: [0, 0, 10, 10], source: 'human' });

const setup = (options: { debounceMs?: number } = {}) => {
  const doc = new EditorDocument(10, 10);
  const api = {
    saveObjects: vi.fn(async () => undefined),
    saveMask: vi.fn(async () => undefined),
    clearMask: vi.fn(async () => undefined)
  } satisfies AutosaveApi;
  const store = { save: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) } satisfies AutosaveStore;
  const onStatus = vi.fn();
  const autosave = new Autosave({ taskId: 't1', doc, api, store, debounceMs: 1000, elapsedMs: () => 4200, onStatus, ...options });
  return { doc, api, store, onStatus, autosave };
};

const paint = (doc: EditorDocument) => {
  doc.beginStroke(1);
  doc.strokeTo(5, 5, 2);
  doc.endStroke();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Autosave', () => {
  it('waits for a pause, then sends the boxes once however many changes came', async () => {
    const { doc, api, autosave } = setup();

    doc.addBox(box('a'));
    doc.addBox(box('b'));
    await vi.advanceTimersByTimeAsync(999);
    expect(api.saveObjects).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    expect(api.saveObjects).toHaveBeenCalledTimes(1);
    expect(api.saveObjects).toHaveBeenCalledWith('t1', doc.boxes, 4200);
    expect(api.saveMask).not.toHaveBeenCalled();
    expect(autosave.status).toBe('saved');
  });

  it('sends the mask as run-length bytes, and clears it when nothing is left', async () => {
    const { doc, api } = setup();

    paint(doc);
    await vi.advanceTimersByTimeAsync(1100);
    expect(api.saveMask).toHaveBeenCalledTimes(1);
    const [taskId, bytes] = api.saveMask.mock.calls[0] as unknown as [string, Uint8Array];
    expect(taskId).toBe('t1');
    expect(decodeMaskRle(bytes)!.data.some((value) => value === 1)).toBe(true);
    expect(api.saveObjects).not.toHaveBeenCalled();

    doc.undo();
    await vi.advanceTimersByTimeAsync(1100);
    expect(api.clearMask).toHaveBeenCalledWith('t1');
  });

  it('does not save a live drag, only the finished gesture', async () => {
    const { doc, api } = setup();
    doc.load([box('a')]);

    doc.beginGesture();
    doc.previewBox('a', [3, 3, 10, 10]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.saveObjects).not.toHaveBeenCalled();

    doc.commitGesture();
    await vi.advanceTimersByTimeAsync(1100);
    expect(api.saveObjects).toHaveBeenCalledTimes(1);
  });

  it('keeps a copy on this device at once, and removes it when the server has the work', async () => {
    const { doc, store } = setup();

    doc.addBox(box('a'));
    expect(store.save).toHaveBeenCalledTimes(1);
    const draft = (store.save.mock.calls[0] as unknown as [{ taskId: string; objects: unknown[]; mask?: unknown }])[0];
    expect(draft).toMatchObject({ taskId: 't1', objects: [{ id: 'a' }] });
    expect(draft).not.toHaveProperty('mask');

    await vi.advanceTimersByTimeAsync(1100);
    expect(store.clear).toHaveBeenCalledWith('t1');
  });

  it('keeps the mask in the local copy when it changed, and null when it was cleared', async () => {
    const { doc, store } = setup();

    paint(doc);
    const withMask = (store.save.mock.calls[0] as unknown as [{ mask: Uint8Array }])[0];
    expect(withMask.mask).toBeInstanceOf(Uint8Array);
    await vi.advanceTimersByTimeAsync(1100);

    doc.undo();
    const cleared = (store.save.mock.calls.at(-1) as unknown as [{ mask: unknown }])[0];
    expect(cleared.mask).toBeNull();
  });

  it('flush sends everything now', async () => {
    const { doc, api, autosave } = setup();
    doc.addBox(box('a'));
    paint(doc);

    expect(await autosave.flush()).toBe(true);

    expect(api.saveObjects).toHaveBeenCalledTimes(1);
    expect(api.saveMask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.saveObjects).toHaveBeenCalledTimes(1);
  });

  it('sends a change made during a request after it returns, never alongside it', async () => {
    const { doc, api, autosave } = setup();
    let release: () => void = () => undefined;
    api.saveObjects.mockImplementationOnce(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined))));
    doc.addBox(box('a'));

    const first = autosave.flush();
    await Promise.resolve();
    doc.addBox(box('b'));
    expect(api.saveObjects).toHaveBeenCalledTimes(1);
    release();
    await first;

    expect(api.saveObjects).toHaveBeenCalledTimes(2);
    expect((api.saveObjects.mock.calls[1] as unknown as [string, BoxObject[]])[1]).toHaveLength(2);
  });

  it('shares one running send between callers that flush together', async () => {
    const { doc, api, autosave } = setup();
    doc.addBox(box('a'));

    const [a, b] = await Promise.all([autosave.flush(), autosave.flush()]);

    expect(a && b).toBe(true);
    expect(api.saveObjects).toHaveBeenCalledTimes(1);
  });

  it('keeps the work and retries with backoff when the network fails', async () => {
    const { doc, api, autosave, onStatus } = setup();
    api.saveObjects.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    doc.addBox(box('a'));

    expect(await autosave.flush()).toBe(false);
    expect(autosave.status).toBe('offline');
    expect(onStatus).toHaveBeenCalledWith('offline', undefined);

    await vi.advanceTimersByTimeAsync(2100);
    expect(api.saveObjects).toHaveBeenCalledTimes(2);
    expect(autosave.status).toBe('offline');

    await vi.advanceTimersByTimeAsync(4100);
    expect(api.saveObjects).toHaveBeenCalledTimes(3);
    expect(autosave.status).toBe('saved');
  });

  it('retries a server that asks for patience, but not one that refuses', async () => {
    const { doc, api, autosave, onStatus } = setup();
    api.saveObjects.mockRejectedValueOnce(new ApiError(429, 'slow down'));
    doc.addBox(box('a'));

    expect(await autosave.flush()).toBe(false);
    expect(autosave.status).toBe('offline');

    api.saveObjects.mockRejectedValue(new ApiError(409, 'Job is paused, not accepting labels'));
    await vi.advanceTimersByTimeAsync(2100);

    expect(autosave.status).toBe('error');
    expect(onStatus).toHaveBeenLastCalledWith('error', 'Job is paused, not accepting labels');
    const calls = api.saveObjects.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.saveObjects.mock.calls.length).toBe(calls);
  });

  it('treats a 5xx like a lost connection', async () => {
    const { doc, api, autosave } = setup();
    api.saveObjects.mockRejectedValueOnce(new ApiError(503, 'unavailable'));
    doc.addBox(box('a'));

    expect(await autosave.flush()).toBe(false);
    expect(autosave.status).toBe('offline');
  });

  it('markDirty sends what was restored from a local copy', async () => {
    const { doc, api, autosave } = setup();
    doc.load([box('a')], Uint8Array.from({ length: 100 }, (_, i) => (i === 0 ? 1 : 0)));

    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(1100);

    expect(api.saveObjects).toHaveBeenCalledTimes(1);
    expect(api.saveMask).toHaveBeenCalledTimes(1);
  });

  it('markDirty leaves the mask alone when there is none', async () => {
    const { doc, api, autosave } = setup();
    doc.load([box('a')], null);

    autosave.markDirty();
    await vi.advanceTimersByTimeAsync(1100);

    expect(api.saveObjects).toHaveBeenCalledTimes(1);
    expect(api.saveMask).not.toHaveBeenCalled();
    expect(api.clearMask).not.toHaveBeenCalled();
  });

  it('makes one last attempt when disposed with work unsent, then stops', async () => {
    const { doc, api, store, autosave } = setup();
    doc.addBox(box('a'));

    autosave.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveObjects).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledWith('t1');

    doc.addBox(box('b'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.saveObjects).toHaveBeenCalledTimes(1);
  });

  it('does not retry the last attempt when it fails, leaving the work in the local store', async () => {
    const { doc, api, store, autosave } = setup();
    api.saveObjects.mockRejectedValue(new TypeError('Failed to fetch'));
    doc.addBox(box('a'));

    autosave.dispose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(api.saveObjects).toHaveBeenCalledTimes(1);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('sends nothing when disposed with nothing unsent', async () => {
    const { api, autosave } = setup();

    autosave.dispose();
    await vi.advanceTimersByTimeAsync(5000);

    expect(api.saveObjects).not.toHaveBeenCalled();
    expect(await autosave.flush()).toBe(true);
  });

  describe('a copy of another annotator’s labels', () => {
    const copied = () => {
      const doc = new EditorDocument(10, 10);
      doc.load([box('theirs')], Uint8Array.from({ length: 100 }, (_, i) => (i < 5 ? 2 : 0)));
      const api = {
        saveObjects: vi.fn(async () => undefined),
        saveMask: vi.fn(async () => undefined),
        clearMask: vi.fn(async () => undefined)
      };
      const store = { save: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) };
      const autosave = new Autosave({ taskId: 't1', doc, api, store, debounceMs: 1000, adoptOnChange: true });
      return { doc, api, autosave };
    };

    it('is not saved while the annotator only looks', async () => {
      const { api, autosave } = copied();

      expect(await autosave.flush()).toBe(true);
      await vi.advanceTimersByTimeAsync(5000);

      expect(api.saveObjects).not.toHaveBeenCalled();
      expect(api.saveMask).not.toHaveBeenCalled();
    });

    it('is saved whole, mask included, on the first edit', async () => {
      const { doc, api } = copied();

      doc.addBox(box('mine'));
      await vi.advanceTimersByTimeAsync(1100);

      expect((api.saveObjects.mock.calls[0] as unknown as [string, BoxObject[]])[1].map((entry) => entry.id)).toEqual(['theirs', 'mine']);
      expect(api.saveMask).toHaveBeenCalledTimes(1);
    });

    it('is saved whole when adopted unchanged, as Done does', async () => {
      const { api, autosave } = copied();

      autosave.adopt();
      await autosave.flush();
      autosave.adopt();
      await autosave.flush();

      expect(api.saveObjects).toHaveBeenCalledTimes(1);
      expect(api.saveMask).toHaveBeenCalledTimes(1);
    });

    it('has no mask to clear when the copy had none', async () => {
      const doc = new EditorDocument(10, 10);
      doc.load([box('theirs')], null);
      const api = {
        saveObjects: vi.fn(async () => undefined),
        saveMask: vi.fn(async () => undefined),
        clearMask: vi.fn(async () => undefined)
      };
      const autosave = new Autosave({
        taskId: 't1',
        doc,
        api,
        store: { save: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) },
        adoptOnChange: true
      });

      autosave.adopt();
      await autosave.flush();

      expect(api.saveObjects).toHaveBeenCalledTimes(1);
      expect(api.clearMask).not.toHaveBeenCalled();
    });
  });

  it('ignores a notification that changed nothing worth saving', async () => {
    const { doc, api } = setup();
    doc.addBox(box('a'));
    await vi.advanceTimersByTimeAsync(1100);
    api.saveObjects.mockClear();

    doc.select('a');
    doc.select(null);
    await vi.advanceTimersByTimeAsync(5000);

    expect(api.saveObjects).not.toHaveBeenCalled();
  });
});
