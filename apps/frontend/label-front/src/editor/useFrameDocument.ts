import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoxObject, WorkItem } from '../types';
import { clearMask, saveMask, saveObjects } from '../services/jobService';
import { Autosave, SaveStatus } from './autosave';
import { clearDraft, loadDraft, saveDraft } from './draftStore';
import { EditorDocument } from './EditorDocument';
import { loadMask } from './imageLoader';
import { decodeMaskRle } from './maskCodec';

export interface SuggestionState {
  boxes: BoxObject[];
  /** the suggested mask's class indices, once loaded */
  mask: Uint8Array | null;
}

export interface FrameDocument {
  doc: EditorDocument | null;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  saveMessage: string | undefined;
  /** Send everything unsent now; true once the server has it all. */
  flush: () => Promise<boolean>;
  /** whose labels the document was opened with */
  openedFrom: 'mine' | 'latest' | 'empty';
  suggestions: SuggestionState | null;
  acceptSuggestion: (id: string) => void;
  acceptAllSuggestions: () => void;
  dismissSuggestions: () => void;
  /** Replace the boxes a model suggested for this frame; imported suggestions are kept. */
  setModelSuggestions: (boxes: BoxObject[]) => void;
  /** milliseconds spent on this frame so far */
  elapsedMs: () => number;
  /**
   * For a frame opened with another annotator's labels: make them this
   * annotator's own, so finishing it unchanged keeps them. Done calls it.
   */
  adoptCopy: () => void;
}

/** An accepted suggestion keeps saying a model drew it; anything else was imported. */
const acceptedAs = (box: BoxObject): BoxObject => ({ ...box, source: box.source === 'model' ? 'model' : 'import' });

const NO_FLUSH = async (): Promise<boolean> => true;

/** The size the frame's labels are drawn at: the dataset's, or the image's own once it has loaded. */
const useFrameSize = (item: WorkItem | null): { width: number; height: number } | null => {
  const url = item?.images.frame.url;
  const knownWidth = item?.images.frame.width;
  const knownHeight = item?.images.frame.height;
  const [measured, setMeasured] = useState<{ url: string; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!url || (knownWidth && knownHeight)) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setMeasured({ url, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, knownWidth, knownHeight]);

  if (knownWidth && knownHeight) return { width: knownWidth, height: knownHeight };
  return measured && measured.url === url ? { width: measured.width, height: measured.height } : null;
};

/**
 * The editable document for the frame on screen: opened with the annotator's
 * own labels (or the latest finished ones, or nothing), restored from a
 * local draft when one is newer than the server's copy, and wired to autosave.
 *
 * Keyed on the task, not the item: finishing a frame rewrites the item in place,
 * and that must not throw away the document the annotator is still looking at.
 */
export interface FrameDocumentOptions {
  readOnly: boolean;
  /**
   * Several annotators label each frame independently (redundancy above 1), so
   * one who may label starts from their own work, never from someone else's.
   */
  independent?: boolean;
}

