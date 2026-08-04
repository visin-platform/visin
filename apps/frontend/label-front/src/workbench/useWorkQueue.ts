import { useCallback, useEffect, useRef, useState } from 'react';
import { AnswerBody, WorkItem } from '../types';
import { getTask, nextTask, submitAnswer, undoAnswer } from '../services/jobService';
import { preloadImages } from './idmapLoader';

export interface WorkQueue {
  current: WorkItem | null;
  status: 'loading' | 'working' | 'done' | 'error';
  error: string | null;
  sessionAnswered: number;
  canUndo: boolean;
  answer: (body: AnswerBody) => Promise<void>;
  undoLast: () => Promise<void>;
}

const imageUrls = (item: WorkItem): string[] => [
  item.images.frame.url,
  ...item.images.layers.map((layer) => layer.url),
  ...(item.images.idmap ? [item.images.idmap.url] : [])
];

/**
 * The labeling loop: keeps the current task plus one prefetched task (both
 * leased to this user; leases are per-user so holding two is fine), advances
 * on answer, and supports undo of the last submitted answer.
 *
 * `startTaskId` opens a named task first — a link someone shared to ask about a
 * particular frame. It is fetched rather than pulled, so it lands even if the
 * queue would never have handed it to this user (already answered by them, or
 * leased to someone else); answering it then falls back into the normal pull.
 */
export const useWorkQueue = (jobId: string, startTaskId?: string | null): WorkQueue => {
  const [current, setCurrent] = useState<WorkItem | null>(null);
  const [status, setStatus] = useState<WorkQueue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionAnswered, setSessionAnswered] = useState(0);
  const prefetchedRef = useRef<WorkItem | null>(null);
  const lastAnsweredRef = useRef<WorkItem | null>(null);
  const [canUndo, setCanUndo] = useState(false);

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
    let cancelled = false;
    setStatus('loading');
    setCurrent(null);
    prefetchedRef.current = null;
    lastAnsweredRef.current = null;
    setCanUndo(false);
    setSessionAnswered(0);

    (async () => {
      try {
        const first = startTaskId ? await getTask(startTaskId) : await pull();
        if (cancelled) return;
        if (!first) {
          setStatus('done');
          return;
        }
        if (startTaskId) {
          preloadImages(imageUrls(first));
        }
        setCurrent(first);
        setStatus('working');
        prefetchedRef.current = await pull([first.task._id]);
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
  }, [jobId, startTaskId, pull]);

  const answer = useCallback(
    async (body: AnswerBody) => {
      if (!current) return;
      await submitAnswer(current.task._id, body);
      lastAnsweredRef.current = current;
      setCanUndo(true);
      setSessionAnswered((count) => count + 1);

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
    [current, pull]
  );

  const undoLast = useCallback(async () => {
    const last = lastAnsweredRef.current;
    if (!last) return;
    await undoAnswer(last.task._id);
    lastAnsweredRef.current = null;
    setCanUndo(false);
    setSessionAnswered((count) => Math.max(0, count - 1));
    // Show the undone task again; the one we were on becomes the prefetch.
    if (current) {
      prefetchedRef.current = current;
    }
    setCurrent(last);
    setStatus('working');
  }, [current]);

  return { current, status, error, sessionAnswered, canUndo, answer, undoLast };
};
