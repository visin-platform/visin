import { ConflictError, ForbiddenError, logger, NotFoundError } from '@visin/backend-core';
import { Dataset, IDataset } from '../models/Dataset';
import { enqueueDelete, removeQueuedImport } from '../queue/importQueue';
import { DatasetAccess, LIVE, permissionsOf, requireDataset } from './accessService';
import { assertNotHeld, viewFor, withCovers, recordEvent } from './datasetSupport';

/** How long a trashed dataset can still be restored before the sweeper deletes it. */
export const TRASH_DAYS = 30;

/**
 * Move the dataset to the trash: hidden at once, with its label jobs, and
 * restorable by its owner for 30 days. Its files stay until then.
 */
export const trashDataset = async (access: DatasetAccess, id: string): Promise<void> => {
  const dataset = await requireDataset(access, id, 'manage');
  const marked = await Dataset.updateOne({ _id: dataset._id, ...LIVE }, { $set: { trashedAt: new Date() } });
  if (marked.matchedCount === 0) throw new ConflictError('The dataset is already in the trash');
  recordEvent(dataset, access.requireUser(), 'trash');
  logger.info('Dataset moved to the trash', { datasetId: id });
};

/** A trashed dataset, when the caller may do at least `min` with it. */
const trashedDataset = async (access: DatasetAccess, id: string, min: 'manage' | 'own'): Promise<IDataset> => {
  access.requireUser();
  const dataset = /^[0-9a-fA-F]{24}$/.test(id)
    ? await Dataset.findOne({ _id: id, trashedAt: { $exists: true }, deletingAt: { $exists: false } })
    : null;
  if (!dataset) throw new NotFoundError('No such dataset in the trash');
  const permission = permissionsOf(await access.permission(dataset));
  if (!permission[min]) throw new ForbiddenError("Only the dataset's owner, or the owning group's owner, can do this");
  return dataset;
};

export const restoreDataset = async (access: DatasetAccess, id: string) => {
  const dataset = await trashedDataset(access, id, 'own');
  dataset.trashedAt = undefined;
  await dataset.save();
  recordEvent(dataset, access.requireUser(), 'restore');
  return viewFor(access, dataset);
};

/** Trashed datasets the caller manages, most recently trashed first. */
export const listTrash = async (access: DatasetAccess) => {
  access.requireUser();
  const datasets = await Dataset.find({
    ...(await access.ownership.filter('manage')),
    trashedAt: { $exists: true },
    deletingAt: { $exists: false }
  }).sort({ trashedAt: -1 });
  return withCovers(access, datasets);
};

/**
 * Hand a dataset to the delete worker: its files, then its rows, then it. A
 * held dataset (labeling jobs still use its images) is refused, checked in the
 * same update that marks it, so a hold taken meanwhile wins.
 */
const purge = async (dataset: IDataset, actorId: string): Promise<boolean> => {
  const activeImport = dataset.import && (dataset.import.status === 'queued' || dataset.import.status === 'running');
  const marked = await Dataset.updateOne(
    { _id: dataset._id, holds: { $size: 0 }, deletingAt: { $exists: false } },
    {
      $set: {
        deletingAt: new Date(),
        // A running import stops at its next heartbeat and removes what it stored.
        ...(activeImport ? { 'import.status': 'cancelled', 'import.finishedAt': new Date() } : {})
      }
    }
  );
  if (marked.matchedCount === 0) return false;
  if (activeImport) await removeQueuedImport(dataset.import!.deliveryId ?? dataset.import!.id);
  await enqueueDelete({ datasetId: dataset._id.toString() });
  recordEvent(dataset, actorId, 'purge');
  logger.info('Dataset deletion queued', { datasetId: dataset._id.toString() });
  return true;
};

/** Empty one dataset from the trash now, rather than in 30 days. */
export const deletePermanently = async (access: DatasetAccess, id: string): Promise<void> => {
  const dataset = await trashedDataset(access, id, 'own');
  assertNotHeld(dataset, 'delete this dataset');
  if (!(await purge(dataset, access.requireUser()))) {
    throw new ConflictError('The dataset is in use by a labeling job, or already being deleted');
  }
};

/**
 * The sweeper's run: delete every dataset trashed more than 30 days ago. One
 * still held by labeling jobs stays in the trash until they are deleted.
 * Idempotent, so a missed or repeated run does no harm.
 */
export const purgeExpiredTrash = async (now = new Date()): Promise<number> => {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  const expired = await Dataset.find({ trashedAt: { $lte: cutoff }, deletingAt: { $exists: false }, holds: { $size: 0 } });
  let purged = 0;
  for (const dataset of expired) if (await purge(dataset, 'system')) purged += 1;
  if (purged > 0) logger.info('Purged expired datasets from the trash', { count: purged });
  return purged;
};
