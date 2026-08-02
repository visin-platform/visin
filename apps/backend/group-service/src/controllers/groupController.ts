import { Request, Response } from 'express';
import { BadRequestError, logger, fetchWithTimeout } from '@visin/backend-core';
import { InternalServiceRequest } from '../middleware/internalServiceAuth';
import * as svc from '../services/groupService';
import { GroupRole } from '../models/Group';

// Helper function to invalidate user tokens when membership changes
const invalidateUserTokens = async (userEmails: string[]): Promise<void> => {
  const authServiceUrl = process.env.AUTH_SERVICE_URL;
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

  if (!authServiceUrl || !internalToken) {
    logger.warn('Auth service not configured for token invalidation');
    return;
  }

  // Invalidate tokens for affected users by incrementing their token version
  for (const email of userEmails) {
    try {
      // One request per affected user, so an untimed call here stalls the whole
      // membership change for every remaining email behind it.
      const invalidateResponse = await fetchWithTimeout(`${authServiceUrl}/api/auth/internal/invalidate-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
          'x-service-id': 'group-service'
        },
        body: JSON.stringify({ email }),
        serviceName: 'auth-service'
      });

      if (invalidateResponse.ok) {
        logger.info('Successfully invalidated tokens for user', { email });
      } else {
        logger.error('Failed to invalidate tokens', { email, status: invalidateResponse.status });
      }
    } catch (error) {
      logger.error('Failed to invalidate tokens', { email, error: (error as Error).message });
    }
  }
};

const userEmail = (req: InternalServiceRequest): string => {
  // Internal services act on behalf of a user named in `?userEmail=`. It has to
  // come from the query string: `validateRequest` parses the body through a Zod
  // object schema, which strips unknown keys, so a `userEmail` sent in the body
  // never reaches the controller.
  if (req.isInternalService) {
    const email = req.query?.userEmail;
    const value = Array.isArray(email) ? email[0] : email;
    return typeof value === 'string' ? value.toLowerCase() : '';
  }
  // For user requests, extract from authenticated user
  return (req.user?.email || '').toLowerCase();
};

export const createGroup = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const email = userEmail(req);
  if (!email) {
    throw new BadRequestError('User email required');
  }
  const { name } = req.body as { name: string };
  const group = await svc.createGroup(email, name);
  res.status(201).json({ success: true, data: group });
};

export const listMine = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const email = userEmail(req);
  if (!email) {
    throw new BadRequestError('User email required');
  }
  const groups = await svc.listMyGroups(email);

  // Update last activity for this user in each group
  await svc.updateMemberActivity(groups.map((group) => group._id.toString()), email);

  res.json({ success: true, data: groups });
};

export const listMyDeleted = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const email = userEmail(req);
  if (!email) {
    throw new BadRequestError('User email required');
  }
  const groups = await svc.listMyDeletedGroups(email);
  res.json({ success: true, data: groups });
};

/**
 * Feeds auth-service's `groupRoles` JWT claim: the distinct roles the user
 * holds across all their groups. The fronts gate admin-only UI on "am I
 * owner/admin anywhere", and that is the only thing the token needs — anything
 * wanting the groups themselves (account-front's management UI, label-service)
 * asks this service directly rather than trusting a claim that goes stale
 * between refreshes.
 */
export const getMyGroupRoles = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const email = userEmail(req);
  if (!email) {
    throw new BadRequestError('User email required');
  }
  const groups = await svc.listMyGroups(email);
  const roles = [...new Set(groups.map(group => svc.memberRole(group, email)).filter(Boolean))];
  res.json({ success: true, data: roles });
};

export const getOne = async (req: Request, res: Response): Promise<void> => {
  const group = await svc.getGroupIfMember(req.params.id as string, userEmail(req));
  res.json({ success: true, data: group });
};

export const updateGroup = async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name: string };
  const group = await svc.updateGroup(req.params.id as string, userEmail(req), { name });
  res.json({ success: true, data: group });
};

export const deleteGroup = async (req: Request, res: Response): Promise<void> => {
  await svc.deleteGroup(req.params.id as string, userEmail(req));
  res.status(204).send();
};

export const restoreGroup = async (req: Request, res: Response): Promise<void> => {
  const group = await svc.restoreGroup(req.params.id as string, userEmail(req));
  res.json({ success: true, data: group });
};

export const permanentlyDeleteGroup = async (req: Request, res: Response): Promise<void> => {
  await svc.permanentlyDeleteGroup(req.params.id as string, userEmail(req));
  res.status(204).send();
};

export const addMember = async (req: Request, res: Response): Promise<void> => {
  const { email, role } = req.body as { email: string; role?: GroupRole };
  const group = await svc.addMember(req.params.id as string, userEmail(req), email, role);

  // Invalidate tokens for the added user
  await invalidateUserTokens([email]);

  res.status(201).json({ success: true, data: group });
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  const { role } = req.body as { role: GroupRole };
  const group = await svc.updateMemberRole(
    req.params.id as string,
    userEmail(req),
    req.params.memberEmail as string,
    role
  );

  // Invalidate tokens for the user whose role changed
  await invalidateUserTokens([req.params.memberEmail as string]);

  res.json({ success: true, data: group });
};

export const removeMember = async (req: Request, res: Response): Promise<void> => {
  const group = await svc.removeMember(req.params.id as string, userEmail(req), req.params.memberEmail as string);

  // Invalidate tokens for the removed user
  await invalidateUserTokens([req.params.memberEmail as string]);

  res.json({ success: true, data: group });
};

export const membership = async (req: Request, res: Response): Promise<void> => {
  const email = userEmail(req);
  const result = await svc.checkMembership(req.params.id as string, email);
  res.json({ success: true, ...result });
};
