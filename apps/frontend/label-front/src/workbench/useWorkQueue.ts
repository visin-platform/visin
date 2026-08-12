import { useCallback, useEffect, useRef, useState } from 'react';
import { AnswerBody, AnswerSnapshot, WorkItem } from '../types';
import { getTask, getTaskAt, nextTask, submitAnswer, undoAnswer } from '../services/jobService';
import { preloadImages } from './idmapLoader';

export interface WorkQueueOptions {
  /** Open this task first — a link someone shared to ask about a frame. */
  startTaskId?: string | null;
  /**
   * Whether the caller may be handed leased work at all. False for a signed-out
   * visitor, and for a job that isn't active — leases need a labeler and an
   * active job. Also gates the "back to the queue" button.
   */
  canPull: boolean;
  /**
   * Open in browse mode even though the queue is available — someone who came
   * to look at what has been labeled rather than to label the next thing.
   */
  startBrowsing?: boolean;
  /** Held off until the job is known, since `canPull` depends on its status. */
  enabled: boolean;
}

export interface WorkQueue {
  current: WorkItem | null;
  status: 'loading' | 'working' | 'done' | 'error';
  error: string | null;
  sessionAnswered: number;
  canUndo: boolean;
  /** Stepping through the job's frames in order, rather than being handed work. */
  browsing: boolean;
  /** A prev/next/resume request is in flight. */
  navigating: boolean;
  answer: (body: AnswerBody) => Promise<void>;
  undoLast: () => Promise<void>;
  /** Jump to a 0-based frame position; entering browse mode if not already in it. */
  goTo: (index: number) => Promise<void>;
  /** Leave browse mode and take the next unlabeled frame from the queue. */
  resumeQueue: () => Promise<void>;
}

const imageUrls = (item: WorkItem): string[] => [
  item.images.frame.url,
  ...item.images.layers.map((layer) => layer.url),
  ...(item.images.idmap ? [item.images.idmap.url] : [])
];

/**
 * The item as it now stands on the server after this user answered it, built
 * locally from what was just sent. `images` is carried over untouched so the
 * viewer sees the same URLs and keeps its decoded id map.
 */
const withOwnAnswer = (item: WorkItem, body: AnswerBody, isRevision: boolean): WorkItem => {
  const mine: AnswerSnapshot = {
    ...(body.choiceKey ? { choiceKey: body.choiceKey } : {}),
    ...(body.rejectedMaskIds ? { rejectedMaskIds: body.rejectedMaskIds } : {}),
    updatedAt: new Date().toISOString()
  };
  return {
    ...item,
    answer: { count: isRevision ? item.answer.count : item.answer.count + 1, mine, latest: mine }
  };
};

/** The item after this user withdrew their answer; other labelers' stay. */
const withoutOwnAnswer = (item: WorkItem): WorkItem => ({
  ...item,
  answer: {
    count: Math.max(0, item.answer.count - 1),
    mine: null,
    // Whether anyone else's answer remains is not knowable from here, so the
    // frame reads as unanswered until it is opened again.
    latest: item.answer.count > 1 ? item.answer.latest : null
  }
});

/**
 * The labeling loop, in two modes.
 *
 * Queue mode is the default for a labeler on an active job: keep the current
 * task plus one prefetched task (both leased to this user; leases are per-user
 * so holding two is fine), advance on answer, and support undo of the last
 * submitted answer.
 *
 * Browse mode steps through every frame of the job in order, answered or not.
 * It is what "go back and fix that mask" needs, and it is the only mode a
 * signed-out visitor gets, since pulling takes a lease and leases need a user.
 * Answering in browse mode saves and stays put rather than advancing — the
 * point of being there is a particular frame, not throughput — and re-answering
 * a frame you already answered overwrites your verdict rather than being
 * refused as a duplicate.
 *
 * `startTaskId` opens a named task first without entering browse mode: it is
 * fetched rather than pulled, so it lands even if the queue would never have
 * handed it to this user, and answering it falls back into the normal pull.
 */