export const useFrameDocument = (item: WorkItem | null, options: FrameDocumentOptions): FrameDocument => {
  const { readOnly, independent = false } = options;
  const taskId = item?.task._id ?? null;
  const size = useFrameSize(item);
  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveMessage, setSaveMessage] = useState<string | undefined>(undefined);
  const [openedFrom, setOpenedFrom] = useState<FrameDocument['openedFrom']>('empty');
  const [suggestions, setSuggestions] = useState<SuggestionState | null>(null);
  // Mirrors `suggestions` so the actions below can read it and act on the
  // document outside a state updater, which React may run twice.
  const suggestionsRef = useRef<SuggestionState | null>(null);
  const autosaveRef = useRef<Autosave | null>(null);
  const startedAtRef = useRef(Date.now());
  // The item the effect below reads from. Held in a ref because the effect is
  // keyed on the task: a new object for the same task must not rebuild the document.
  const itemRef = useRef(item);
  itemRef.current = item;

  const width = size?.width;
  const height = size?.height;

  const updateSuggestions = useCallback((next: SuggestionState | null) => {
    suggestionsRef.current = next;
    setSuggestions(next);
  }, []);

  useEffect(() => {
    const current = itemRef.current;
    autosaveRef.current?.dispose();
    autosaveRef.current = null;
    setDoc(null);
    setError(null);
    updateSuggestions(null);
    setSaveStatus('saved');
    setSaveMessage(undefined);
    startedAtRef.current = Date.now();
    if (!current || !taskId || !width || !height) {
      setLoading(Boolean(current));
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // A viewer sees the latest finished labels; an annotator opens with their
        // own, or with the latest as a starting point when one set per frame is wanted.
        const showLatest = readOnly || !independent;
        const source = current.annotation.mine ?? (showLatest ? current.annotation.latest : null);
        const next = new EditorDocument(width, height);
        let maskData: Uint8Array | null = null;
        if (source?.mask) {
          const loaded = await loadMask(source.mask.url);
          if (loaded.width !== width || loaded.height !== height) {
            throw new Error('The saved mask does not match this frame');
          }
          maskData = loaded.data;
        }
        next.load(source?.objects ?? [], maskData);

        // A draft newer than what the server holds is work that never got sent.
        let restored = false;
        if (!readOnly && current.annotation.mine) {
          const draft = await loadDraft(taskId);
          if (draft && draft.savedAt > Date.parse(current.annotation.mine.updatedAt)) {
            const draftMask = draft.mask === undefined ? maskData : draft.mask === null ? null : (decodeMaskRle(draft.mask)?.data ?? maskData);
            next.load(draft.objects, draftMask);
            restored = true;
          }
        } else if (!readOnly) {
          const draft = await loadDraft(taskId);
          if (draft) {
            const draftMask = draft.mask ? (decodeMaskRle(draft.mask)?.data ?? null) : null;
            next.load(draft.objects, draftMask);
            restored = true;
          }
        }
        if (cancelled) return;

        if (!readOnly) {
          const autosave = new Autosave({
            taskId,
            doc: next,
            api: { saveObjects, saveMask, clearMask },
            store: {
              save: saveDraft,
              clear: clearDraft
            },
            elapsedMs: () => Date.now() - startedAtRef.current,
            adoptOnChange: !current.annotation.mine && source !== null && !restored,
            onStatus: (status, message) => {
              setSaveStatus(status);
              setSaveMessage(message);
            }
          });
          autosaveRef.current = autosave;
          if (restored) autosave.markDirty(Boolean(source?.mask));
        }

        setOpenedFrom(current.annotation.mine ? 'mine' : source ? 'latest' : 'empty');
        setDoc(next);
        setLoading(false);

        // Suggestions are offered only on a frame the annotator has not started.
        const waiting = current.suggestions;
        if (waiting && !current.annotation.mine && !restored && (waiting.objects.length > 0 || waiting.mask)) {
          updateSuggestions({ boxes: waiting.objects, mask: null });
          if (waiting.mask) {
            loadMask(waiting.mask.url)
              .then((loaded) => {
                const held = suggestionsRef.current;
                if (!cancelled && held && loaded.width === width && loaded.height === height) {
                  updateSuggestions({ ...held, mask: loaded.data });
                }
              })
              // A suggestion that cannot load is not worth blocking the frame for.
              .catch(() => undefined);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      autosaveRef.current?.dispose();
      autosaveRef.current = null;
    };
  }, [taskId, width, height, readOnly, independent, updateSuggestions]);

  const flush = useCallback(() => (autosaveRef.current ? autosaveRef.current.flush() : NO_FLUSH()), []);
  const elapsedMs = useCallback(() => Date.now() - startedAtRef.current, []);
  const adoptCopy = useCallback(() => autosaveRef.current?.adopt(), []);

  const acceptSuggestion = useCallback(
    (id: string) => {
      const held = suggestionsRef.current;
      const box = held?.boxes.find((candidate) => candidate.id === id);
      if (!doc || !held || !box) return;
      doc.addBoxes([acceptedAs(box)]);
      updateSuggestions({ ...held, boxes: held.boxes.filter((candidate) => candidate.id !== id) });
    },
    [doc, updateSuggestions]
  );

  const acceptAllSuggestions = useCallback(() => {
    const held = suggestionsRef.current;
    if (!doc || !held) return;
    doc.addBoxes(held.boxes.map(acceptedAs));
    if (held.mask) doc.applyMask(held.mask);
    updateSuggestions(null);
  }, [doc, updateSuggestions]);

  const dismissSuggestions = useCallback(() => updateSuggestions(null), [updateSuggestions]);

  const setModelSuggestions = useCallback(
    (boxes: BoxObject[]) => {
      const held = suggestionsRef.current;
      const kept = (held?.boxes ?? []).filter((box) => box.source !== 'model');
      const next = [...kept, ...boxes];
      updateSuggestions(next.length === 0 && !held?.mask ? null : { boxes: next, mask: held?.mask ?? null });
    },
    [updateSuggestions]
  );

  return useMemo(
    () => ({
      doc,
      loading,
      error,
      saveStatus,
      saveMessage,
      flush,
      openedFrom,
      suggestions,
      acceptSuggestion,
      acceptAllSuggestions,
      dismissSuggestions,
      setModelSuggestions,
      elapsedMs,
      adoptCopy
    }),
    [
      doc,
      loading,
      error,
      saveStatus,
      saveMessage,
      flush,
      openedFrom,
      suggestions,
      acceptSuggestion,
      acceptAllSuggestions,
      dismissSuggestions,
      setModelSuggestions,
      elapsedMs,
      adoptCopy
    ]
  );
};
