import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { UploadCancelledError } from '../utils/chunkedUpload';
import { Dataset, uploadArchive } from './datasetService';

/**
 * Dataset zip uploads running in this tab.
 *
 * Kept outside React on purpose: an upload outlives the dialog that started it,
 * the page it was started from, and — inside shell-front — this whole app being
 * swapped out for another one. Only a reload or a closed tab stops it, and the
 * dataset then offers to resume. Components read it with `useDatasetUploads`.
 */

export type UploadStatus = 'uploading' | 'finishing' | 'done' | 'failed' | 'cancelled';

export interface DatasetUpload {
  datasetId: string;
  datasetName: string;
  filename: string;
  size: number;
  status: UploadStatus;
  /** 0–1 of the zip's bytes sent */
  progress: number;
  error?: string;
}

interface Entry extends DatasetUpload {
  file: File;
  controller: AbortController;
  /** the cache of the pages that show this dataset, told when the upload ends */
  queryClient: QueryClient;
}

/** A finished upload stays in the corner this long, then clears itself. */
export const DONE_VISIBLE_MS = 15_000;
/** Progress events arrive per network packet; the corner needs a few a second. */
const PROGRESS_INTERVAL_MS = 250;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: DatasetUpload[] = [];

const publish = (): void => {
  snapshot = [...entries.values()].map(({ file: _file, controller: _controller, queryClient: _client, ...upload }) => upload);
  listeners.forEach((listener) => listener());
};

const update = (datasetId: string, changes: Partial<Entry>): void => {
  const entry = entries.get(datasetId);
  if (!entry) return;
  entries.set(datasetId, { ...entry, ...changes });
  publish();
};

export const isActive = (upload?: Pick<DatasetUpload, 'status'>): boolean =>
  upload?.status === 'uploading' || upload?.status === 'finishing';

/** The dataset's view went stale: the server holds a new pending upload, zip or scan. */
const refresh = ({ queryClient, datasetId }: Entry, dataset?: Dataset): void => {
  if (dataset) queryClient.setQueryData(['dataset', datasetId], dataset);
  else void queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
  void queryClient.invalidateQueries({ queryKey: ['datasets'] });
};

const run = async (datasetId: string): Promise<void> => {
  const entry = entries.get(datasetId)!;
  let lastReport = 0;
  const onProgress = (fraction: number): void => {
    const now = Date.now();
    if (fraction < 1 && now - lastReport < PROGRESS_INTERVAL_MS) return;
    lastReport = now;
    update(datasetId, fraction >= 1 ? { progress: 1, status: 'finishing' } : { progress: fraction });
  };
  try {
    const dataset = await uploadArchive(datasetId, entry.file, onProgress, entry.controller.signal);
    // The new dataset first: a page waiting for the upload to end must never
    // see it ended while still holding the old zip's contents.
    refresh(entry, dataset);
    update(datasetId, { status: 'done', progress: 1 });
    setTimeout(() => {
      if (entries.get(datasetId)?.status === 'done') dismissUpload(datasetId);
    }, DONE_VISIBLE_MS);
  } catch (err) {
    const cancelled = err instanceof UploadCancelledError || entry.controller.signal.aborted;
    update(datasetId, {
      status: cancelled ? 'cancelled' : 'failed',
      error: cancelled ? undefined : err instanceof Error ? err.message : 'Upload failed'
    });
    refresh(entry);
  }
};

/**
 * Start sending a zip to a dataset. Returns at once; progress is in the store.
 * Sending the same file again after an interruption resumes where it stopped.
 */
export const startUpload = (dataset: Pick<Dataset, '_id' | 'name'>, file: File, queryClient: QueryClient): void => {
  if (isActive(entries.get(dataset._id))) throw new Error('A zip is already uploading to this dataset');
  entries.set(dataset._id, {
    datasetId: dataset._id,
    datasetName: dataset.name,
    filename: file.name,
    size: file.size,
    status: 'uploading',
    progress: 0,
    file,
    controller: new AbortController(),
    queryClient
  });
  publish();
  void run(dataset._id);
};

/** Stop sending. What arrived stays on the server, so the upload can be resumed or discarded later. */
export const cancelUpload = (datasetId: string): void => {
  entries.get(datasetId)?.controller.abort();
};

/** Try a failed or cancelled upload again with the file still in hand — it resumes. */
export const retryUpload = (datasetId: string): void => {
  const entry = entries.get(datasetId);
  if (!entry || (entry.status !== 'failed' && entry.status !== 'cancelled')) return;
  entries.delete(datasetId);
  startUpload({ _id: entry.datasetId, name: entry.datasetName }, entry.file, entry.queryClient);
};

export const dismissUpload = (datasetId: string): void => {
  if (isActive(entries.get(datasetId))) return;
  if (entries.delete(datasetId)) publish();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useDatasetUploads = (): DatasetUpload[] => useSyncExternalStore(subscribe, () => snapshot);

export const useDatasetUpload = (datasetId: string): DatasetUpload | undefined =>
  useDatasetUploads().find((upload) => upload.datasetId === datasetId);

/** Tests only: forget every upload. */
export const resetDatasetUploads = (): void => {
  entries.clear();
  publish();
};
