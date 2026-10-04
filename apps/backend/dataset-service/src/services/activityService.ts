import { Dataset } from '../models/Dataset';
import { LIVE } from './accessService';
import type { ActivityQuery } from '../validation/datasetSchemas';

/** One line of a public activity feed: a dataset someone made. */
export interface DatasetActivityItem {
  kind: 'dataset.created';
  at: string;
  dataset: { id: string; name: string; imageCount: number };
}

/**
 * The public datasets a person made, or a group owns, newest first.
 *
 * Derived from the datasets themselves on each request, never from a log, so a dataset made private, trashed or
 * deleted leaves it at once. Only public datasets count, whoever asks: the feed reads the same to its owner as to a
 * stranger. A person's means the ones they created, wherever those now belong; a group's, everything it owns.
 */
export async function listDatasetActivity({ user, owner, limit }: ActivityQuery): Promise<DatasetActivityItem[]> {
  const rows = await Dataset.find({
    ...LIVE,
    visibility: 'public',
    ...(user ? { createdBy: user } : { 'owner.kind': 'group', 'owner.id': owner })
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('name imageCount createdAt');
  return rows.map((row) => ({
    kind: 'dataset.created',
    at: row.createdAt.toISOString(),
    dataset: { id: row._id.toString(), name: row.name, imageCount: row.imageCount }
  }));
}
