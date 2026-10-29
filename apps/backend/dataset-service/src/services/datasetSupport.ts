import { ConflictError, licenseView, recordResourceEvent, type ResourceOwner } from '@visin/backend-core';
import { IDataset } from '../models/Dataset';
import * as files from '../clients/fileServiceClient';
import { sourceView } from '../providers';
import { lookupOwnerIdentities, type OwnerIdentity } from '../clients/ownerIdentityClient';
import { DatasetAccess, DatasetPermissions, permissionsOf } from './accessService';

export const DOWNLOAD_URL_MINUTES = 60;

export const isImportActive = (dataset: IDataset): boolean => {
  const current = dataset.import;
  return Boolean(current && (current.status === 'queued' || current.status === 'running'));
};

/** Files other services show — a label job's tasks — must not be deleted from under them. */
export const assertNotHeld = (dataset: IDataset, action: string): void => {
  if (dataset.holds.length > 0) {
    throw new ConflictError(
      `Cannot ${action}: ${dataset.holds.length} labeling job(s) use this dataset's images. Delete those jobs first.`
    );
  }
};

export const signedUrls = (fileIds: (string | undefined)[]) =>
  files.getDownloadUrls(fileIds.filter((fileId): fileId is string => Boolean(fileId)), DOWNLOAD_URL_MINUTES);

/** What a client may see: no storage paths, holds reduced to a count. */
export const toDatasetView = (
  dataset: IDataset,
  permissions: DatasetPermissions,
  coverUrl?: string,
  ownerIdentity: Partial<OwnerIdentity> = {}
) => ({
  _id: dataset._id.toString(),
  name: dataset.name,
  description: dataset.description,
  // A group's `name` is shown when the caller is in it; a person's `name`, `handle` and `picture` are
  // what they agreed to show (nothing when they hid their profile).
  owner: { kind: dataset.owner.kind, id: dataset.owner.id, ...ownerIdentity },
  createdBy: dataset.createdBy,
  visibility: dataset.visibility,
  license: licenseView(dataset.license),
  credit: dataset.credit,
  trashedAt: dataset.trashedAt,
  source: dataset.source ? sourceView(dataset.source) : undefined,
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

/** The caller's view of one dataset; group lookups are memoized by `access`. */
export const viewFor = async (access: DatasetAccess, dataset: IDataset, coverUrl?: string, owners?: Map<string, OwnerIdentity>) => {
  // `owners` is what a whole list asked for at once; a single dataset asks for itself. A group's members
  // also see its name when it has no public page.
  const { id: _id, ...shown } = (owners ?? (await lookupOwnerIdentities([dataset.owner]))).get(dataset.owner.id) ?? { id: '' };
  let identity: Partial<OwnerIdentity> = shown;
  if (dataset.owner.kind === 'group') {
    const name = (await access.myGroups()).find((group) => group.groupId === dataset.owner.id)?.name;
    if (name) identity = { ...shown, name };
  }
  return toDatasetView(dataset, permissionsOf(await access.permission(dataset)), coverUrl, identity);
};

export const withCovers = async (access: DatasetAccess, datasets: IDataset[]) => {
  const { urls } = await signedUrls(datasets.map((dataset) => dataset.coverFileId));
  const owners = await lookupOwnerIdentities(datasets.map((dataset) => dataset.owner));
  return Promise.all(
    datasets.map((dataset) => viewFor(access, dataset, dataset.coverFileId ? urls[dataset.coverFileId] : undefined, owners))
  );
};

export const recordEvent = (
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
