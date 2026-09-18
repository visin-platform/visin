import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { BadRequestError, ConflictError, ForbiddenError, getUploadPolicy, logger } from '@visin/backend-core';
import { Dataset, IDataset, ImportMapping } from '../models/Dataset';
import { DatasetItem } from '../models/DatasetItem';
import * as files from '../clients/fileServiceClient';
import { enqueueImport, enqueueScan, removeQueuedImport } from '../queue/importQueue';
import { normalizeFolder } from '../utils/zipPaths';
import { DatasetAccess, readableDataset, writableDataset } from './accessService';
import type { ArchiveUploadBody, CreateDatasetBody, ListDatasetsQuery, UpdateDatasetBody } from '../validation/datasetSchemas';

const UPLOAD_URL_MINUTES = 240;
const DOWNLOAD_URL_MINUTES = 60;
// The worker flushes its heartbeat at least every 5s while running, so an import
// silent for this long died with its process.
const IMPORT_STALE_MS = Number(process.env.DATASET_IMPORT_STALE_MINUTES || 10) * 60 * 1000;

export const datasetStoragePrefix = (id: Types.ObjectId | string): string => `datasets/${id}/`;

const sanitizeFilename = (filename: string): string => {
  const base = filename.split(/[\\/]/).pop() || 'dataset.zip';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'dataset.zip';
};

const isImportActive = (dataset: IDataset): boolean => {
  const current = dataset.import;
  if (!current || (current.status !== 'queued' && current.status !== 'running')) return false;
  if (current.status === 'queued') return true;
  const heartbeat = current.heartbeatAt ? new Date(current.heartbeatAt).getTime() : 0;
  return heartbeat >= Date.now() - IMPORT_STALE_MS;
};

/** Files other services show — a label job's tasks — must not be deleted from under them. */
const assertNotHeld = (dataset: IDataset, action: string): void => {
  if (dataset.holds.length > 0) {
    throw new ConflictError(
      `Cannot ${action}: ${dataset.holds.length} labeling job(s) use this dataset's images. Delete those jobs first.`
    );
  }
};

const signedUrls = (fileIds: (string | undefined)[]) =>
  files.getDownloadUrls(fileIds.filter((fileId): fileId is string => Boolean(fileId)), DOWNLOAD_URL_MINUTES);

/** What a client may see: no storage paths, holds reduced to a count. */
export const toDatasetView = (dataset: IDataset, canWrite: boolean, coverUrl?: string) => ({
  _id: dataset._id.toString(),
  name: dataset.name,
  description: dataset.description,
  ownerId: dataset.ownerId,
  visibility: dataset.visibility,
  groupId: dataset.groupId,
  archive: dataset.archive ? { filename: dataset.archive.filename, size: dataset.archive.size, uploadedAt: dataset.archive.uploadedAt } : undefined,
  uploading: dataset.pendingUpload ? { filename: dataset.pendingUpload.filename, size: dataset.pendingUpload.size } : undefined,
  contents: dataset.contents,
  scan: dataset.scan ? { status: dataset.scan.status, error: dataset.scan.error, finishedAt: dataset.scan.finishedAt } : undefined,
  groups: dataset.groups,
  imageCount: dataset.imageCount,
  coverUrl,
  import: dataset.import
    ? {
        id: dataset.import.id,
        status: dataset.import.status,
        mapping: dataset.import.mapping,
        processed: dataset.import.processed,
        skipped: dataset.import.skipped,
        total: dataset.import.total,
        errors: dataset.import.errors,
        startedAt: dataset.import.startedAt,
        finishedAt: dataset.import.finishedAt,
        // true when the archive was replaced after this import ran
        stale: Boolean(dataset.archive && dataset.import.archiveFileId !== dataset.archive.fileId)
      }
    : undefined,
  usedBy: dataset.holds.length,
  canWrite,
  createdAt: dataset.createdAt,
  updatedAt: dataset.updatedAt
});

