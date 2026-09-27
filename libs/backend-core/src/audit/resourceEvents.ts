import { logger } from '../logging/logger';
import type { ResourceOwner } from '../ownership/types';
import { ResourceEvent, type IResourceEvent, type ResourceEventAction } from './ResourceEvent';

export interface RecordResourceEventInput {
  service: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  action: ResourceEventAction;
  actorId: string;
  /** the resource's owner when this happened; for a transfer, before it */
  owner: ResourceOwner;
  /** a transfer's new owner */
  to?: ResourceOwner;
  visibility?: string;
}

const groupsOf = (...owners: (ResourceOwner | undefined)[]): string[] => [
  ...new Set(owners.flatMap((owner) => (owner?.kind === 'group' ? [owner.id] : [])))
];

/**
 * Write one row, and never let writing it fail the change it describes: the
 * change has happened either way. The process log carries the same line, so a
 * Mongo outage costs the history rather than the record of it.
 */
export const recordResourceEvent = (input: RecordResourceEventInput): void => {
  const { owner, to, ...rest } = input;
  logger.info('Resource event', { ...rest, owner, to });
  void ResourceEvent.create({
    ...rest,
    at: new Date(),
    ...(to ? { from: owner, to } : {}),
    groupIds: groupsOf(owner, to)
  }).catch((error: Error) => {
    logger.warn('Could not record a resource event', { error: error?.message });
  });
};

/** A group's history, newest first: everything it owned, or was given or lost. */
export const listResourceEvents = async ({ groupId, limit = 100 }: { groupId: string; limit?: number }): Promise<IResourceEvent[]> =>
  ResourceEvent.find({ groupIds: groupId }).sort({ at: -1 }).limit(limit).lean();
