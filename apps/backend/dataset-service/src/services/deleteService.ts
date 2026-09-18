import { logger } from '@visin/backend-core';
import { Dataset } from '../models/Dataset';
import { DatasetItem } from '../models/DatasetItem';
import * as files from '../clients/fileServiceClient';
import { enqueueDelete, enqueueRemoveGroup } from '../queue/importQueue';
import { refreshCover, summarizeItems } from './importService';

const REMOVE_BATCH = 1000;

/**
 * Remove a dataset marked for deletion: its files, its item rows, then the
 * record itself, last — so an attempt that dies part-way leaves the mark in
 * place and the next one finishes the job. Every step is safe to repeat.
 */
export const runDelete = async (datasetId: string): Promise<void> => {
  const dataset = await Dataset.findOne({ _id: datasetId, deletingAt: { $exists: true } });
  if (!dataset) return;
  await files.deleteFolder(dataset.storagePrefix);
  await DatasetItem.deleteMany({ datasetId: dataset._id });
  await Dataset.deleteOne({ _id: dataset._id });
  logger.info('Dataset deleted', { datasetId });
};

/**
 * Remove one image group: its files and rows a batch at a time, then the
 * dataset's counts, cover and recorded mapping — and last the mark, so an
 * attempt that dies part-way is finished by the next one.
 */
export const runRemoveGroup = async (datasetId: string, group: string): Promise<void> => {
  const dataset = await Dataset.findOne({ _id: datasetId, removingGroups: group });
  if (!dataset) return;
  for (;;) {
    const batch = await DatasetItem.find({ datasetId: dataset._id, group }, { fileId: 1, thumbnailFileId: 1 }).limit(REMOVE_BATCH).lean();
    if (batch.length === 0) break;
    const fileIds = batch.flatMap((item) => [item.fileId, item.thumbnailFileId]).filter((fileId): fileId is string => Boolean(fileId));
    if (fileIds.length > 0) await files.deleteFiles(fileIds);
    await DatasetItem.deleteMany({ _id: { $in: batch.map((item) => item._id) } });
  }
  const summary = await summarizeItems(dataset._id);
  await Dataset.updateOne(
    { _id: dataset._id },
    {
      $set: { groups: summary.groups, imageCount: summary.imageCount },
      $pull: { removingGroups: group, 'import.mapping.groups': { group } }
    }
  );
  await refreshCover(dataset._id, dataset.coverPath, summary.coverFileId);
  logger.info('Dataset image group removed', { datasetId, group });
};

/**
 * Queue every deletion and group removal still marked — one whose job was lost
 * (Redis restarted without persistence) or failed for good would otherwise stay
 * hidden and undone forever. Run at startup.
 */
export const resumeDeletions = async (): Promise<number> => {
  const deleting = await Dataset.find({ deletingAt: { $exists: true } }, { _id: 1 }).lean();
  for (const row of deleting) await enqueueDelete({ datasetId: row._id.toString() });
  const removing = await Dataset.find({ 'removingGroups.0': { $exists: true } }, { removingGroups: 1 }).lean();
  for (const row of removing) {
    for (const group of row.removingGroups ?? []) await enqueueRemoveGroup({ datasetId: row._id.toString(), group });
  }
  return deleting.length + removing.length;
};
