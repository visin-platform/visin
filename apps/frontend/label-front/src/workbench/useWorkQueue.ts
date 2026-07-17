import { useCallback, useEffect, useRef, useState } from 'react';
import { AnswerBody, WorkItem } from '../types';
import { nextTask, submitAnswer, undoAnswer } from '../services/jobService';
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
 */
export const useWorkQueue = (jobId: string): WorkQueue => {
  const [current, setCurrent] = useState<WorkItem | null>(null);
  const [status, setStatus] = useState<WorkQueue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionAnswered, setSessionAnswered] = useState(0);
  const prefetchedRef = useRef<WorkItem | null>(null);
  const lastAnsweredRef = useRef<WorkItem | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const pull = useCallback(async (): Promise<WorkItem | null> => {
    const item = await nextTask(jobId);
    if (item) {
      preloadImages(imageUrls(item));
    }
    return item;
  }, [jobId]);

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
        const first = await pull();
        if (cancelled) return;
        if (!first) {
          setStatus('done');
          return;
        }
        setCurrent(first);
        setStatus('working');
        prefetchedRef.current = await pull();
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
  }, [jobId, pull]);

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
        prefetchedRef.current = await pull();
      } else {
        const pulled = await pull();
        if (pulled) {
          setCurrent(pulled);
          prefetchedRef.current = await pull();
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
