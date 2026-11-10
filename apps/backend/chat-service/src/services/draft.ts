import { logger } from '@visin/backend-core';
import { AssistantRun } from '../models/AssistantRun';

/** The most often the answer so far is saved: often enough to read as typing, rarely enough to spare the database. */
export const DRAFT_WRITE_MS = 250;
/** More than an answer can be (its token limit), so cutting here never cuts a real one. */
export const MAX_DRAFT_CHARS = 24_000;

/**
 * Saves the text of an answer on its run as the provider streams it, for the asker's stream to hand on. A draft is
 * only ever a preview: the answer is `result`, and the draft is gone once that is published.
 *
 * Writes are spaced out, the newest text always wins, and clearing (a turn that moved on to reading results) is
 * immediate. A write is conditional on the run still working, so a late one cannot touch a run that has failed or
 * been cancelled, and a failed write is logged and forgotten: a preview is not worth failing an answer over.
 */
export function createDraftWriter(runId: string, now: () => number = Date.now) {
  let latest = '';
  let dirty = false;
  let wroteAt = 0;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let saving = false;

  const flush = async () => {
    timer = undefined;
    if (stopped || saving || !dirty) return;
    saving = true;
    dirty = false;
    wroteAt = now();
    try {
      await AssistantRun.updateOne({ _id: runId, state: 'running' }, { $set: { draft: latest } });
    } catch (error) {
      logger.warn('Could not save an answer draft', { error: error instanceof Error ? error.message : 'unknown' });
    } finally {
      saving = false;
      // A slow save must finish before the next one starts, or old text can overwrite a newer preview/clear.
      // Coalesce updates received during it and keep a clear immediate once the database is available.
      if (!stopped && dirty)
        timer = setTimeout(() => void flush(), latest ? Math.max(0, DRAFT_WRITE_MS - (now() - wroteAt)) : 0);
    }
  };

  return {
    write(text: string) {
      if (stopped) return;
      latest = text.slice(0, MAX_DRAFT_CHARS);
      dirty = true;
      if (!text) {
        clearTimeout(timer);
        void flush();
        return;
      }
      if (!saving && !timer) timer = setTimeout(() => void flush(), Math.max(0, DRAFT_WRITE_MS - (now() - wroteAt)));
    },
    /** Nothing more is saved: the run is over, one way or another. */
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = undefined;
    }
  };
}
