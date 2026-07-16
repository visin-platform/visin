import { Request } from 'express';
import { ForbiddenError, UnauthorizedError, UserPayload } from '@visin/backend-core';
import * as groups from '../clients/groupServiceClient';
import { GroupMembership } from '../clients/groupServiceClient';

// Per-request membership cache: several access checks in one request (e.g. job +
// bundle in the same group) should cost one group-service call, not two.
const requestCaches = new WeakMap<Request, Map<string, Promise<GroupMembership>>>();

export const requireUser = (req: Request): UserPayload => {
  if (!req.user?.id || !req.user.email) {
    throw new UnauthorizedError('Authenticated user required');
  }
  return req.user;
};

const membershipFor = (req: Request, groupId: string): Promise<GroupMembership> => {
  const user = requireUser(req);
  let cache = requestCaches.get(req);
  if (!cache) {
    cache = new Map();
    requestCaches.set(req, cache);
  }
  let membership = cache.get(groupId);
  if (!membership) {
    membership = groups.checkMembership(groupId, user.email!.toLowerCase());
    cache.set(groupId, membership);
  }
  return membership;
};

/** Any group member may work jobs / see bundles. */
export const assertMember = async (req: Request, groupId: string): Promise<void> => {
  const { member } = await membershipFor(req, groupId);
  if (!member) {
    throw new ForbiddenError('Not a member of this group');
  }
};

/** Group owner/admin administers bundles and jobs. */
export const assertAdmin = async (req: Request, groupId: string): Promise<void> => {
  const { member, role } = await membershipFor(req, groupId);
  if (!member || (role !== 'owner' && role !== 'admin')) {
    throw new ForbiddenError('Group owner/admin required');
  }
};
