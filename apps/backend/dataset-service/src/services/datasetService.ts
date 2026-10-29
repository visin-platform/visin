import { QueryFilter, Types } from 'mongoose';
import { BadRequestError, canTransfer, ConflictError, ForbiddenError, logger, NotFoundError, type ResourceOwner } from '@visin/backend-core';
import { Dataset, IDataset } from '../models/Dataset';
import { DatasetItem } from '../models/DatasetItem';
import { summarizeItems } from './importService';
import { sourceInfo } from '../providers';
import { enqueueRemoveGroup } from '../queue/importQueue';
import * as groupService from '../clients/groupServiceClient';
import { DatasetAccess, readableDataset, requireDataset } from './accessService';
import type { CreateDatasetBody, ListDatasetsQuery, UpdateDatasetBody } from '../validation/datasetSchemas';
import { isImportActive, assertNotHeld, signedUrls, viewFor, withCovers, recordEvent } from './datasetSupport';

// The service's public surface stays here, whichever file a piece now lives in.
export { toDatasetView } from './datasetSupport';
export * from './datasetTrash';
export * from './datasetArchive';
export * from './datasetImport';

export const datasetStoragePrefix = (id: Types.ObjectId | string): string => `datasets/${id}/`;

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `owner=me`, `owner=<groupId>` or `user=<userId>`: a list narrowed to one owner. */
const ownerFilter = (access: DatasetAccess, owner?: string, user?: string) => {
  if (user) return { 'owner.kind': 'user', 'owner.id': user };
  if (!owner) return {};
  if (owner === 'me') return { 'owner.kind': 'user', 'owner.id': access.userId ?? '' };
  return { 'owner.kind': 'group', 'owner.id': owner };
};

export const listDatasets = async (access: DatasetAccess, query: ListDatasetsQuery) => {
  const filter = {
    $and: [
      await access.filter('read'),
      ownerFilter(access, query.owner, query.user),
      query.visibility ? { visibility: query.visibility } : {},
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
    license: body.license,
    credit: body.credit || undefined,
    storagePrefix: datasetStoragePrefix(_id)
  });
  logger.info('Dataset created', { datasetId: _id.toString(), owner, createdBy: userId });
  return viewFor(access, dataset);
};

/** Name, description and licence need `manage`; who can see it needs `own`. */
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
  if (body.license !== undefined) dataset.license = body.license ?? undefined;
  if (body.credit !== undefined) dataset.credit = body.credit || undefined;
  await dataset.save();
  return viewFor(access, dataset);
};

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

/** What the store says about a dataset kept on one; anyone who may read the dataset may see it. */
export const getHubInfo = async (access: DatasetAccess, id: string) => {
  const dataset = await readableDataset(access, id);
  if (!dataset.source) throw new BadRequestError('This dataset is not kept on an external store');
  return sourceInfo(dataset.source);
};
