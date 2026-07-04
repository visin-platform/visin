import { Response } from 'express';
import crypto from 'crypto';
import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import ApiToken from '../models/ApiToken';
import { AuthRequest } from '../middleware/authMiddleware';
import { isProjectOwner } from '../services/projectAccessService';

// Every route in apiTokenRoutes.ts is mounted behind `router.use(authMiddleware)`,
// so req.user is always set by the time these handlers run.

export const createToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, projectId, expiresInDays } = req.body;
  const userId = req.user!.id;

  if (!(await isProjectOwner(userId, projectId))) {
    throw new ForbiddenError('Only the project owner can create API tokens for it');
  }

  // Generate token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const prefix = rawToken.substring(0, 7);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  let expiresAt: Date | undefined;
  if (expiresInDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  }

  const apiToken = new ApiToken({
    name,
    tokenHash,
    prefix,
    projectId,
    createdBy: userId,
    expiresAt
  });

  await apiToken.save();

  res.status(201).json({
    success: true,
    data: {
      ...apiToken.toObject(),
      token: rawToken // Return raw token only once
    }
  });
};

export const getTokens = async (req: AuthRequest, res: Response): Promise<void> => {
  const projectId = req.params.projectId as string;

  if (!(await isProjectOwner(req.user!.id, projectId))) {
    throw new ForbiddenError('Only the project owner can view its API tokens');
  }

  const tokens = await ApiToken.find({ projectId, isActive: true }).sort({ createdAt: -1 });
  res.json({ success: true, data: tokens });
};

export const revokeToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const token = await ApiToken.findById(id);
  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (!(await isProjectOwner(req.user!.id, token.projectId.toString()))) {
    throw new ForbiddenError('Only the project owner can revoke its API tokens');
  }

  token.isActive = false;
  await token.save();

  res.json({ success: true, message: 'Token revoked' });
};
