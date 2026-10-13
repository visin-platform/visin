import type { BoxObject } from '../types';

/**
 * Unsent work, kept on this device until the server has it.
 *
 * Autosave covers a slow connection; this covers a closed tab or a dropped one.
 * Every change is written here at once, and the entry is removed when the server
 * confirms. Storage can be absent or throw (a private window, blocked site
 * data), so every call swallows its failure and the editor works without it.
 */
export interface LocalDraft {
  taskId: string;
  objects: BoxObject[];
  /** the mask in `maskCodec` form; null when the annotator cleared it, absent when it never changed */
  mask?: Uint8Array | null;
  savedAt: number;
}

const DB_NAME = 'visin-label';
const STORE = 'drafts';

const open = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'taskId' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
  const db = await open();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve) => {
    try {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        resolve(undefined);
      };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
};

export const saveDraft = async (draft: LocalDraft): Promise<void> => {
  await run('readwrite', (store) => store.put(draft));
};

export const loadDraft = async (taskId: string): Promise<LocalDraft | undefined> =>
  (await run<LocalDraft | undefined>('readonly', (store) => store.get(taskId) as IDBRequest<LocalDraft | undefined>)) ?? undefined;

export const clearDraft = async (taskId: string): Promise<void> => {
  await run('readwrite', (store) => store.delete(taskId));
};
