import { useCallback, useEffect, useRef, useState } from 'react';
import { getImport, getUploadUrl, startImport, uploadZip } from '../services/bundleService';
import { ImportJob } from '../types';

export interface BundleUploadState {
  phase: 'idle' | 'uploading' | 'importing' | 'done' | 'failed';
  uploadFraction: number; // 0..1 while uploading
  importJob: ImportJob | null;
  error: string | null;
}

const IMPORT_POLL_MS = 2000;

/**
 * The whole bundle upload pipeline: signed PUT (with progress) → trigger
 * import → poll ingest status until done/failed.
 */
export const useBundleUpload = (bundleId: string, onFinished?: () => void) => {
  const [state, setState] = useState<BundleUploadState>({
    phase: 'idle',
    uploadFraction: 0,
    importJob: null,
    error: null
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(
    async (file: File) => {
      stopPolling();
      setState({ phase: 'uploading', uploadFraction: 0, importJob: null, error: null });
      try {
        const { uploadUrl, zipFileId } = await getUploadUrl(bundleId);
        await uploadZip(uploadUrl, file, (fraction) =>
          setState((previous) => ({ ...previous, uploadFraction: fraction }))
        );

        const importJob = await startImport(bundleId, zipFileId);
        setState((previous) => ({ ...previous, phase: 'importing', importJob }));

        pollRef.current = setInterval(async () => {
          try {
            const polled = await getImport(bundleId, importJob._id);
            if (polled.status === 'done' || polled.status === 'failed') {
              stopPolling();
              setState((previous) => ({
                ...previous,
                phase: polled.status === 'done' ? 'done' : 'failed',
                importJob: polled
              }));
              onFinished?.();
            } else {
              setState((previous) => ({ ...previous, importJob: polled }));
            }
          } catch (err) {
            stopPolling();
            setState((previous) => ({ ...previous, phase: 'failed', error: (err as Error).message }));
          }
        }, IMPORT_POLL_MS);
      } catch (err) {
        setState((previous) => ({ ...previous, phase: 'failed', error: (err as Error).message }));
      }
    },
    [bundleId, onFinished, stopPolling]
  );

  return { state, start };
};
