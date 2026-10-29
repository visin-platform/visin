import { randomUUID } from 'crypto';
import { QueryFilter, Types } from 'mongoose';
import { BadGatewayError, BadRequestError, ConflictError, getUploadPolicy, logger, NotFoundError } from '@visin/backend-core';
import { Dataset, IDataset } from '../models/Dataset';
import * as files from '../clients/fileServiceClient';
import { sourceView } from '../providers';
import { enqueueScan } from '../queue/importQueue';
import { DatasetAccess, LIVE, readableDataset, requireDataset } from './accessService';
import type { ArchiveUploadBody } from '../validation/datasetSchemas';
import { DOWNLOAD_URL_MINUTES, isImportActive, assertNotHeld, viewFor } from './datasetSupport';

const UPLOAD_URL_MINUTES = 240;

const sanitizeFilename = (filename: string): string => {
  const base = filename.split(/[\\/]/).pop() || 'dataset.zip';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'dataset.zip';
};

/** The file an interrupted upload was sending, chosen again. One recorded before sizes were (no `size`) matches by name. */
const isSameFile = (pending: NonNullable<IDataset['pendingUpload']>, body: ArchiveUploadBody): boolean =>
  pending.filename === body.filename &&
  (pending.size === undefined || (pending.size === body.size && pending.lastModified === body.lastModified));

/** Reservations and adoption compete with holds and imports on the same record. */
const archiveMutation = (dataset: IDataset): QueryFilter<IDataset> => ({
  _id: dataset._id, ...LIVE, holds: { $size: 0 },
  'import.status': { $nin: ['queued', 'running'] },
  'pendingUpload.fileId': dataset.pendingUpload?.fileId ?? { $exists: false },
  'pendingUpload.discarding': { $ne: true },
  'archive.fileId': dataset.archive?.fileId ?? { $exists: false }
});

const archiveChanged = () => new ConflictError('The dataset or upload changed. Reload and try again.');

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
  const dataset = await requireDataset(access, id, 'contribute');
  assertNotHeld(dataset, 'replace the zip');
  if (isImportActive(dataset)) throw new ConflictError('An import is running — wait for it or cancel it first');

  const pending = dataset.pendingUpload;
  if (pending?.discarding) throw new ConflictError('This upload is being discarded. Retry discarding it first.');
  const policyFor = (fileId: string) => getUploadPolicy(fileId, 'application/zip', 'archive');
  if (pending && isSameFile(pending, body)) {
    if (await files.getFileSize(pending.fileId)) return { uploaded: true, resumed: true };
    let upload: Awaited<ReturnType<typeof files.getUploadUrl>> | undefined;
    try {
      upload = await files.getUploadUrl(pending.fileId, policyFor(pending.fileId).maxBytes, UPLOAD_URL_MINUTES);
    } catch (err) {
      logger.warn('Could not resume a dataset upload; starting it again', { datasetId: id, error: (err as Error).message });
    }
    if (upload) {
      const resumed = await Dataset.updateOne(archiveMutation(dataset), { $set: { 'pendingUpload.expiresAt': new Date(upload.expiresMs) } });
      if (!resumed.matchedCount) throw archiveChanged();
      return { uploadUrl: upload.url, expiresAt: new Date(upload.expiresMs).toISOString(), uploaded: false, resumed: true };
    }
  }

  const fileId = `${dataset.storagePrefix}archives/${randomUUID()}-${sanitizeFilename(body.filename)}`;
  const upload = await files.getUploadUrl(fileId, policyFor(fileId).maxBytes, UPLOAD_URL_MINUTES);
  const reservation = {
    fileId,
    filename: body.filename,
    size: body.size,
    lastModified: body.lastModified,
    expiresAt: new Date(upload.expiresMs)
  };
  const reserved = await Dataset.updateOne(archiveMutation(dataset), { $set: { pendingUpload: reservation } });
  if (!reserved.matchedCount) throw archiveChanged();
  // Delete only after winning adoption. A stale request must never remove a
  // pending archive another request has already adopted as the current one.
  if (pending) {
    await files.deleteFile(pending.fileId).catch((err: Error) =>
      logger.warn('Could not delete an abandoned dataset upload', { datasetId: id, error: err.message })
    );
  }
  return { uploadUrl: upload.url, expiresAt: new Date(upload.expiresMs).toISOString(), uploaded: false, resumed: false };
};

/**
 * Give up on an interrupted upload: its partial bytes are deleted and the
 * dataset keeps the zip it had. Nothing to discard is not an error.
 */
export const discardArchiveUpload = async (access: DatasetAccess, id: string) => {
  const dataset = await requireDataset(access, id, 'contribute');
  const pending = dataset.pendingUpload;
  if (pending) {
    const claimed = await Dataset.updateOne(
      { _id: dataset._id, ...LIVE, 'pendingUpload.fileId': pending.fileId,
        'archive.fileId': dataset.archive?.fileId ?? { $exists: false } },
      { $set: { 'pendingUpload.discarding': true } }
    );
    if (!claimed.matchedCount) throw archiveChanged();
    await files.deleteFile(pending.fileId);
    const discarded = await Dataset.findOneAndUpdate(
      { _id: dataset._id, 'pendingUpload.fileId': pending.fileId, 'pendingUpload.discarding': true },
      { $unset: { pendingUpload: '' } }, { returnDocument: 'after' }
    );
    if (!discarded) throw archiveChanged();
    logger.info('Dataset upload discarded', { datasetId: id });
    return viewFor(access, discarded);
  }
  return viewFor(access, dataset);
};