export const listDatasets = async (access: DatasetAccess, query: ListDatasetsQuery) => {
  const filter = {
    ...(await access.readableFilter()),
    ...(query.search ? { name: { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {})
  };
  const [datasets, total] = await Promise.all([
    Dataset.find(filter)
      .sort({ updatedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Dataset.countDocuments(filter)
  ]);
  const { urls } = await signedUrls(datasets.map((dataset) => dataset.coverFileId));
  const views = await Promise.all(
    datasets.map(async (dataset) =>
      toDatasetView(dataset, await access.canWrite(dataset), dataset.coverFileId ? urls[dataset.coverFileId] : undefined)
    )
  );
  return { datasets: views, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
};

export const getDataset = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  const { urls } = await signedUrls([dataset.coverFileId]);
  return toDatasetView(dataset, await access.canWrite(dataset), dataset.coverFileId ? urls[dataset.coverFileId] : undefined);
};

const assertGroupChoice = async (access: DatasetAccess, visibility?: string, groupId?: string): Promise<void> => {
  if (visibility === 'group' && groupId && !(await access.isMember(groupId))) {
    throw new ForbiddenError('You can only share a dataset with a group you belong to');
  }
};

export const createDataset = async (access: DatasetAccess, body: CreateDatasetBody) => {
  const ownerId = access.requireUser();
  await assertGroupChoice(access, body.visibility, body.groupId);
  const _id = new Types.ObjectId();
  const dataset = await Dataset.create({
    _id,
    ownerId,
    name: body.name,
    description: body.description || undefined,
    visibility: body.visibility || 'public',
    ...(body.visibility === 'group' ? { groupId: body.groupId } : {}),
    storagePrefix: datasetStoragePrefix(_id)
  });
  logger.info('Dataset created', { datasetId: _id.toString(), ownerId });
  return toDatasetView(dataset, true);
};

export const updateDataset = async (access: DatasetAccess, id: string, body: UpdateDatasetBody) => {
  const dataset = await writableDataset(access, id);
  if (body.visibility !== undefined) {
    await assertGroupChoice(access, body.visibility, body.groupId);
    dataset.visibility = body.visibility;
    dataset.groupId = body.visibility === 'group' ? body.groupId : undefined;
  }
  if (body.name !== undefined) dataset.name = body.name;
  if (body.description !== undefined) dataset.description = body.description || undefined;
  await dataset.save();
  return toDatasetView(dataset, await access.canWrite(dataset));
};

export const deleteDataset = async (access: DatasetAccess, id: string): Promise<void> => {
  const dataset = await writableDataset(access, id);
  assertNotHeld(dataset, 'delete this dataset');
  if (dataset.import && (dataset.import.status === 'queued' || dataset.import.status === 'running')) {
    // A running worker notices the dataset is gone at its next heartbeat and stops.
    await removeQueuedImport(dataset.import.id);
  }
  await files.deleteFolder(dataset.storagePrefix);
  await DatasetItem.deleteMany({ datasetId: dataset._id });
  await Dataset.deleteOne({ _id: dataset._id });
  logger.info('Dataset deleted', { datasetId: id });
};

/** The file an interrupted upload was sending, chosen again. One recorded before sizes were (no `size`) matches by name. */
const isSameFile = (pending: NonNullable<IDataset['pendingUpload']>, body: ArchiveUploadBody): boolean =>
  pending.filename === body.filename &&
  (pending.size === undefined || (pending.size === body.size && pending.lastModified === body.lastModified));

/**
 * Hand back a signed chunked-upload URL for a dataset's zip.
 *
 * The same file again (a closed tab, a dropped connection) gets the same
 * reservation back: file-service answers its first chunk with the offset it
 * already holds, so the upload continues from there — or, when every byte had
 * arrived, `uploaded: true` says only finishing is left. Anything else starts
 * a new reservation and deletes the abandoned one's partial bytes.
 */
export const createArchiveUpload = async (access: DatasetAccess, id: string, body: ArchiveUploadBody) => {
  const dataset = await writableDataset(access, id);
  assertNotHeld(dataset, 'replace the zip');
  if (isImportActive(dataset)) throw new ConflictError('An import is running — wait for it or cancel it first');

  const pending = dataset.pendingUpload;
  const policyFor = (fileId: string) => getUploadPolicy(fileId, 'application/zip', 'archive');
  if (pending && isSameFile(pending, body)) {
    if (await files.getFileSize(pending.fileId)) return { uploaded: true, resumed: true };
    try {
      const upload = await files.getUploadUrl(pending.fileId, policyFor(pending.fileId).maxBytes, UPLOAD_URL_MINUTES);
      dataset.pendingUpload = { ...pending, expiresAt: new Date(upload.expiresMs) };
      await dataset.save();
      return { uploadUrl: upload.url, expiresAt: new Date(upload.expiresMs).toISOString(), uploaded: false, resumed: true };
    } catch (err) {
      logger.warn('Could not resume a dataset upload; starting it again', { datasetId: id, error: (err as Error).message });
    }
  }
  if (pending) {
    await files.deleteFile(pending.fileId).catch((err: Error) =>
      logger.warn('Could not delete an abandoned dataset upload', { datasetId: id, error: err.message })
    );
  }

  const fileId = `${dataset.storagePrefix}archives/${randomUUID()}-${sanitizeFilename(body.filename)}`;
  const upload = await files.getUploadUrl(fileId, policyFor(fileId).maxBytes, UPLOAD_URL_MINUTES);
  dataset.pendingUpload = {
    fileId,
    filename: body.filename,
    size: body.size,
    lastModified: body.lastModified,
    expiresAt: new Date(upload.expiresMs)
  };
  await dataset.save();
  return { uploadUrl: upload.url, expiresAt: new Date(upload.expiresMs).toISOString(), uploaded: false, resumed: false };
};

/**
 * Give up on an interrupted upload: its partial bytes are deleted and the
 * dataset keeps the zip it had. Nothing to discard is not an error.
 */
export const discardArchiveUpload = async (access: DatasetAccess, id: string) => {
  const dataset = await writableDataset(access, id);
  const pending = dataset.pendingUpload;
  if (pending) {
    await files.deleteFile(pending.fileId);
    dataset.pendingUpload = undefined;
    await dataset.save();
    logger.info('Dataset upload discarded', { datasetId: id });
  }
  return toDatasetView(dataset, true);
};

/** Hand reading the archive's index to the worker; the page polls `scan`. */
const queueScan = async (dataset: IDataset, fileId: string): Promise<void> => {
  dataset.scan = { status: 'queued', fileId };
  dataset.markModified('scan');
  await dataset.save();
  await enqueueScan({ datasetId: dataset._id.toString(), fileId });
};

/**
 * Adopt the uploaded zip and drop the archive it replaces, then queue reading
 * its index — the request returns at once, so the browser can leave. Takes no
 * file id: the reservation already holds the one this service issued, so a
 * client can't swap in another file. Safe to call again for an upload whose
 * confirmation never arrived (a closed tab): it checks the bytes are there.
 */
export const completeArchiveUpload = async (access: DatasetAccess, id: string) => {
  const dataset = await writableDataset(access, id);
  const pending = dataset.pendingUpload;
  if (!pending) throw new BadRequestError('No upload is in progress for this dataset');
  assertNotHeld(dataset, 'replace the zip');

  const size = await files.getFileSize(pending.fileId);
  if (!size) throw new BadRequestError('The upload has not arrived — upload the zip again');
  const previous = dataset.archive?.fileId;
  dataset.archive = { fileId: pending.fileId, filename: pending.filename, size, uploadedAt: new Date() };
  dataset.pendingUpload = undefined;
  dataset.contents = undefined;
  await queueScan(dataset, pending.fileId);
  if (previous && previous !== pending.fileId) await files.deleteFile(previous);
  logger.info('Dataset archive uploaded', { datasetId: id, size });
  return toDatasetView(dataset, true);
};

/**
 * Read the index of a zip that is already stored — what a dataset migrated from
 * label-service needs before its contents can be shown or re-mapped, and the
 * way to retry a scan that failed. Queued, like the one after an upload.
 */
export const rescanArchive = async (access: DatasetAccess, id: string) => {
  const dataset = await writableDataset(access, id);
  if (!dataset.archive) throw new BadRequestError('This dataset has no zip yet');
  await queueScan(dataset, dataset.archive.fileId);
  return toDatasetView(dataset, true);
};

export const getArchiveDownload = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  if (!dataset.archive) throw new BadRequestError('This dataset has no zip yet');
  const { urls, expiresMs } = await files.getDownloadUrls([dataset.archive.fileId], DOWNLOAD_URL_MINUTES);
  return { downloadUrl: urls[dataset.archive.fileId], filename: dataset.archive.filename, expiresAt: new Date(expiresMs).toISOString() };
};

export const startImport = async (access: DatasetAccess, id: string, mapping: ImportMapping) => {
  const dataset = await writableDataset(access, id);
  assertNotHeld(dataset, 're-import');
  if (!dataset.archive) throw new BadRequestError('Upload a zip before importing');
  if (isImportActive(dataset)) throw new ConflictError('An import is already running for this dataset');
  if (dataset.import && (dataset.import.status === 'queued' || dataset.import.status === 'running')) {
    // Stale: its process died. Drop it from the queue so a late pickup can't race this one.
    await removeQueuedImport(dataset.import.id);
  }

  const groupNames = mapping.groups.map((row) => row.group);
  const importId = new Types.ObjectId().toString();
  dataset.import = {
    id: importId,
    status: 'queued',
    mapping: {
      groups: mapping.groups.map((row, index) => ({ folder: normalizeFolder(row.folder), group: groupNames[index] })),
      ...(mapping.manifest ? { manifest: normalizeFolder(mapping.manifest) } : {})
    },
    archiveFileId: dataset.archive.fileId,
    processed: 0,
    skipped: 0,
    errors: []
  };
  dataset.markModified('import');
  await dataset.save();
  await enqueueImport({ datasetId: dataset._id.toString(), importId });
  logger.info('Dataset import queued', { datasetId: id, importId, groups: groupNames.length });
  return toDatasetView(dataset, true);
};

export const cancelImport = async (access: DatasetAccess, id: string) => {
  const dataset = await writableDataset(access, id);
  const current = dataset.import;
  if (!current || (current.status !== 'queued' && current.status !== 'running')) {
    throw new ConflictError('No import is running');
  }
  await Dataset.updateOne(
    { _id: dataset._id, 'import.id': current.id },
    { $set: { 'import.status': 'cancelled', 'import.finishedAt': new Date() } }
  );
  await removeQueuedImport(current.id);
  return toDatasetView(await Dataset.findById(dataset._id).orFail(), true);
};
