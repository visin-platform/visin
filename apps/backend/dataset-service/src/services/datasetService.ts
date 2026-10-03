import { randomUUID } from 'crypto';
import { QueryFilter, Types } from 'mongoose';
import {
  BadRequestError,
  canTransfer,
  ConflictError,
  ForbiddenError,
  getUploadPolicy,
  logger,
  NotFoundError,
  recordResourceEvent,
  type ResourceOwner
} from '@visin/backend-core';
import { Dataset, IDataset, ImportMapping } from '../models/Dataset';
import { DatasetItem } from '../models/DatasetItem';
import * as files from '../clients/fileServiceClient';
import { summarizeItems } from './importService';
import { hubSummary } from './hubService';
import { enqueueDelete, enqueueImport, enqueueRemoveGroup, enqueueScan, removeQueuedImport } from '../queue/importQueue';
import { expectedImportFiles } from '../utils/contents';
import { normalizeFolder } from '../utils/zipPaths';
import * as groupService from '../clients/groupServiceClient';
import { DatasetAccess, DatasetPermissions, LIVE, permissionsOf, readableDataset, requireDataset } from './accessService';
import type { ArchiveUploadBody, CreateDatasetBody, ListDatasetsQuery, UpdateDatasetBody } from '../validation/datasetSchemas';

/** How long a trashed dataset can still be restored before the sweeper deletes it. */
export const TRASH_DAYS = 30;

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
export const toDatasetView = (dataset: IDataset, permissions: DatasetPermissions, coverUrl?: string, ownerName?: string) => ({
  _id: dataset._id.toString(),
  name: dataset.name,
  description: dataset.description,
  // `name` is the owning group's, when the caller is in it.
  owner: { kind: dataset.owner.kind, id: dataset.owner.id, ...(ownerName ? { name: ownerName } : {}) },
  createdBy: dataset.createdBy,
  visibility: dataset.visibility,
  trashedAt: dataset.trashedAt,
  source: dataset.source ? { provider: dataset.source.provider, repo: dataset.source.repo, revision: dataset.source.revision } : undefined,
  archive: dataset.archive ? { filename: dataset.archive.filename, size: dataset.archive.size, uploadedAt: dataset.archive.uploadedAt } : undefined,
  uploading: dataset.pendingUpload ? { filename: dataset.pendingUpload.filename, size: dataset.pendingUpload.size } : undefined,
  contents: dataset.contents,
  scan: dataset.scan ? { status: dataset.scan.status, error: dataset.scan.error, finishedAt: dataset.scan.finishedAt } : undefined,
  // A group being removed is gone as far as readers are concerned.
  groups: dataset.groups.filter((group) => !dataset.removingGroups?.includes(group.name)),
  imageCount:
    dataset.imageCount -
    dataset.groups.filter((group) => dataset.removingGroups?.includes(group.name)).reduce((sum, group) => sum + group.images, 0),
  removingGroups: dataset.removingGroups ?? [],
  coverUrl,
  coverPath: dataset.coverPath,
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
        expected: dataset.import.expected,
        copiedBytes: dataset.import.copiedBytes,
        // true when the archive was replaced after this import ran
        stale: Boolean(dataset.archive && dataset.import.archiveFileId !== dataset.archive.fileId)
      }
    : undefined,
  usedBy: dataset.holds.length,
  permissions,
  createdAt: dataset.createdAt,
  updatedAt: dataset.updatedAt
});

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The caller's view of one dataset; group lookups are memoized by `access`. */
const viewFor = async (access: DatasetAccess, dataset: IDataset, coverUrl?: string) => {
  const ownerName =
    dataset.owner.kind === 'group' ? (await access.myGroups()).find((group) => group.groupId === dataset.owner.id)?.name : undefined;
  return toDatasetView(dataset, permissionsOf(await access.permission(dataset)), coverUrl, ownerName);
};

