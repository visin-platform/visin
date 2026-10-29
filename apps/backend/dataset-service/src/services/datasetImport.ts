import { Types } from 'mongoose';
import { BadRequestError, ConflictError, logger } from '@visin/backend-core';
import { Dataset, ImportMapping } from '../models/Dataset';
import { enqueueImport, removeQueuedImport } from '../queue/importQueue';
import { expectedImportFiles } from '../utils/contents';
import { normalizeFolder } from '../utils/zipPaths';
import { DatasetAccess, LIVE, requireDataset } from './accessService';
import { importDelivery, pendingWork } from './workIdentity';
import { isImportActive, assertNotHeld, viewFor } from './datasetSupport';

export const startImport = async (access: DatasetAccess, id: string, mapping: ImportMapping) => {
  const dataset = await requireDataset(access, id, 'contribute');
  assertNotHeld(dataset, 're-import');
  if (!dataset.archive) throw new BadRequestError('Upload a zip before importing');
  if (isImportActive(dataset)) throw new ConflictError('An import is already running for this dataset');
  if (dataset.removingGroups?.length) throw new ConflictError('An image group is still being removed — import once it is gone');
  // Queue recovery decides whether a running delivery really disappeared. A
  // stale heartbeat alone must not replace a job still active or delayed in Redis.

  const groupNames = mapping.groups.map((row) => row.group);
  const importId = new Types.ObjectId().toString();
  const groups = mapping.groups.map((row, index) => ({ folder: normalizeFolder(row.folder), group: groupNames[index] }));
  const expected = expectedImportFiles(dataset.contents, groups.map((row) => row.folder));
  const importing = {
    id: importId,
    status: 'queued',
    mapping: {
      groups,
      ...(mapping.manifest ? { manifest: normalizeFolder(mapping.manifest) } : {})
    },
    archiveFileId: dataset.archive.fileId,
    processed: 0,
    skipped: 0,
    errors: [],
    ...(expected !== undefined ? { expected } : {})
  };
  const started = await Dataset.findOneAndUpdate(
    {
      _id: dataset._id, ...LIVE, holds: { $size: 0 }, 'removingGroups.0': { $exists: false },
      'archive.fileId': dataset.archive.fileId,
      ...(dataset.import ? {
        'import.id': dataset.import.id, 'import.status': dataset.import.status,
        'import.deliveryId': dataset.import.deliveryId ?? { $exists: false }
      } : { import: { $exists: false } })
    },
    { $set: { import: importing } },
    { returnDocument: 'after' }
  );
  if (!started) throw new ConflictError('The dataset or import changed meanwhile — reload and try again');
  await enqueueImport({ datasetId: dataset._id.toString(), importId });
  logger.info('Dataset import queued', { datasetId: id, importId, groups: groupNames.length });
  return viewFor(access, started);
};

/**
 * Carry on with an import that was cancelled or failed part-way: the same
 * mapping and stored files, with a new delivery id so the old attempt's outcome
 * cannot overwrite it. Not for an import of a zip since replaced.
 */
export const resumeImport = async (access: DatasetAccess, id: string) => {
  const dataset = await requireDataset(access, id, 'contribute');
  assertNotHeld(dataset, 're-import');
  const current = dataset.import;
  if (!current || (current.status !== 'cancelled' && current.status !== 'failed')) {
    throw new ConflictError('Only a cancelled or failed import can be resumed');
  }
  if (!dataset.archive || current.archiveFileId !== dataset.archive.fileId) {
    throw new ConflictError('The zip was replaced since this import — start a new one');
  }
  if (dataset.removingGroups?.length) throw new ConflictError('An image group is still being removed — import once it is gone');
  const resumed = await Dataset.findOneAndUpdate(
    { ...importDelivery(id, current.id, current.deliveryId), ...LIVE, holds: { $size: 0 },
      'removingGroups.0': { $exists: false }, 'archive.fileId': current.archiveFileId, 'import.status': current.status },
    { $set: { 'import.status': 'queued', 'import.errors': [], 'import.deliveryId': new Types.ObjectId().toString() }, $unset: { 'import.finishedAt': '', 'import.heartbeatAt': '' } },
    { returnDocument: 'after' }
  );
  if (!resumed) throw new ConflictError('The import changed meanwhile — reload and try again');
  // Drop an old queued/terminal delivery where possible. A still active old
  // attempt is fenced by the new delivery id and stops at its next heartbeat.
  await removeQueuedImport(current.deliveryId ?? current.id);
  await enqueueImport({ datasetId: id, importId: current.id, deliveryId: resumed.import!.deliveryId });
  logger.info('Dataset import resumed', { datasetId: id, importId: current.id });
  return viewFor(access, resumed);
};

export const cancelImport = async (access: DatasetAccess, id: string) => {
  const dataset = await requireDataset(access, id, 'contribute');
  const current = dataset.import;
  if (!current || (current.status !== 'queued' && current.status !== 'running')) {
    throw new ConflictError('No import is running');
  }
  const cancelled = await Dataset.findOneAndUpdate(
    { ...importDelivery(id, current.id, current.deliveryId), 'import.status': pendingWork },
    { $set: { 'import.status': 'cancelled', 'import.finishedAt': new Date() } },
    { returnDocument: 'after' }
  );
  if (!cancelled) throw new ConflictError('The import changed meanwhile — reload and try again');
  await removeQueuedImport(current.deliveryId ?? current.id);
  return viewFor(access, cancelled);
};