/**
 * Hand reading the archive's index to the worker; the page polls `scan`. Only
 * while `fileId` is still the archive: a rescan racing a replacement must not
 * point the scan back at the old zip and write its contents over the new one.
 */
const queueScan = async (dataset: IDataset, fileId: string): Promise<IDataset> => {
  const scan = { id: new Types.ObjectId().toString(), status: 'queued', fileId };
  const queued = await Dataset.findOneAndUpdate(
    { _id: dataset._id, ...LIVE, 'archive.fileId': fileId },
    { $set: { scan } },
    { returnDocument: 'after' }
  );
  if (!queued) throw archiveChanged();
  await enqueueScan({ datasetId: dataset._id.toString(), fileId, scanId: scan.id });
  return queued;
};

/**
 * Adopt the uploaded zip and drop the archive it replaces, then queue reading
 * its index — the request returns at once, so the browser can leave. Takes no
 * file id: the reservation already holds the one this service issued, so a
 * client can't swap in another file. Safe to call again for an upload whose
 * confirmation never arrived (a closed tab): it checks the bytes are there.
 */
export const completeArchiveUpload = async (access: DatasetAccess, id: string) => {
  const dataset = await requireDataset(access, id, 'contribute');
  const pending = dataset.pendingUpload;
  // Adopted already, whose answer was lost (a queue outage answers 503 after the
  // archive is saved): finishing is done, and the sweeper owns the scan.
  if (!pending && dataset.archive && dataset.scan?.fileId === dataset.archive.fileId) return viewFor(access, dataset);
  if (!pending) throw new BadRequestError('No upload is in progress for this dataset');
  assertNotHeld(dataset, 'replace the zip');
  if (isImportActive(dataset)) throw new ConflictError('An import is running — wait for it or cancel it first');

  const size = await files.getFileSize(pending.fileId);
  if (!size) throw new BadRequestError('The upload has not arrived — upload the zip again');
  const previous = dataset.archive?.fileId;
  const scan = { id: new Types.ObjectId().toString(), status: 'queued', fileId: pending.fileId };
  const adopted = await Dataset.findOneAndUpdate(archiveMutation(dataset), {
    $set: { archive: { fileId: pending.fileId, filename: pending.filename, size, uploadedAt: new Date() }, scan },
    $unset: { pendingUpload: '', contents: '' }
  }, { returnDocument: 'after' });
  if (!adopted) throw archiveChanged();
  // Before the enqueue: a 503 from Redis leaves the scan for recovery, and
  // nothing would come back for the replaced zip's bytes.
  if (previous && previous !== pending.fileId) await files.deleteFile(previous);
  await enqueueScan({ datasetId: id, fileId: pending.fileId, scanId: scan.id });
  logger.info('Dataset archive uploaded', { datasetId: id, size });
  return viewFor(access, adopted);
};

/**
 * Read the index of a zip that is already stored — what a dataset migrated from
 * label-service needs before its contents can be shown or re-mapped, and the
 * way to retry a scan that failed. Queued, like the one after an upload.
 */
export const rescanArchive = async (access: DatasetAccess, id: string) => {
  const dataset = await requireDataset(access, id, 'contribute');
  if (!dataset.archive) throw new BadRequestError('This dataset has no zip yet');
  return viewFor(access, await queueScan(dataset, dataset.archive.fileId));
};

/**
 * How to fetch the dataset. A Hub source is listed first: the client downloads it
 * from the Hub when it can, and falls back to the zip kept here (`downloadUrl`)
 * when there is one. A dataset on the Hub alone has no `downloadUrl`.
 */
export const getArchiveDownload = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  const source = dataset.source ? sourceView(dataset.source) : undefined;
  if (!dataset.archive) {
    if (!source) throw new BadRequestError('This dataset has no zip yet');
    return { source, revision: source.revision };
  }
  const { urls, expiresMs } = await files.getDownloadUrls([dataset.archive.fileId], DOWNLOAD_URL_MINUTES);
  return { ...(source ? { source } : {}), downloadUrl: urls[dataset.archive.fileId], filename: dataset.archive.filename,
    size: dataset.archive.size, revision: source?.revision ?? dataset.archive.uploadedAt.toISOString(),
    archiveRevision: dataset.archive.uploadedAt.toISOString(), expiresAt: new Date(expiresMs).toISOString() };
};

/**
 * The zip itself, for a caller that takes one response as the data: a dataspace connector's data plane forwards the
 * body it gets and follows nothing inside it, so a signed link would send its consumer around the contract. Served
 * only for a dataset that declares its licence, so whatever leaves this way carries its terms.
 */
export const servableArchive = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  if (!dataset.archive) throw new NotFoundError('This dataset has no zip');
  if (!dataset.license) throw new ConflictError('This dataset declares no licence; state one before serving its zip');
  const { fileId, filename, size, uploadedAt } = dataset.archive;
  return { datasetId: id, fileId, filename: sanitizeFilename(filename), size, uploadedAt };
};

/** The archive's bytes from storage: all of them, or the inclusive `range` a resuming client asked for. */
export const readArchive = async (
  archive: { datasetId: string; fileId: string },
  range?: { start: number; end: number }
) => {
  try {
    return range ? await files.getFileRange(archive.fileId, range.start, range.end) : await files.getFileStream(archive.fileId);
  } catch (err) {
    logger.error('Could not read a dataset zip from storage', { datasetId: archive.datasetId, error: (err as Error).message });
    throw new BadGatewayError('The zip could not be read from storage');
  }
};
