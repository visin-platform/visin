import { Request, Response } from 'express';
import { InternalServiceRequest } from '../middleware/internalServiceAuth';
import * as svc from '../services/groupService';
import { GroupRole } from '../models/Group';

// Helper function to invalidate user tokens when membership changes
const invalidateUserTokens = async (userEmails: string[]): Promise<void> => {
  const authServiceUrl = process.env.AUTH_API_URL;
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

  if (!authServiceUrl || !internalToken) {
    console.warn('Auth service not configured for token invalidation');
    return;
  }

  // Invalidate tokens for affected users by incrementing their token version
  for (const email of userEmails) {
    try {
      const invalidateResponse = await fetch(`${authServiceUrl}/api/auth/internal/invalidate-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
          'x-service-id': 'group-service'
        },
        body: JSON.stringify({ email })
      });

      if (invalidateResponse.ok) {
        console.log(`Successfully invalidated tokens for user: ${email}`);
      } else {
        console.error(`Failed to invalidate tokens for ${email}: ${invalidateResponse.status}`);
      }
    } catch (error) {
      console.error(`Failed to invalidate tokens for ${email}:`, error);
    }
  }
};const userEmail = (req: InternalServiceRequest) => {
  // For internal service requests, extract email from request body or params
  if (req.isInternalService) {
    return req.body?.userEmail || req.query?.userEmail || req.params?.userEmail;
  }
  // For user requests, extract from authenticated user
  return ((req as any).user?.email || '').toLowerCase();
};

export const createGroup = async (req: InternalServiceRequest, res: Response) => {
  try {
    const email = userEmail(req);
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'User email required' 
      });
    }
    const { name } = req.body as { name: string };
    if (!name) return res.status(400).json({ success: false, message: 'name required' });
    const group = await svc.createGroup(email, name);
    res.status(201).json({ success: true, data: group });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const listMine = async (req: InternalServiceRequest, res: Response) => {
  try {
    const email = userEmail(req);
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'User email required' 
      });
    }
    const groups = await svc.listMyGroups(email);
    
    // Update last activity for this user in each group
    for (const group of groups) {
      await svc.updateMemberActivity((group as any)._id.toString(), email);
    }
    
    res.json({ success: true, data: groups });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const listMyDeleted = async (req: InternalServiceRequest, res: Response) => {
  try {
    const email = userEmail(req);
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'User email required' 
      });
    }
    const groups = await svc.listMyDeletedGroups(email);
    res.json({ success: true, data: groups });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const getUserGroupIds = async (req: InternalServiceRequest, res: Response) => {
  try {
    const email = userEmail(req);
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'User email required' 
      });
    }
    const groups = await svc.listMyGroups(email);
    const groupIds = groups.map(group => (group as any)._id.toString());
    res.json({ success: true, data: groupIds });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const getOne = async (req: Request, res: Response) => {
  try {
    const group = await svc.getGroupIfMember(req.params.id, userEmail(req));
    res.json({ success: true, data: group });
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const updateGroup = async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name: string };
    if (!name) return res.status(400).json({ success: false, message: 'name required' });
    const group = await svc.updateGroup(req.params.id, userEmail(req), { name });
    res.json({ success: true, data: group });
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteGroup = async (req: Request, res: Response) => {
  try {
    await svc.deleteGroup(req.params.id, userEmail(req));
    res.status(204).send();
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const restoreGroup = async (req: Request, res: Response) => {
  try {
    const group = await svc.restoreGroup(req.params.id, userEmail(req));
    res.json({ success: true, data: group });
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const permanentlyDeleteGroup = async (req: Request, res: Response) => {
  try {
    await svc.permanentlyDeleteGroup(req.params.id, userEmail(req));
    res.status(204).send();
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const addMember = async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body as { email: string; role?: GroupRole };
    if (!email) return res.status(400).json({ success: false, message: 'email required' });
    const group = await svc.addMember(req.params.id, userEmail(req), email, role);
    
    // Invalidate tokens for the added user
    await invalidateUserTokens([email]);
    
    res.status(201).json({ success: true, data: group });
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    if (e.message === 'ALREADY_MEMBER') return res.status(400).json({ success: false, message: 'user is already a member' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const group = await svc.updateMemberRole(
      req.params.id,
      userEmail(req),
      req.params.memberEmail,
      (req.body as any).role
    );
    
    // Invalidate tokens for the user whose role changed
    await invalidateUserTokens([req.params.memberEmail]);
    
    res.json({ success: true, data: group });
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    if (e.message === 'MEMBER_NOT_FOUND') return res.status(404).json({ success: false, message: 'member not found' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const removeMember = async (req: Request, res: Response) => {
  try {
    const group = await svc.removeMember(req.params.id, userEmail(req), req.params.memberEmail);
    
    // Invalidate tokens for the removed user
    await invalidateUserTokens([req.params.memberEmail]);
    
    res.json({ success: true, data: group });
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    if (e.message === 'FORBIDDEN') return res.status(403).json({ success: false, message: 'forbidden' });
    res.status(500).json({ success: false, message: e.message });
  }
};

export const membership = async (req: Request, res: Response) => {
  try {
    const email = userEmail(req);
    const result = await svc.checkMembership(req.params.id, email);
    res.json({ success: true, ...result });
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'not found' });
    res.status(500).json({ success: false, message: e.message });
  }
};
