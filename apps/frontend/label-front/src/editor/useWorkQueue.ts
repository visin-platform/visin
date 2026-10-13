import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkItem } from '../types';
import { finishTask, getTask, getTaskAt, nextTask } from '../services/jobService';
import { preloadImages } from './imageLoader';

export interface WorkQueueOptions {
  /** Open this task first — a link someone shared to ask about a frame. */
  startTaskId?: string | null;
  /**
   * Whether the caller may be handed leased work at all. False for a signed-out
   * visitor, and for a job that isn't active — leases need an annotator and an
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
  /** frames finished this session, counting each once */
  sessionDone: number;
  /** Stepping through the job's frames in order, rather than being handed work. */
  browsing: boolean;
  /** A prev/next/resume/finish request is in flight. */
  navigating: boolean;
  /** Close the current frame as done or skipped, then open the next one in the queue. */
  finish: (outcome: 'done' | 'skip', elapsedMs?: number) => Promise<void>;
  /** Jump to a 0-based frame position; entering browse mode if not already in it. */
  goTo: (index: number) => Promise<void>;
  /** Leave browse mode and take the next unlabeled frame from the queue. */
  resumeQueue: () => Promise<void>;
}

const imageUrls = (item: WorkItem): string[] => [
  item.images.frame.url,
  ...item.images.sensors.flatMap((sensor) => (sensor.kind === 'image' ? [sensor.url] : [])),
  ...(item.annotation.mine?.mask ? [item.annotation.mine.mask.url] : [])
];

/**
 * The labeling loop, in two modes.
 *
 * Queue mode is the default for an annotator on an active job: keep the current
 * task plus one prefetched task (both leased to this user; leases are per-user so
 * holding two is fine) and advance when a frame is finished.
 *
 * Browse mode steps through every frame of the job in order, labeled or not. It
 * is what "go back and fix that box" needs, and it is the only mode a signed-out
 * visitor gets, since pulling takes a lease and leases need a user. Finishing a
 * frame there returns to the queue rather than stepping on, so Back, fix, Enter
 * lands on the next frame that still needs work.
 *
 * `startTaskId` opens a named task first without entering browse mode: it is
 * fetched rather than pulled, so it lands even if the queue would never have
 * handed it to this user, and finishing it falls into the normal pull.
 */
export const useWorkQueue = (jobId: string, options: WorkQueueOptions): WorkQueue => {
  const { startTaskId, canPull, startBrowsing = false, enabled } = options;
  const opensBrowsing = startBrowsing || !canPull;
  const [current, setCurrent] = useState<WorkItem | null>(null);
  const [status, setStatus] = useState<WorkQueue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [sessionDone, setSessionDone] = useState(0);
  const [browsing, setBrowsing] = useState(opensBrowsing);
  const [navigating, setNavigating] = useState(false);
  const prefetchedRef = useRef<WorkItem | null>(null);
  const countedRef = useRef<Set<string>>(new Set());

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
    countedRef.current = new Set();
    setSessionDone(0);
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

  /** Show the queue's next frame, topping up the prefetch behind it. */
  const advance = useCallback(
    async (exclude: string[]) => {
      const upNext = prefetchedRef.current;
      prefetchedRef.current = null;
      const item = upNext ?? (await pull(exclude));
      if (!item) {
        setCurrent(null);
        setStatus('done');
        return;
      }
      setCurrent(item);
      setStatus('working');
      prefetchedRef.current = await pull([item.task._id, ...exclude]);
    },
    [pull]
  );

  const finish = useCallback(
    async (outcome: 'done' | 'skip', elapsedMs?: number) => {
      if (!current) return;
      setNavigating(true);
      try {
        await finishTask(current.task._id, outcome, elapsedMs);
        // Revising a frame already counted is a correction, not another frame done.
        if (outcome === 'done' && current.annotation.mine?.status !== 'done' && !countedRef.current.has(current.task._id)) {
          countedRef.current.add(current.task._id);
          setSessionDone((count) => count + 1);
        }
        if (!canPull) {
          // A job that hands out no work (a completed one, being corrected) has
          // no queue to return to: step on through its frames instead.
          const following = current.position.index + 1 < current.position.total ? await getTaskAt(jobId, current.position.index + 1) : null;
          setCurrent(
            following ?? {
              ...current,
              annotation: {
                ...current.annotation,
                mine: { status: outcome === 'done' ? 'done' : 'skipped', objects: current.annotation.mine?.objects ?? [], updatedAt: new Date().toISOString() }
              }
            }
          );
          if (following) preloadImages(imageUrls(following));
          return;
        }
        setBrowsing(false);
        await advance([current.task._id]);
      } finally {
        setNavigating(false);
      }
    },
    [advance, current, canPull, jobId]
  );

  const goTo = useCallback(
    async (index: number) => {
      if (index < 0) return;
      setNavigating(true);
      try {
        const item = await getTaskAt(jobId, index);
        // Past the end: leave the current frame up rather than blanking the
        // editor — the caller only learns the bound by asking.
        if (!item) return;
        preloadImages(imageUrls(item));
        setBrowsing(true);
        setCurrent(item);
        setStatus('working');
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
      const held = prefetchedRef.current;
      const item = held ?? (await pull());
      prefetchedRef.current = null;
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

  return { current, status, error, sessionDone, browsing, navigating, finish, goTo, resumeQueue };
};
