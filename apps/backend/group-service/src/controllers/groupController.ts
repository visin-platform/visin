import { Request, Response } from 'express';
import { BadRequestError, UnauthorizedError } from '@visin/backend-core';
import { InternalServiceRequest } from '../middleware/internalServiceAuth';
import * as svc from '../services/groupService';
import { GroupRole } from '../models/Group';

// Internal callers assert an immutable account ID after service authentication.
// Browser input never overrides the authenticated actor.
const actorId = (req: InternalServiceRequest): string => {
  const value = req.isInternalService ? req.query.userId : req.user?.id;
  if (typeof value !== 'string' || !value) throw new BadRequestError('User ID required');
  return value;
};

export const createGroup = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const userId = actorId(req);
  const { name } = req.body as { name: string };
  const group = await svc.createGroup(userId, name, req.user?.email);
  res.status(201).json({ success: true, data: group });
};

export const listMine = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const userId = actorId(req);
  const groups = await svc.listMyGroups(userId);

  // Update last activity for this user in each group
  await svc.updateMemberActivity(
    groups.map((group) => group._id.toString()),
    userId
  );

  res.json({ success: true, data: groups });
};

export const listMyDeleted = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const userId = actorId(req);
  const groups = await svc.listMyDeletedGroups(userId);
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
  const userId = actorId(req);
  const groups = await svc.listMyGroups(userId);
  const roles = [...new Set(groups.map((group) => svc.memberRole(group, userId)).filter(Boolean))];
  res.json({ success: true, data: roles });
};

export const getOne = async (req: Request, res: Response): Promise<void> => {
  const group = await svc.getGroupIfMember(req.params.id as string, actorId(req));
  res.json({ success: true, data: group });
};

export const updateGroup = async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name: string };
  const group = await svc.updateGroup(req.params.id as string, actorId(req), { name });
  res.json({ success: true, data: group });
};

export const deleteGroup = async (req: Request, res: Response): Promise<void> => {
  await svc.deleteGroup(req.params.id as string, actorId(req));
  res.status(204).send();
};

export const restoreGroup = async (req: Request, res: Response): Promise<void> => {
  const group = await svc.restoreGroup(req.params.id as string, actorId(req));
  res.json({ success: true, data: group });
};

export const permanentlyDeleteGroup = async (req: Request, res: Response): Promise<void> => {
  await svc.permanentlyDeleteGroup(req.params.id as string, actorId(req));
  res.status(204).send();
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  const { role } = req.body as { role: GroupRole };
  const group = await svc.updateMemberRole(req.params.id as string, actorId(req), req.params.memberId as string, role);

  res.json({ success: true, data: group });
};

export const removeMember = async (req: Request, res: Response): Promise<void> => {
  const group = await svc.removeMember(req.params.id as string, actorId(req), req.params.memberId as string);

  res.json({ success: true, data: group });
};

export const activity = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await svc.groupActivity(req.params.id as string, actorId(req)) });
};

export const membership = async (req: Request, res: Response): Promise<void> => {
  const userId = actorId(req);
  const result = await svc.checkMembership(req.params.id as string, userId);
  res.json({ success: true, ...result });
};

export const createInvitation = async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = req.body as { role: GroupRole; userId?: string };
  if (userId) {
    res.status(201).json({ success: true, data: await svc.inviteAccount(req.params.id as string, actorId(req), userId, role) });
    return;
  }
  const data = await svc.createInvitation(req.params.id as string, actorId(req), role);
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ success: true, data });
};

export const revokeInvitations = async (req: Request, res: Response): Promise<void> => {
  await svc.revokeInvitations(req.params.id as string, actorId(req));
  res.status(204).send();
};

export const previewInvitation = async (req: Request, res: Response): Promise<void> => {
  const data = await svc.previewInvitation(req.body.token as string);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
};

export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) throw new UnauthorizedError('Sign in to accept an invitation');
  const data = await svc.acceptInvitation(req.body.token as string, req.user.id, req.user.email);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
};

/** "Add member": accounts an owner or admin could invite, emails masked. */
export const findCandidates = async (req: Request, res: Response): Promise<void> => {
  const data = await svc.findCandidates(req.params.id as string, actorId(req), req.query.q as string);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
};

/** Invitations addressed to the caller, waiting for an answer. */
export const listMyInvitations = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await svc.listMyInvitations(actorId(req)) });
};

export const acceptAccountInvitation = async (req: InternalServiceRequest, res: Response): Promise<void> => {
  const email = req.isInternalService ? undefined : req.user?.email;
  const data = await svc.acceptAccountInvitation(req.params.invitationId as string, actorId(req), email);
  res.json({ success: true, data });
};

export const declineAccountInvitation = async (req: Request, res: Response): Promise<void> => {
  await svc.declineAccountInvitation(req.params.invitationId as string, actorId(req));
  res.status(204).send();
};
