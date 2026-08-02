import { Request, Response } from 'express';
import { NotFoundError, UnauthorizedError, logger, fetchWithTimeout } from '@visin/backend-core';
import { verifyGoogleToken } from '../services/googleAuthService';
import { generateJWT, UserPayload } from '../services/jwtService';
import { User } from '../models/User';

const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  domain: process.env.COOKIE_DOMAIN || 'localhost',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export const validateToken = async (req: Request, res: Response): Promise<void> => {
  const { idToken } = req.body;

  let googleUser;
  try {
    googleUser = await verifyGoogleToken(idToken);
  } catch {
    throw new UnauthorizedError('Invalid Google token');
  }
  if (!googleUser) {
    throw new UnauthorizedError('Invalid Google token');
  }

  const userEmail = googleUser.email || '';
  if (!userEmail) {
    throw new UnauthorizedError('Email not present in Google token');
  }

  // Find existing user only
  const dbUser = await User.findOne({ email: userEmail.toLowerCase() });

  if (!dbUser) {
    throw new NotFoundError('User not found');
  }

  // Update last login
  await User.updateOne({ _id: dbUser._id }, { $set: { lastLoginAt: new Date() } });

  // Update userPayload to use database user ID instead of Google sub
  const userPayload: UserPayload = {
    id: dbUser._id.toString(), // Use MongoDB _id instead of Google sub
    email: googleUser.email || '',
    name: googleUser.name || '',
    picture: googleUser.picture,
    tokenVersion: dbUser.tokenVersion || 1
  };

  // Fetch user group roles and include in JWT payload
  const groupRoles = await getUserGroupRoles(userPayload.email);

  const jwtPayload: UserPayload = {
    ...userPayload,
    groupRoles
  };

  const jwtToken = generateJWT(jwtPayload);

  // Set secure cookie for SSO across subdomains
  res.cookie('access_token', jwtToken, ACCESS_TOKEN_COOKIE_OPTIONS);

  res.json({
    success: true,
    user: userPayload,
    approved: dbUser.isApproved,
    token: jwtToken
  });
};

export const logout = (req: Request, res: Response): void => {
  res.clearCookie('access_token', {
    domain: process.env.COOKIE_DOMAIN || 'localhost',
    path: '/'
  });
  res.json({ success: true, message: 'Logged out successfully' });
};

export const invalidateUserTokens = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  // Increment token version to invalidate all existing tokens for this user
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $inc: { tokenVersion: 1 } },
    { new: true }
  );

  if (!user) {
    throw new NotFoundError('User not found');
  }

  logger.info('Invalidated tokens for user', { email, newTokenVersion: user.tokenVersion });

  res.json({
    success: true,
    message: 'User tokens invalidated successfully',
    newTokenVersion: user.tokenVersion
  });
};

/**
 * The distinct group roles ('owner' | 'admin' | 'member') the user holds, for
 * the `groupRoles` claim. Group *ids* are deliberately not in the token: no
 * service or front reads them, and callers that need the groups themselves ask
 * group-service directly instead of trusting a claim that goes stale between
 * refreshes.
 */
const getUserGroupRoles = async (email: string): Promise<string[]> => {
  // Fetch fresh data from group service
  let groupRoles: string[] = [];
  try {
    const groupServiceUrl = process.env.GROUP_SERVICE_URL;
    const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

    if (groupServiceUrl && internalToken) {
      const groupResponse = await fetchWithTimeout(`${groupServiceUrl}/api/groups/mine/roles?userEmail=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
          'x-service-id': 'auth-service'
        },
        // Tighter than the shared default: this sits on the sign-in path, and
        // a missing group list degrades gracefully (caught below).
        timeoutMs: 3000,
        serviceName: 'group-service'
      });

      if (groupResponse.ok) {
        const groupResult = await groupResponse.json();
        if (groupResult.success) {
          groupRoles = groupResult.data || [];
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch user groups for JWT', { email, error: (error as Error).message });
  }

  return groupRoles;
};

export const verifyAuth = async (req: Request, res: Response): Promise<void> => {
  const currentUser = req.user;
  if (!currentUser?.email) {
    throw new UnauthorizedError('No authenticated user');
  }

  // Fetch fresh user group roles
  const groupRoles = await getUserGroupRoles(currentUser.email);

  // Generate new JWT with fresh roles
  const jwtPayload: UserPayload = {
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name || '',
    picture: currentUser.picture,
    groupRoles,
    tokenVersion: currentUser.tokenVersion || 1
  };

  const newToken = generateJWT(jwtPayload);

  // Update cookie with fresh token
  res.cookie('access_token', newToken, ACCESS_TOKEN_COOKIE_OPTIONS);

  logger.info('Generated new token with fresh group roles', {
    email: currentUser.email,
    groupRoles
  });

  res.json({
    success: true,
    authenticated: true,
    user: jwtPayload,
    token: newToken
  });
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  // Get current user from JWT
  const currentUser = req.user;
  if (!currentUser?.email) {
    throw new UnauthorizedError('No authenticated user');
  }

  // Fetch fresh user group roles
  const groupRoles = await getUserGroupRoles(currentUser.email);

  // Generate new JWT with updated roles
  const jwtPayload: UserPayload = {
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name || '',
    picture: currentUser.picture,
    groupRoles,
    tokenVersion: currentUser.tokenVersion || 1
  };

  const newToken = generateJWT(jwtPayload);

  // Update cookie
  res.cookie('access_token', newToken, ACCESS_TOKEN_COOKIE_OPTIONS);

  res.json({
    success: true,
    token: newToken,
    groupRoles
  });
};

// Admin utility: mark a user approved
export const approveUser = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { isApproved: true } },
    { new: true }
  );

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({ success: true, user });
};

// Admin utility: list users
export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, users });
};
