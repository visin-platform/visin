import { logger } from '@visin/backend-core';
import { Types } from 'mongoose';
import { Dataset } from '../models/Dataset';
import {
  enqueueDelete,
  enqueueImport,
  enqueueRemoveGroup,
  enqueueScan,
  getDatasetJob,
  getDatasetJobState,
  importJobId,
  scanJobId
} from '../queue/importQueue';
import { IMPORT_STALE_MS } from '../queue/constants';
import { markImportFailed } from './importService';
import { markScanFailed } from './scanService';
import { pendingWork, scanDelivery } from './workIdentity';

/** Mongo records delivery before Redis sees it. Recreate missing queued work,
 * leave live/queued jobs alone, and close lost running work only after its
 * heartbeat goes stale. A missing lock is not permission to run a second
 * processor alongside one that is still finishing; the caller can explicitly
 * resume the failed import once recovery has reported that lost delivery. */
export async function recoverDatasetJobs(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - IMPORT_STALE_MS);
  const datasets = Dataset.find({
    $or: [
      { deletingAt: { $exists: true } },
      { 'removingGroups.0': { $exists: true } },
      { 'import.status': pendingWork },
      { 'scan.status': pendingWork }
    ]
  })
    .select('_id deletingAt removingGroups import scan')
    .lean()
    .cursor();
  let recovered = 0;
  for await (const dataset of datasets) {
    const datasetId = dataset._id.toString();
    if (dataset.deletingAt) {
      await enqueueDelete({ datasetId });
      recovered += 1;
      continue;
    }
    for (const group of dataset.removingGroups ?? []) {
      await enqueueRemoveGroup({ datasetId, group });
      recovered += 1;
    }
    const importing = dataset.import;
    if (importing && (importing.status === 'queued' || importing.status === 'running')) {
      const data = {
        datasetId,
        importId: importing.id,
        ...(importing.deliveryId ? { deliveryId: importing.deliveryId } : {})
      };
      const job = await getDatasetJob(importJobId(data));
      const state = job ? await getDatasetJobState(job) : 'unknown';
      if (state === 'unknown' && importing.status === 'queued') {
        await enqueueImport(data);
        recovered += 1;
      } else if (state === 'failed' || state === 'completed' || state === 'unknown') {
        await markImportFailed(
          datasetId,
          importing.id,
          state === 'failed' ? job!.failedReason : `Import queue delivery is ${state}; resume the import to continue`,
          importing.deliveryId,
          state === 'unknown' ? staleBefore : undefined
        );
      }
    }
    let scan = dataset.scan;
    if (scan && (scan.status === 'queued' || scan.status === 'running')) {
      // Older releases gave scans random queue ids without persisting them.
      // Fence that anonymous delivery before introducing an addressable one;
      // if its worker already started, let its heartbeat/outcome settle first.
      if (!scan.id && scan.status === 'queued') {
        const identified = await Dataset.findOneAndUpdate(
          { ...scanDelivery(datasetId, scan.fileId), 'scan.status': 'queued' },
          { $set: { 'scan.id': new Types.ObjectId().toString() } },
          { returnDocument: 'after', projection: 'scan' }
        ).lean();
        if (!identified?.scan) continue;
        scan = identified.scan;
      }
      const data = { datasetId, fileId: scan.fileId, ...(scan.id ? { scanId: scan.id } : {}) };
      const job = await getDatasetJob(scanJobId(data));
      const state = job ? await getDatasetJobState(job) : 'unknown';
      if (state === 'unknown' && scan.status === 'queued') {
        await enqueueScan(data);
        recovered += 1;
      } else if (state === 'failed' || state === 'completed' || state === 'unknown') {
        await markScanFailed(
          datasetId,
          scan.fileId,
          state === 'failed' ? job!.failedReason : `Scan queue delivery is ${state}; rescan the archive to continue`,
          scan.id,
          state === 'unknown' ? staleBefore : undefined
        );
      }
    }
  }
  if (recovered) logger.info('Recovered dataset queue deliveries', { count: recovered });
  return recovered;
}