/** `owner=me` or `owner=<groupId>`: a list narrowed to one owner. */
const ownerFilter = (access: DatasetAccess, owner?: string) => {
  if (!owner) return {};
  if (owner === 'me') return { 'owner.kind': 'user', 'owner.id': access.userId ?? '' };
  return { 'owner.kind': 'group', 'owner.id': owner };
};

const withCovers = async (access: DatasetAccess, datasets: IDataset[]) => {
  const { urls } = await signedUrls(datasets.map((dataset) => dataset.coverFileId));
  return Promise.all(datasets.map((dataset) => viewFor(access, dataset, dataset.coverFileId ? urls[dataset.coverFileId] : undefined)));
};

export const listDatasets = async (access: DatasetAccess, query: ListDatasetsQuery) => {
  const filter = {
    $and: [
      await access.filter('read'),
      ownerFilter(access, query.owner),
      query.search ? { name: { $regex: escapeRegex(query.search), $options: 'i' } } : {}
    ]
  } as QueryFilter<IDataset>;
  const [datasets, total] = await Promise.all([
    Dataset.find(filter)
      .sort({ updatedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Dataset.countDocuments(filter)
  ]);
  return {
    datasets: await withCovers(access, datasets),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }
  };
};

export const getDataset = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  const { urls } = await signedUrls([dataset.coverFileId]);
  return viewFor(access, dataset, dataset.coverFileId ? urls[dataset.coverFileId] : undefined);
};

/**
 * A new dataset belongs to the caller, or to a group they are in. Making it
 * public at once takes what making it public later would: being its owner.
 */
export const createDataset = async (access: DatasetAccess, body: CreateDatasetBody) => {
  const userId = access.requireUser();
  const owner: ResourceOwner = body.owner ?? { kind: 'user', id: userId };
  if (owner.kind === 'user' && owner.id !== userId) throw new ForbiddenError('A dataset can belong to you or to one of your groups');
  if (owner.kind === 'group') {
    const { member, role } = await access.ownership.membership(owner.id);
    if (!member) throw new ForbiddenError('You can only create a dataset in a group you belong to');
    if (body.visibility === 'public' && role !== 'owner') {
      throw new ForbiddenError("Only the group's owner can make its datasets public");
    }
  }
  const _id = new Types.ObjectId();
  const dataset = await Dataset.create({
    _id,
    owner,
    createdBy: userId,
    name: body.name,
    description: body.description || undefined,
    visibility: body.visibility ?? 'private',
    source: body.source,
    storagePrefix: datasetStoragePrefix(_id)
  });
  logger.info('Dataset created', { datasetId: _id.toString(), owner, createdBy: userId });
  return viewFor(access, dataset);
};

/** Name and description need `manage`; who can see it needs `own`. */
export const updateDataset = async (access: DatasetAccess, id: string, body: UpdateDatasetBody) => {
  const dataset = await requireDataset(access, id, 'manage');
  if (body.visibility !== undefined && body.visibility !== dataset.visibility) {
    await requireDataset(access, id, 'own');
    dataset.visibility = body.visibility;
    recordEvent(dataset, access.requireUser(), 'visibility', { visibility: body.visibility });
  }
  if (body.name !== undefined) dataset.name = body.name;
  if (body.description !== undefined) dataset.description = body.description || undefined;
  if (body.source !== undefined) dataset.source = body.source ?? undefined;
  await dataset.save();
  return viewFor(access, dataset);
};

const recordEvent = (
  dataset: IDataset,
  actorId: string,
  action: 'transfer' | 'visibility' | 'trash' | 'restore' | 'purge',
  { owner = dataset.owner, ...extra }: { owner?: ResourceOwner; to?: ResourceOwner; visibility?: string } = {}
) =>
  recordResourceEvent({
    service: 'dataset-service',
    resourceType: 'dataset',
    resourceId: dataset._id.toString(),
    resourceName: dataset.name,
    action,
    actorId,
    owner,
    ...extra
  });

/**
 * Hand the dataset, with its label jobs, to another owner. Who may, per the
 * shared rules (backend-core `canTransfer`); no files move.
 */
