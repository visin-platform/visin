import { HttpError, logger } from '@visin/backend-core';
import { Dataset } from '../models/Dataset';
import * as files from '../clients/fileServiceClient';
import { NonRetryableImportError } from '../utils/boundedZip';
import { summarizeContents } from '../utils/contents';
import { readZipIndex } from '../utils/zipIndex';
import { pendingWork, scanDelivery, staleHeartbeat } from './workIdentity';

/** file-service unreachable, timing out or failing (fetch's TypeError, or a 5xx it answered) — not a verdict on the bytes. */
const isTransportError = (err: unknown): boolean =>
  err instanceof TypeError || (err instanceof HttpError && err.statusCode >= 500);

/**
 * Read an uploaded zip's index into the dataset's `contents`, in the worker.
 *
 * Only the archive's central directory is read, through byte ranges, so this is
 * quick next to an import — but on a multi-GB zip it is still longer than a
 * browser should have to wait for, which is why it is not done in the request.
 * A zip that cannot be read is not retried: the same bytes would fail the same way.
 * The reason stays on the scan, so a failure can be told from a corrupt upload.
 */
export const runScan = async (datasetId: string, fileId: string, scanId?: string): Promise<void> => {
  const current = scanDelivery(datasetId, fileId, scanId);
  const started = await Dataset.updateOne(
    { ...current, 'scan.status': pendingWork },
    { $set: { 'scan.status': 'running', 'scan.heartbeatAt': new Date() } }
  );
  if (started.matchedCount === 0) return;

  let heartbeat: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (heartbeat) return;
    heartbeat = Dataset.updateOne(
      { ...current, 'scan.status': 'running' },
      { $set: { 'scan.heartbeatAt': new Date() } }
    )
      .exec()
      .catch(() => logger.warn('Could not renew dataset scan heartbeat', { datasetId }))
      .finally(() => {
        heartbeat = undefined;
      });
  }, 5000);
  timer.unref();
  try {
    const size = await files.getFileSize(fileId);
    if (!size) throw new NonRetryableImportError('The uploaded zip is no longer stored');
    let contents;
    try {
      contents = summarizeContents(await readZipIndex(fileId, size));
    } catch (err) {
      // Not reaching file-service says nothing about the zip: let the worker retry.
      if (isTransportError(err)) throw err;
      const detail = (err as Error).message;
      logger.warn('Archive is not a readable zip', { datasetId, error: detail });
      throw new NonRetryableImportError(`The uploaded file is not a readable zip archive (${detail})`);
    }

    const finished = await Dataset.updateOne(
      { ...current, 'scan.status': 'running' },
      {
        $set: { contents, 'archive.size': size, 'scan.status': 'done', 'scan.finishedAt': new Date() },
        $unset: { 'scan.error': '' }
      }
    );
    if (finished.matchedCount) logger.info('Dataset archive scanned', { datasetId, size, entries: contents.entries });
  } finally {
    clearInterval(timer);
    await heartbeat;
  }
};

/** Close a scan out as failed, once the worker has no retries left. */
export const markScanFailed = async (
  datasetId: string,
  fileId: string,
  reason: string,
  scanId?: string,
  staleBefore?: Date
): Promise<void> => {
  await Dataset.updateOne(
    {
      ...scanDelivery(datasetId, fileId, scanId),
      'scan.status': pendingWork,
      ...(staleBefore ? staleHeartbeat('scan.heartbeatAt', staleBefore) : {})
    },
    {
      $set: { 'scan.status': 'failed', 'scan.error': reason, 'scan.finishedAt': new Date() }
    }
  );
};
