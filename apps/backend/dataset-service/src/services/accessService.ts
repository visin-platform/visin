import { QueryFilter } from 'mongoose';
import {
  atLeast,
  createOwnershipAccess,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  type MyGroup,
  type OwnershipAccess,
  type Permission
} from '@visin/backend-core';
import { Dataset, IDataset } from '../models/Dataset';
import * as groups from '../clients/groupServiceClient';

/** What the caller may do with one dataset, as the API reports it. */
export interface DatasetPermissions {
  read: boolean;
  contribute: boolean;
  manage: boolean;
  own: boolean;
}

export const permissionsOf = (permission: Permission): DatasetPermissions => ({
  read: atLeast(permission, 'read'),
  contribute: atLeast(permission, 'contribute'),
  manage: atLeast(permission, 'manage'),
  own: atLeast(permission, 'own')
});

/**
 * What one caller may do with datasets, for the length of one request: the
 * shared ownership rules (backend-core `resolveAccess`), with group lookups
 * memoized. Build one per request and never share it: a membership change must
 * be seen by the next request, not served from a stale memo.
 */
export interface DatasetAccess {
  userId?: string;
  requireUser(): string;
  permission(dataset: Pick<IDataset, 'owner' | 'visibility'>): Promise<Permission>;
  /** the caller's groups with their roles */
  myGroups(): Promise<MyGroup[]>;
  /** live datasets the caller may do at least `min` with */
  filter(min?: Permission): Promise<QueryFilter<IDataset>>;
  /** the underlying ownership access, for checks beyond one dataset (a transfer) */
  ownership: OwnershipAccess;
}

/** Neither in the trash nor being deleted: what every read sees. */
// `owner`: one the old service made after the owner migration ran stays out of sight until `--apply` gives it one.
export const LIVE = { trashedAt: { $exists: false }, deletingAt: { $exists: false }, owner: { $exists: true } } as const;

export const createDatasetAccess = (userId?: string): DatasetAccess => {
  const ownership = createOwnershipAccess(userId, groups);
  return {
    userId,
    ownership,
    requireUser() {
      if (!userId) throw new UnauthorizedError('Authentication required');
      return userId;
    },
    // No owner: made by the old service after the owner migration ran; reachable once `--apply` has given it one.
    permission: async (dataset) => (dataset.owner ? ownership.permission(dataset) : 'none'),
    myGroups: () => ownership.myGroups(),
    filter: async (min = 'read') => ({ ...LIVE, ...(await ownership.filter(min)) }) as QueryFilter<IDataset>
  };
};

/** The live dataset, or 404 — also for a malformed id, which can name nothing. */
export const findDataset = async (id: string, withManifest = false): Promise<IDataset> => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new NotFoundError('Dataset not found');
  const query = Dataset.findOne({ _id: id, ...LIVE });
  const dataset = await (withManifest ? query.select('+manifest') : query);
  if (!dataset) throw new NotFoundError('Dataset not found');
  return dataset;
};

export const readableDataset = async (access: DatasetAccess, id: string): Promise<IDataset> => {
  const dataset = await findDataset(id);
  if (!atLeast(await access.permission(dataset), 'read')) {
    throw access.userId ? new ForbiddenError('This dataset is private to its owner') : new UnauthorizedError('Sign in to see this dataset');
  }
  return dataset;
};

const REFUSALS: Record<Exclude<Permission, 'none' | 'read'>, string> = {
  contribute: 'Only its owner, or members of the group that owns it, can add to this dataset',
  manage: 'Only its owner, or an owner or admin of the group that owns it, can change this dataset',
  own: "Only the dataset's owner, or the owning group's owner, can do this"
};

/** The live dataset, when the signed-in caller may do at least `needed` with it. */
export const requireDataset = async (
  access: DatasetAccess,
  id: string,
  needed: Exclude<Permission, 'none' | 'read'>
): Promise<IDataset> => {
  access.requireUser();
  const dataset = await readableDataset(access, id);
  if (!atLeast(await access.permission(dataset), needed)) throw new ForbiddenError(REFUSALS[needed]);
  return dataset;
};
