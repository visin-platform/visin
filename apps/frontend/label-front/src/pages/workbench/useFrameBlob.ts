import { useCallback, useRef } from 'react';
import type { WorkItem } from '../../types';

/** The frame's bytes for the model: the image the editor already shows, fetched once per frame. */
export const useFrameBlob = (item: WorkItem | null): (() => Promise<Blob>) => {
  const cache = useRef<{ taskId: string; blob: Blob } | null>(null);

  return useCallback(async (): Promise<Blob> => {
    if (!item) throw new Error('No frame');
    if (cache.current?.taskId === item.task._id) return cache.current.blob;
    const response = await fetch(item.images.frame.url);
    if (!response.ok) throw new Error(`Could not read the frame (${response.status})`);
    const blob = await response.blob();
    cache.current = { taskId: item.task._id, blob };
    return blob;
  }, [item]);
};
