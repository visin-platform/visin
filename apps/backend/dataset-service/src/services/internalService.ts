import type { CoversBody, ResolveDatasetBody } from '../validation/datasetSchemas';
import { QueryFilter } from 'mongoose';
import { BadRequestError, ConflictError, NotFoundError, type Permission } from '@visin/backend-core';
import { Dataset } from '../models/Dataset';
import { DatasetItem, IDatasetItem } from '../models/DatasetItem';
import { createDatasetAccess, findDataset, LIVE } from './accessService';
import * as files from '../clients/fileServiceClient';
import type { InternalItemsQuery, JsonFieldsQuery } from '../validation/datasetSchemas';

/**
 * What other services (label-service) read and claim. Callers are trusted
 * services, so these answer with storage file ids and JSON content — things
 * the public API never hands a browser.
 */

const summary = (dataset: Awaited<ReturnType<typeof findDataset>>) => ({
  _id: dataset._id.toString(),
  name: dataset.name,
  description: dataset.description,
  owner: dataset.owner,
  visibility: dataset.visibility,
  groups: dataset.groups.filter((group) => !dataset.removingGroups?.includes(group.name)),
  imageCount: dataset.imageCount,
  importStatus: dataset.import?.status,
  holds: dataset.holds.map((hold) => ({ service: hold.service, ref: hold.ref }))
});

/** Live datasets an account may do at least `min` with: `manage` is what a label job wizard offers. */
export const listFor = async (userId: string | undefined, min: Permission = 'read') => {
  const access = createDatasetAccess(userId);
  const datasets = await Dataset.find(await access.filter(min)).sort({ name: 1 }).limit(500);
  return datasets.map(summary);
};

/** Their ids only, for label-service's job lists: "jobs on datasets where I can …". */
export const idsFor = async (userId: string | undefined, min: Permission = 'read'): Promise<string[]> => {
  const access = createDatasetAccess(userId);
  const datasets = await Dataset.find(await access.filter(min), { _id: 1 }).lean();
  return datasets.map((dataset) => dataset._id.toString());
};

/** What an account may do with one live dataset; a trashed one is not found. */
export const permissionFor = async (id: string, userId: string | undefined): Promise<Permission> =>
  createDatasetAccess(userId).permission(await findDataset(id));

const COVER_URL_MINUTES = 60;

/**
 * The cover picture of each named dataset the reader may see, by dataset id. A dataset the reader may not read, a
 * trashed one and one with no cover are left out rather than reported, so asking says nothing about what exists.
 */
export const coversFor = async ({ ids, userId }: CoversBody): Promise<Record<string, string>> => {
  const access = createDatasetAccess(userId);
  const datasets = await Dataset.find({ $and: [await access.filter('read'), { _id: { $in: ids } }] }, { coverFileId: 1 }).lean();
  const withCover = datasets.filter((dataset) => dataset.coverFileId);
  if (withCover.length === 0) return {};
  const { urls } = await files.getDownloadUrls(withCover.map((dataset) => dataset.coverFileId as string), COVER_URL_MINUTES);
  return Object.fromEntries(
    withCover.flatMap((dataset) => {
      const url = urls[dataset.coverFileId as string];
      return url ? [[dataset._id.toString(), url]] : [];
    })
  );
};

export const getDatasetSummary = async (id: string) => summary(await findDataset(id));

/**
 * Items in path order, a page at a time: `after` is the last path of the
 * previous page. Keyset rather than skip, so reading 12,000 rows costs twelve
 * indexed range scans instead of a quadratic walk.
 */
export const listItemsAfter = async (id: string, query: InternalItemsQuery) => {
  const dataset = await findDataset(id);
  const filter: QueryFilter<IDatasetItem> = { datasetId: dataset._id };
  // A group being removed must not reach a new labeling job.
  const hidden = dataset.removingGroups ?? [];
  if (query.group !== undefined) filter.group = hidden.includes(query.group) ? { $in: [] } : query.group;
  else if (hidden.length) filter.group = { $nin: hidden };
  if (query.kind) filter.kind = query.kind;
  if (query.variant) filter.variant = query.variant;
  else if (query.noVariant) filter.variant = { $exists: false };
  if (query.after) filter.path = { $gt: query.after };
  const items = await DatasetItem.find(filter).sort({ path: 1 }).limit(query.limit);
  return {
    items: items.map((item) => ({
      _id: item._id.toString(),
      group: item.group,
      path: item.path,
      stem: item.stem,
      variant: item.variant,
      kind: item.kind,
      fileId: item.fileId,
      thumbnailFileId: item.thumbnailFileId,
      width: item.width,
      height: item.height,
      size: item.size,
      mimetype: item.mimetype,
      ...(item.kind === 'json' ? { data: item.data } : {})
    })),
    next: items.length === query.limit ? items[items.length - 1].path : null
  };
};

