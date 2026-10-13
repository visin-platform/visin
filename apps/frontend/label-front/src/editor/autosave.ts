import { ApiError } from '@visin/frontend-core';
import type { EditorDocument } from './EditorDocument';
import { encodeMaskRle } from './maskCodec';
import type { LocalDraft } from './draftStore';

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'error';

export interface AutosaveApi {
  saveObjects: (taskId: string, objects: EditorDocument['boxes'], elapsedMs?: number) => Promise<void>;
  saveMask: (taskId: string, bytes: Uint8Array) => Promise<void>;
  clearMask: (taskId: string) => Promise<void>;
}

export interface AutosaveStore {
  save: (draft: LocalDraft) => Promise<void>;
  clear: (taskId: string) => Promise<void>;
}

export interface AutosaveOptions {
  taskId: string;
  doc: EditorDocument;
  api: AutosaveApi;
  store: AutosaveStore;
  /** how long to wait after the last change before sending */
  debounceMs?: number;
  /** longest wait between retries while offline */
  maxRetryMs?: number;
  elapsedMs?: () => number;
  onStatus?: (status: SaveStatus, message?: string) => void;
  /**
   * The document was opened with someone else's labels. The first edit makes it
   * the annotator's own, and then all of it is sent — boxes and mask — not just
   * the part that changed.
   */
  adoptOnChange?: boolean;
}

/**
 * Sends an editor document to the server as it changes, and keeps going.
 *
 * Boxes and the mask are saved separately (one is JSON, the other run-length
 * bytes), but one at a time and always the latest: a change made while a request
 * is in flight is sent when it returns, never in parallel with it, so an older
 * request cannot land after a newer one. A network failure keeps the work and
 * retries with backoff; a refusal by the server (the job was paused, access was
 * withdrawn) stops retrying and says so, because retrying cannot fix it.
 */
export class Autosave {
  private readonly options: Required<Pick<AutosaveOptions, 'debounceMs' | 'maxRetryMs'>> & AutosaveOptions;
  private savedBoxRevision: number;
  private savedMaskRevision: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;
  private failures = 0;
  private stopped = false;
  private unsubscribe: () => void;
  private lastSeenVersion: number;
  private adoptPending: boolean;
  private clearRestoredMask = false;
  status: SaveStatus = 'saved';

  constructor(options: AutosaveOptions) {
    this.options = { debounceMs: 1200, maxRetryMs: 15_000, ...options };
    const { doc } = options;
    this.savedBoxRevision = doc.boxRevision;
    this.savedMaskRevision = doc.maskRevision;
    this.lastSeenVersion = doc.version;
    this.adoptPending = Boolean(options.adoptOnChange);
    this.unsubscribe = doc.subscribe(this.onChange);
  }

  private get pending(): boolean {
    const { doc } = this.options;
    return doc.boxRevision !== this.savedBoxRevision || doc.maskRevision !== this.savedMaskRevision;
  }

  private setStatus(status: SaveStatus, message?: string): void {
    this.status = status;
    this.options.onStatus?.(status, message);
  }

  private onChange = (): void => {
    const { doc } = this.options;
    if (doc.version === this.lastSeenVersion) return;
    this.lastSeenVersion = doc.version;
    if (!this.pending || this.stopped) return;
    if (this.adoptPending) {
      this.adopt();
      return;
    }
    this.remember();
    // A live drag bumps `version` but not the revisions, so it does not get here.
    this.schedule(this.options.debounceMs);
  };

  /**
   * Make what is on screen the annotator's own: everything is sent, whether or
   * not it changed. Done calls it for a frame opened with another annotator's
   * labels, so finishing it unchanged keeps those labels instead of recording an
   * empty frame.
   */
  adopt(): void {
    if (!this.adoptPending) return;
    this.adoptPending = false;
    this.savedBoxRevision = -1;
    this.savedMaskRevision = -1;
    this.remember();
    this.schedule(this.options.debounceMs);
  }

  /** Treat what is in the document now as unsent — used after restoring a local draft. */
  markDirty(clearEmptyMask = false): void {
    this.savedBoxRevision = -1;
    this.clearRestoredMask = clearEmptyMask;
    this.savedMaskRevision = this.options.doc.hasMask || clearEmptyMask ? -1 : this.savedMaskRevision;
    this.remember();
    this.schedule(this.options.debounceMs);
  }

  private remember(): void {
    const { doc, taskId, store } = this.options;
    const maskChanged = doc.maskRevision !== this.savedMaskRevision;
    void store.save({
      taskId,
      objects: doc.boxes,
      ...(maskChanged ? { mask: doc.hasMask ? encodeMaskRle(doc.width, doc.height, doc.mask) : null } : {}),
      savedAt: Date.now()
    });
  }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  /** Send everything unsent now. Resolves true once the server has all of it. */
  flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async drain(): Promise<boolean> {
    const { doc, taskId, api, store } = this.options;
    while (this.pending) {
      const boxRevision = doc.boxRevision;
      const maskRevision = doc.maskRevision;
      this.setStatus('saving');
      try {
        if (boxRevision !== this.savedBoxRevision) {
          await api.saveObjects(taskId, doc.boxes, this.options.elapsedMs?.());
          this.savedBoxRevision = boxRevision;
        }
        if (maskRevision !== this.savedMaskRevision) {
          if (doc.hasMask) await api.saveMask(taskId, encodeMaskRle(doc.width, doc.height, doc.mask));
          // An adopted copy with no mask has none to clear.
          else if (this.savedMaskRevision !== -1 || this.clearRestoredMask) await api.clearMask(taskId);
          this.savedMaskRevision = maskRevision;
          this.clearRestoredMask = false;
        }
        this.failures = 0;
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        // 408 and 429 are the server asking for patience; any other 4xx is a no.
        const refused = status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (refused) {
          this.setStatus('error', (error as Error).message);
          return false;
        }
        this.failures += 1;
        this.setStatus('offline');
        if (!this.stopped) this.schedule(Math.min(this.options.maxRetryMs, 1000 * 2 ** Math.min(this.failures, 5)));
        return false;
      }
      if (this.stopped) break;
    }
    if (!this.pending) {
      this.setStatus('saved');
      void store.clear(taskId);
    }
    return true;
  }

  /**
   * Stop watching, and make one last attempt to send what is unsent: leaving a
   * frame any way at all — the queue button, a link, closing the editor — must
   * not leave the last second of work only on this device. If that attempt fails
   * it is not retried; the local copy is restored on the next visit.
   */
  dispose(): void {
    const unsent = this.pending;
    this.stopped = true;
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (unsent && !this.running) void this.flush();
  }
}
