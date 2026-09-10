import crypto from 'crypto';
import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import ApiToken from '../models/ApiToken';
import { isProjectOwner } from './projectAccessService';
import { requireUserCredential } from '../middleware/projectTokenContext';

interface CreateTokenData {
  name: string;
  projectId: string;
  expiresInDays?: number;
}

export const createToken = async ({ name, projectId, expiresInDays }: CreateTokenData, userId: string) => {
  requireUserCredential();
  if (!(await isProjectOwner(userId, projectId))) {
    throw new ForbiddenError('Only the project owner can create API tokens for it');
  }

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

  return {
    ...apiToken.toObject(),
    token: rawToken
  };
};

export const getTokens = async (projectId: string, userId: string) => {
  requireUserCredential();
  if (!(await isProjectOwner(userId, projectId))) {
    throw new ForbiddenError('Only the project owner can view its API tokens');
  }

  return ApiToken.find({ projectId, isActive: true }).sort({ createdAt: -1 });
};

export const revokeToken = async (id: string, userId: string) => {
  requireUserCredential();
  const token = await ApiToken.findById(id);
  if (!token) {
    throw new NotFoundError('Token not found');
  }

  if (!(await isProjectOwner(userId, token.projectId.toString()))) {
    throw new ForbiddenError('Only the project owner can revoke its API tokens');
  }

  token.isActive = false;
  await token.save();
};
