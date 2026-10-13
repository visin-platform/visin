import { afterEach, describe, expect, it } from 'vitest';
import { clearDraft, loadDraft, saveDraft, LocalDraft } from './draftStore';

/**
 * Just enough of IndexedDB for the three calls the store makes: one object
 * store, keyed by `taskId`, with requests that answer on a later tick.
 */
const installFakeIndexedDb = (options: { failOpen?: boolean; throwOnTransaction?: boolean; failRequests?: boolean } = {}) => {
  const rows = new Map<string, unknown>();
  const tick = (run: () => void) => setTimeout(run, 0);
  const request = (work: () => unknown) => {
    const result: { result?: unknown; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
    tick(() => {
      if (options.failRequests) {
        result.onerror?.();
        return;
      }
      result.result = work();
      result.onsuccess?.();
    });
    return result;
  };
  const database = {
    transaction: () => {
      if (options.throwOnTransaction) throw new Error('InvalidStateError');
      return {
        objectStore: () => ({
          put: (value: { taskId: string }) => request(() => rows.set(value.taskId, value) && value.taskId),
          get: (key: string) => request(() => rows.get(key)),
          delete: (key: string) => request(() => rows.delete(key))
        })
      };
    },
    close: () => undefined,
    createObjectStore: () => undefined
  };
  const factory = {
    open: () => {
      const result: { result: unknown; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {
        result: database
      };
      tick(() => {
        if (options.failOpen) {
          result.onerror?.();
          return;
        }
        result.onupgradeneeded?.();
        result.onsuccess?.();
      });
      return result;
    }
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = factory;
  return rows;
};

afterEach(() => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

const draft: LocalDraft = {
  taskId: 't1',
  objects: [{ id: 'a', classKey: 'car', bbox: [0, 0, 5, 5], source: 'human' }],
  mask: null,
  savedAt: 1234
};

describe('draftStore', () => {
  it('keeps a draft, reads it back, and removes it', async () => {
    installFakeIndexedDb();

    await saveDraft(draft);
    expect(await loadDraft('t1')).toEqual(draft);
    expect(await loadDraft('t2')).toBeUndefined();

    await clearDraft('t1');
    expect(await loadDraft('t1')).toBeUndefined();
  });

  it('does nothing, and fails nothing, where storage is absent', async () => {
    await expect(saveDraft(draft)).resolves.toBeUndefined();
    await expect(loadDraft('t1')).resolves.toBeUndefined();
    await expect(clearDraft('t1')).resolves.toBeUndefined();
  });

  it('does nothing when the database cannot be opened', async () => {
    installFakeIndexedDb({ failOpen: true });
    await expect(saveDraft(draft)).resolves.toBeUndefined();
    await expect(loadDraft('t1')).resolves.toBeUndefined();
  });

  it('does nothing when a request fails or the transaction throws', async () => {
    installFakeIndexedDb({ failRequests: true });
    await expect(saveDraft(draft)).resolves.toBeUndefined();
    await expect(loadDraft('t1')).resolves.toBeUndefined();

    installFakeIndexedDb({ throwOnTransaction: true });
    await expect(clearDraft('t1')).resolves.toBeUndefined();
  });

  it('does nothing when opening throws', async () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open: () => {
        throw new Error('SecurityError');
      }
    };
    await expect(loadDraft('t1')).resolves.toBeUndefined();
  });
});