// A field with more distinct values than this is an id or a score, not a group
// to slice by — offering it would flood a picker and select nothing useful.
const MAX_FIELD_VALUES = 40;

export interface JsonField {
  field: string;
  values: { value: string; count: number }[];
}

/**
 * Groupable fields across a group's JSON sidecars, with a count per value.
 *
 * A sidecar is an object or an array of objects (a frame's masks); each object
 * contributes its low-cardinality scalar fields. `id` is unique per record and
 * nested values aren't groupable, so neither is offered.
 */
export const jsonFields = async (id: string, query: JsonFieldsQuery): Promise<JsonField[]> => {
  const dataset = await findDataset(id);
  const tally = new Map<string, Map<string, number>>();
  const overflowed = new Set<string>();
  const cursor = DatasetItem.find(
    { datasetId: dataset._id, kind: 'json', group: query.group, ...(query.variant ? { variant: query.variant } : {}) },
    { data: 1 }
  ).cursor();

  for await (const item of cursor) {
    const records = Array.isArray(item.data) ? item.data : [item.data];
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      for (const [field, raw] of Object.entries(record as Record<string, unknown>)) {
        if (field === 'id' || raw === null || raw === undefined || typeof raw === 'object' || overflowed.has(field)) continue;
        const counts = tally.get(field) || new Map<string, number>();
        const value = String(raw);
        counts.set(value, (counts.get(value) || 0) + 1);
        if (counts.size > MAX_FIELD_VALUES) {
          overflowed.add(field);
          tally.delete(field);
          continue;
        }
        tally.set(field, counts);
      }
    }
  }

  return [...tally]
    .map(([field, counts]) => ({
      field,
      values: [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    }))
    .sort((a, b) => a.field.localeCompare(b.field));
};

export const getManifest = async (id: string) => (await findDataset(id, true)).manifest || [];

export const addHold = async (id: string, service: string, ref: string) => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new NotFoundError('Dataset not found');
  const acquired = await Dataset.updateOne(
    { _id: id, ...LIVE, 'removingGroups.0': { $exists: false },
      'import.status': { $nin: ['queued', 'running'] },
      holds: { $not: { $elemMatch: { service, ref } } } },
    { $push: { holds: { service, ref, createdAt: new Date() } } }
  );
  if (acquired.matchedCount > 0) return;
  // An ACK can be lost, including just before the dataset goes in the trash.
  // Confirm the identical claim rather than treating every no-op as success.
  if (await Dataset.exists({ _id: id, deletingAt: { $exists: false }, holds: { $elemMatch: { service, ref } } })) return;
  await findDataset(id);
  throw new ConflictError('Dataset images are being imported or removed; try again once that work finishes');
};

/**
 * Also for a dataset in the trash: a job deleted while its dataset is there
 * must still let go, or the dataset could never be deleted for good.
 */
export const removeHold = async (id: string, service: string, ref: string) => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new NotFoundError('Dataset not found');
  const released = await Dataset.updateOne({ _id: id, deletingAt: { $exists: false } }, { $pull: { holds: { service, ref } } });
  if (released.matchedCount === 0) throw new NotFoundError('Dataset not found');
};

/** What a group still owns, deleting ones left out: they are already on their way. */
export const ownedByGroup = async (groupId: string) => {
  const datasets = await Dataset.find({ 'owner.kind': 'group', 'owner.id': groupId, deletingAt: { $exists: false } })
    .select('name')
    .sort({ name: 1 })
    .limit(1000);
  return { count: datasets.length, names: datasets.slice(0, 5).map((dataset) => dataset.name) };
};

/** A training's pinned dataset reference; an ambiguous name must be replaced with its id. */
export async function resolveDatasetReference({ reference, userId, projectOwner }: ResolveDatasetBody) {
  const access = createDatasetAccess(userId, projectOwner);
  const filter = await access.filter('read');
  const candidates = await Dataset.find({ $and: [filter,
    /^[0-9a-fA-F]{24}$/.test(reference) ? { _id: reference } :
      { name: { $regex: `^${reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
  ] }).limit(2);
  if (!candidates.length) throw new NotFoundError('Dataset not found or not readable');
  if (candidates.length > 1) throw new BadRequestError('Dataset name is ambiguous; use its id');
  const dataset = candidates[0];
  // On the Hub, `revision` is the commit; the zip kept here is a second version of the same dataset, so a run
  // that used it records that too and a replaced zip does not hide behind an unchanged commit.
  return { source: 'visin', id: dataset._id.toString(), name: dataset.name,
    revision: dataset.source?.revision ?? dataset.archive?.uploadedAt.toISOString(),
    ...(dataset.source && dataset.archive ? { archiveRevision: dataset.archive.uploadedAt.toISOString() } : {}) };
}
