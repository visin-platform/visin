import { useCallback, useEffect, useRef, useState } from 'react';
import { getImport, getUploadUrl, previewImport, startImport, uploadZip } from '../services/bundleService';
import { ImportJob, ImportMapping, ZipPreview } from '../types';

export interface BundleUploadState {
  phase: 'idle' | 'uploading' | 'inspecting' | 'mapping' | 'importing' | 'done' | 'failed';
  uploadFraction: number; // 0..1 while uploading
  preview: ZipPreview | null; // the mapping step's input, once inspected
  importJob: ImportJob | null;
  error: string | null;
}

const IMPORT_POLL_MS = 2000;

const IDLE: BundleUploadState = {
  phase: 'idle',
  uploadFraction: 0,
  preview: null,
  importJob: null,
  error: null
};

/**
 * The whole bundle upload pipeline: signed PUT (with progress) → inspect the
 * zip → the caller confirms the folder mapping → trigger import → poll ingest
 * status until done/failed.
 */
export const useBundleUpload = (bundleId: string, onFinished?: () => void) => {
  const [state, setState] = useState<BundleUploadState>(IDLE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zipFileIdRef = useRef<string | null>(null);

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
      setState({ ...IDLE, phase: 'uploading' });
      try {
        const { uploadUrl, zipFileId } = await getUploadUrl(bundleId);
        await uploadZip(uploadUrl, file, (fraction) =>
          setState((previous) => ({ ...previous, uploadFraction: fraction }))
        );
        zipFileIdRef.current = zipFileId;

        setState((previous) => ({ ...previous, phase: 'inspecting' }));
        const preview = await previewImport(bundleId, zipFileId);
        setState((previous) => ({ ...previous, phase: 'mapping', preview }));
      } catch (err) {
        setState((previous) => ({ ...previous, phase: 'failed', error: (err as Error).message }));
      }
    },
    [bundleId, stopPolling]
  );

  /** Run the import with the mapping confirmed in the mapping step. */
  const confirm = useCallback(
    async (mapping: ImportMapping) => {
      const zipFileId = zipFileIdRef.current;
      if (!zipFileId) {
        return;
      }
      try {
        const importJob = await startImport(bundleId, zipFileId, mapping);
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

  /** Abandon at the mapping step — the uploaded zip is simply never imported. */
  const cancel = useCallback(() => {
    stopPolling();
    zipFileIdRef.current = null;
    setState(IDLE);
  }, [stopPolling]);

  return { state, start, confirm, cancel };
};
