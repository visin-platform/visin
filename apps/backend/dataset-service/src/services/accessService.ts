import { QueryFilter } from 'mongoose';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@visin/backend-core';
import { Dataset, IDataset } from '../models/Dataset';
import * as groups from '../clients/groupServiceClient';

/**
 * What one caller may see and change, for the length of one request.
 *
 * Group lookups are memoized per checker, so listing twenty group datasets
 * costs one membership call per distinct group, not per row. Build one per
 * request and never share it: a membership change must be seen by the next
 * request, not served from a stale memo.
 */
export interface DatasetAccess {
  userId?: string;
  canRead(dataset: Pick<IDataset, 'visibility' | 'ownerId' | 'groupId'>): Promise<boolean>;
  canWrite(dataset: Pick<IDataset, 'visibility' | 'ownerId' | 'groupId'>): Promise<boolean>;
  readableFilter(): Promise<QueryFilter<IDataset>>;
  requireUser(): string;
  isMember(groupId: string): Promise<boolean>;
}

export const createDatasetAccess = (userId?: string): DatasetAccess => {
  const memberships = new Map<string, Promise<groups.GroupMembership>>();
  const membership = (groupId: string): Promise<groups.GroupMembership> => {
    let found = memberships.get(groupId);
    if (!found) {
      found = userId ? groups.checkMembership(groupId, userId) : Promise.resolve({ member: false, role: null });
      memberships.set(groupId, found);
    }
    return found;
  };

  return {
    userId,
    requireUser() {
      if (!userId) throw new UnauthorizedError('Authentication required');
      return userId;
    },
    async isMember(groupId) {
      return (await membership(groupId)).member;
    },
    async canRead(dataset) {
      if (dataset.visibility === 'public') return true;
      if (!userId) return false;
      if (dataset.ownerId === userId) return true;
      return Boolean(dataset.groupId) && (await membership(dataset.groupId!)).member;
    },
    // The uploader always; for a group dataset also the group's owners and
    // admins — the people who run that group's labeling work on it.
    async canWrite(dataset) {
      if (!userId) return false;
      if (dataset.ownerId === userId) return true;
      if (dataset.visibility !== 'group' || !dataset.groupId) return false;
      const { member, role } = await membership(dataset.groupId);
      return member && (role === 'owner' || role === 'admin');
    },
    async readableFilter() {
      if (!userId) return { visibility: 'public' };
      const myGroups = await groups.getMyGroups(userId);
      return {
        $or: [
          { visibility: 'public' },
          { ownerId: userId },
          { visibility: 'group', groupId: { $in: myGroups.map((group) => group.groupId) } }
        ]
      };
    }
  };
};

/** The dataset, or 404 — also for a malformed id, which can name nothing. */
export const findDataset = async (id: string, withManifest = false): Promise<IDataset> => {
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new NotFoundError('Dataset not found');
  const query = Dataset.findById(id);
  const dataset = await (withManifest ? query.select('+manifest') : query);
  if (!dataset) throw new NotFoundError('Dataset not found');
  return dataset;
};

export const readableDataset = async (access: DatasetAccess, id: string): Promise<IDataset> => {
  const dataset = await findDataset(id);
  if (!(await access.canRead(dataset))) {
    throw access.userId ? new ForbiddenError('This dataset is shared with a group you are not in') : new UnauthorizedError('Sign in to see this dataset');
  }
  return dataset;
};

export const writableDataset = async (access: DatasetAccess, id: string): Promise<IDataset> => {
  access.requireUser();
  const dataset = await readableDataset(access, id);
  if (!(await access.canWrite(dataset))) {
    throw new ForbiddenError('Only the uploader or a group admin can change this dataset');
  }
  return dataset;
};