export const transferDataset = async (access: DatasetAccess, id: string, to: ResourceOwner) => {
  const userId = access.requireUser();
  const dataset = await readableDataset(access, id);
  const check = await canTransfer(dataset.owner, to, userId, groupService.checkMembership);
  if (!check.allowed) throw new ForbiddenError(check.reason);
  const from = dataset.owner;
  dataset.owner = to;
  await dataset.save();
  recordEvent(dataset, userId, 'transfer', { owner: from, to });
  logger.info('Dataset transferred', { datasetId: id, from, to });
  return viewFor(access, dataset);
};

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
  if (activeImport) await removeQueuedImport(dataset.import!.id);
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
  const dataset = await requireDataset(access, id, 'contribute');
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
  const dataset = await requireDataset(access, id, 'contribute');
  const pending = dataset.pendingUpload;
  if (pending) {
    await files.deleteFile(pending.fileId);
    dataset.pendingUpload = undefined;
    await dataset.save();
    logger.info('Dataset upload discarded', { datasetId: id });
  }
  return viewFor(access, dataset);
};

/**
 * Pick the image a dataset's card shows, or (null) go back to the automatic
 * one. Stored by path as well as file, so a re-import keeps the choice.
 */
export const setCover = async (access: DatasetAccess, id: string, itemId: string | null) => {
  const dataset = await requireDataset(access, id, 'manage');
  if (itemId) {
    const item = await DatasetItem.findOne({ _id: itemId, datasetId: dataset._id, kind: 'image' });
    if (!item) throw new NotFoundError('That image is not in this dataset');
    dataset.coverPath = item.path;
    dataset.coverFileId = item.thumbnailFileId || item.fileId;
  } else {
    dataset.coverPath = undefined;
    dataset.coverFileId = (await summarizeItems(dataset._id)).coverFileId;
  }
  await dataset.save();
  const { urls } = await signedUrls([dataset.coverFileId]);
  return viewFor(access, dataset, dataset.coverFileId ? urls[dataset.coverFileId] : undefined);
};

/**
 * Remove one image group — a folder imported by mistake, say. Hidden at once;
 * the worker deletes its files and rows. Refused while a labeling job holds the
 * dataset (its tasks may show those images) and while an import runs.
 */
export const removeGroup = async (access: DatasetAccess, id: string, group: string) => {
  const dataset = await requireDataset(access, id, 'manage');
  assertNotHeld(dataset, 'remove an image group');
  if (isImportActive(dataset)) throw new ConflictError('An import is running — wait for it or cancel it first');
  if (!dataset.groups.some((row) => row.name === group)) throw new NotFoundError(`The dataset has no image group "${group}"`);
  const marked = await Dataset.findOneAndUpdate(
    { _id: dataset._id, holds: { $size: 0 }, removingGroups: { $ne: group } },
    { $addToSet: { removingGroups: group } },
    { returnDocument: 'after' }
  );
  if (!marked) throw new ConflictError('That group is already being removed, or a labeling job now uses this dataset');
  await enqueueRemoveGroup({ datasetId: id, group });
  logger.info('Dataset image group removal queued', { datasetId: id, group });
  return viewFor(access, marked);
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
  const dataset = await requireDataset(access, id, 'contribute');
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
  return viewFor(access, dataset);
};

/**
 * Read the index of a zip that is already stored — what a dataset migrated from
 * label-service needs before its contents can be shown or re-mapped, and the
 * way to retry a scan that failed. Queued, like the one after an upload.
 */
export const rescanArchive = async (access: DatasetAccess, id: string) => {
  const dataset = await requireDataset(access, id, 'contribute');
  if (!dataset.archive) throw new BadRequestError('This dataset has no zip yet');
  await queueScan(dataset, dataset.archive.fileId);
  return viewFor(access, dataset);
};

