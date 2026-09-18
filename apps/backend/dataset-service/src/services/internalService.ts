import { QueryFilter } from 'mongoose';
import { Dataset } from '../models/Dataset';
import { DatasetItem, IDatasetItem } from '../models/DatasetItem';
import { createDatasetAccess, findDataset } from './accessService';
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
  ownerId: dataset.ownerId,
  visibility: dataset.visibility,
  groupId: dataset.groupId,
  groups: dataset.groups.filter((group) => !dataset.removingGroups?.includes(group.name)),
  imageCount: dataset.imageCount,
  importStatus: dataset.import?.status,
  holds: dataset.holds.map((hold) => ({ service: hold.service, ref: hold.ref }))
});

/** Datasets a user can read — what a label job wizard offers. */
export const listReadableFor = async (userId?: string) => {
  const access = createDatasetAccess(userId);
  const datasets = await Dataset.find(await access.readableFilter()).sort({ name: 1 }).limit(500);
  return datasets.map(summary);
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
  const dataset = await findDataset(id);
  await Dataset.updateOne(
    { _id: dataset._id, deletingAt: { $exists: false }, holds: { $not: { $elemMatch: { service, ref } } } },
    { $push: { holds: { service, ref, createdAt: new Date() } } }
  );
};

export const removeHold = async (id: string, service: string, ref: string) => {
  const dataset = await findDataset(id);
  await Dataset.updateOne({ _id: dataset._id }, { $pull: { holds: { service, ref } } });
};