export const useWorkQueue = (jobId: string, options: WorkQueueOptions): WorkQueue => {
  const { startTaskId, canPull, startBrowsing = false, enabled } = options;
  const opensBrowsing = startBrowsing || !canPull;
  const [current, setCurrent] = useState<WorkItem | null>(null);
  const [status, setStatus] = useState<WorkQueue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionAnswered, setSessionAnswered] = useState(0);
  const [browsing, setBrowsing] = useState(opensBrowsing);
  const [navigating, setNavigating] = useState(false);
  const prefetchedRef = useRef<WorkItem | null>(null);
  const lastAnsweredRef = useRef<WorkItem | null>(null);
  const [queueCanUndo, setQueueCanUndo] = useState(false);

  // Tasks the client already holds must be excluded, or the backend's
  // lease-resume behavior would hand us the same task again as the prefetch.
  const pull = useCallback(
    async (excludeTaskIds: string[] = []): Promise<WorkItem | null> => {
      const item = await nextTask(jobId, excludeTaskIds);
      if (item) {
        preloadImages(imageUrls(item));
      }
      return item;
    },
    [jobId]
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('loading');
    setCurrent(null);
    prefetchedRef.current = null;
    lastAnsweredRef.current = null;
    setQueueCanUndo(false);
    setSessionAnswered(0);
    setBrowsing(opensBrowsing);

    (async () => {
      try {
        // A named task wins over both modes: it is the frame someone was sent to.
        const first = startTaskId
          ? await getTask(startTaskId)
          : opensBrowsing
            ? await getTaskAt(jobId, 0)
            : await pull();
        if (cancelled) return;
        if (!first) {
          setStatus('done');
          return;
        }
        if (opensBrowsing || startTaskId) {
          preloadImages(imageUrls(first));
        }
        setCurrent(first);
        setStatus('working');
        // The one-ahead prefetch is a queue-mode optimisation; in browse mode
        // the next frame is whichever one the reader steps to.
        if (!opensBrowsing) {
          prefetchedRef.current = await pull([first.task._id]);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, startTaskId, opensBrowsing, enabled, pull]);

  const answer = useCallback(
    async (body: AnswerBody) => {
      if (!current) return;
      // Revising an answer you already gave is a correction, not another frame
      // labeled, so it must not inflate the session count.
      const isRevision = current.answer.mine !== null;
      await submitAnswer(current.task._id, body);
      if (!isRevision) {
        setSessionAnswered((count) => count + 1);
      }

      if (browsing) {
        // Stay on the frame, and fold the saved verdict into it in place rather
        // than re-reading the task: a re-read hands back freshly signed image
        // URLs, which the workbench would see as a new frame and answer by
        // re-decoding the id map and throwing away the marks on screen.
        setCurrent((previous) => (previous ? withOwnAnswer(previous, body, isRevision) : previous));
        return;
      }

      lastAnsweredRef.current = current;
      setQueueCanUndo(true);
      const upNext = prefetchedRef.current;
      prefetchedRef.current = null;
      if (upNext) {
        setCurrent(upNext);
        prefetchedRef.current = await pull([upNext.task._id]);
      } else {
        const pulled = await pull();
        if (pulled) {
          setCurrent(pulled);
          prefetchedRef.current = await pull([pulled.task._id]);
        } else {
          setCurrent(null);
          setStatus('done');
        }
      }
    },
    [browsing, current, pull]
  );

  const undoLast = useCallback(async () => {
    // In browse mode "undo" is about the frame on screen, not about the last
    // thing submitted — there is no advancing queue behind it to rewind.
    if (browsing) {
      if (!current?.answer.mine) return;
      await undoAnswer(current.task._id);
      setSessionAnswered((count) => Math.max(0, count - 1));
      setCurrent((previous) => (previous ? withoutOwnAnswer(previous) : previous));
      return;
    }

    const last = lastAnsweredRef.current;
    if (!last) return;
    await undoAnswer(last.task._id);
    lastAnsweredRef.current = null;
    setQueueCanUndo(false);
    setSessionAnswered((count) => Math.max(0, count - 1));
    // Show the undone task again; the one we were on becomes the prefetch.
    if (current) {
      prefetchedRef.current = current;
    }
    setCurrent(last);
    setStatus('working');
  }, [browsing, current]);

  const goTo = useCallback(
    async (index: number) => {
      if (index < 0) return;
      setNavigating(true);
      try {
        const item = await getTaskAt(jobId, index);
        // Past the end: leave the current frame up rather than blanking the
        // workbench — the caller only learns the bound by asking.
        if (!item) return;
        preloadImages(imageUrls(item));
        setBrowsing(true);
        setCurrent(item);
        setStatus('working');
        // The queue's undo target is whatever was answered last in the queue;
        // stepping away from it makes that button mean something else.
        lastAnsweredRef.current = null;
        setQueueCanUndo(false);
      } catch (err) {
        setError((err as Error).message);
        setStatus('error');
      } finally {
        setNavigating(false);
      }
    },
    [jobId]
  );

  const resumeQueue = useCallback(async () => {
    setNavigating(true);
    try {
      const item = await pull();
      setBrowsing(false);
      if (!item) {
        setCurrent(null);
        setStatus('done');
        return;
      }
      setCurrent(item);
      setStatus('working');
      prefetchedRef.current = await pull([item.task._id]);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    } finally {
      setNavigating(false);
    }
  }, [pull]);

  return {
    current,
    status,
    error,
    sessionAnswered,
    canUndo: browsing ? Boolean(current?.answer.mine) : queueCanUndo,
    browsing,
    navigating,
    answer,
    undoLast,
    goTo,
    resumeQueue
  };
};