/** What the Hub says about a dataset's repo; anyone who may read the dataset may see it. */
export const getHubInfo = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  if (!dataset.source) throw new BadRequestError('This dataset is not kept on the Hugging Face Hub');
  return hubSummary(dataset.source);
};

/**
 * How to fetch the dataset. A Hub source is listed first: the client downloads it
 * from the Hub when it can, and falls back to the zip kept here (`downloadUrl`)
 * when there is one. A dataset on the Hub alone has no `downloadUrl`.
 */
export const getArchiveDownload = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  const source = dataset.source ? { provider: dataset.source.provider, repo: dataset.source.repo, revision: dataset.source.revision } : undefined;
  if (!dataset.archive) {
    if (!source) throw new BadRequestError('This dataset has no zip yet');
    return { source, revision: source.revision };
  }
  const { urls, expiresMs } = await files.getDownloadUrls([dataset.archive.fileId], DOWNLOAD_URL_MINUTES);
  return { ...(source ? { source } : {}), downloadUrl: urls[dataset.archive.fileId], filename: dataset.archive.filename,
    size: dataset.archive.size, revision: source?.revision ?? dataset.archive.uploadedAt.toISOString(),
    archiveRevision: dataset.archive.uploadedAt.toISOString(), expiresAt: new Date(expiresMs).toISOString() };
};

export const startImport = async (access: DatasetAccess, id: string, mapping: ImportMapping) => {
  const dataset = await requireDataset(access, id, 'contribute');
  assertNotHeld(dataset, 're-import');
  if (!dataset.archive) throw new BadRequestError('Upload a zip before importing');
  if (isImportActive(dataset)) throw new ConflictError('An import is already running for this dataset');
  if (dataset.removingGroups?.length) throw new ConflictError('An image group is still being removed — import once it is gone');
  if (dataset.import && (dataset.import.status === 'queued' || dataset.import.status === 'running')) {
    // Stale: its process died. Drop it from the queue so a late pickup can't race this one.
    await removeQueuedImport(dataset.import.id);
  }

  const groupNames = mapping.groups.map((row) => row.group);
  const importId = new Types.ObjectId().toString();
  const groups = mapping.groups.map((row, index) => ({ folder: normalizeFolder(row.folder), group: groupNames[index] }));
  const expected = expectedImportFiles(dataset.contents, groups.map((row) => row.folder));
  dataset.import = {
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
  dataset.markModified('import');
  await dataset.save();
  await enqueueImport({ datasetId: dataset._id.toString(), importId });
  logger.info('Dataset import queued', { datasetId: id, importId, groups: groupNames.length });
  return viewFor(access, dataset);
};

/**
 * Carry on with an import that was cancelled or failed part-way: the same
 * mapping, queued again under the same id, so the worker skips every file that
 * import already stored. Not for an import of a zip since replaced.
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
    { _id: dataset._id, 'import.id': current.id, 'import.status': current.status },
    { $set: { 'import.status': 'queued', 'import.errors': [] }, $unset: { 'import.finishedAt': '' } },
    { returnDocument: 'after' }
  );
  if (!resumed) throw new ConflictError('The import changed meanwhile — reload and try again');
  // A finished job keeps its id in the queue for a while; clear it, or the add is a no-op.
  await removeQueuedImport(current.id);
  await enqueueImport({ datasetId: id, importId: current.id });
  logger.info('Dataset import resumed', { datasetId: id, importId: current.id });
  return viewFor(access, resumed);
};

export const cancelImport = async (access: DatasetAccess, id: string) => {
  const dataset = await requireDataset(access, id, 'contribute');
  const current = dataset.import;
  if (!current || (current.status !== 'queued' && current.status !== 'running')) {
    throw new ConflictError('No import is running');
  }
  await Dataset.updateOne(
    { _id: dataset._id, 'import.id': current.id },
    { $set: { 'import.status': 'cancelled', 'import.finishedAt': new Date() } }
  );
  await removeQueuedImport(current.id);
  return viewFor(access, await Dataset.findById(dataset._id).orFail());
};
