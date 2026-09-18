import { QueryFilter, Types } from 'mongoose';
import { NotFoundError } from '@visin/backend-core';
import { DatasetItem, IDatasetItem } from '../models/DatasetItem';
import * as files from '../clients/fileServiceClient';
import { DatasetAccess, readableDataset } from './accessService';
import type { ListItemsQuery } from '../validation/datasetSchemas';

const URL_MINUTES = 60;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toItemView = (item: IDatasetItem, urls: Record<string, string>, withData: boolean) => ({
  _id: item._id.toString(),
  group: item.group,
  path: item.path,
  stem: item.stem,
  variant: item.variant,
  kind: item.kind,
  width: item.width,
  height: item.height,
  size: item.size,
  mimetype: item.mimetype,
  // Migrated annotation layers were never thumbnailed; the full image stands in.
  thumbnailUrl: item.thumbnailFileId ? urls[item.thumbnailFileId] : item.fileId ? urls[item.fileId] : undefined,
  url: item.fileId ? urls[item.fileId] : undefined,
  ...(withData && item.kind === 'json' ? { data: item.data } : {})
});

/**
 * One page of a dataset's imported files, with signed URLs.
 *
 * JSON content is only included when asking for one stem — the lightbox showing
 * everything recorded about one frame — since a page of mask lists would be
 * megabytes nobody looks at.
 */
export const listItems = async (access: DatasetAccess, datasetId: string, query: ListItemsQuery) => {
  const dataset = await readableDataset(access, datasetId);
  const filter: QueryFilter<IDatasetItem> = { datasetId: dataset._id };
  // A group being removed is already gone for readers.
  const hidden = dataset.removingGroups ?? [];
  if (query.group) filter.group = hidden.includes(query.group) ? { $in: [] } : query.group;
  else if (hidden.length) filter.group = { $nin: hidden };
  if (query.kind) filter.kind = query.kind;
  if (query.stem) filter.stem = query.stem;
  if (query.search) filter.path = { $regex: escapeRegex(query.search), $options: 'i' };

  const withData = Boolean(query.stem);
  const [items, total] = await Promise.all([
    DatasetItem.find(filter, withData ? {} : { data: 0 })
      .sort({ group: 1, path: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    DatasetItem.countDocuments(filter)
  ]);
  const { urls, expiresMs } = await files.getDownloadUrls(
    items.flatMap((item) => [withData ? item.fileId : undefined, item.thumbnailFileId || item.fileId]).filter(Boolean) as string[],
    URL_MINUTES
  );
  return {
    items: items.map((item) => toItemView(item, urls, withData)),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    urlsExpireAt: new Date(expiresMs).toISOString()
  };
};

/** One file with its full-size URL and, for JSON, its content. */
export const getItem = async (access: DatasetAccess, datasetId: string, itemId: string) => {
  const dataset = await readableDataset(access, datasetId);
  const item = Types.ObjectId.isValid(itemId) ? await DatasetItem.findOne({ _id: itemId, datasetId: dataset._id }) : null;
  if (!item) throw new NotFoundError('Item not found');
  const { urls } = await files.getDownloadUrls([item.fileId, item.thumbnailFileId].filter(Boolean) as string[], URL_MINUTES);
  return toItemView(item, urls, true);
};
