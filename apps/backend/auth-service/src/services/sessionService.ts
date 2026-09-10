import { Response } from 'express';
import { logger, fetchWithTimeout } from '@visin/backend-core';
import { generateJWT, UserPayload } from './jwtService';
import { IUser } from '../models/User';

export const ACCESS_TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  domain: process.env.COOKIE_DOMAIN || 'localhost',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export const displayName = (user: Pick<IUser, 'firstName' | 'lastName' | 'email'>): string =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

/**
 * The distinct group roles ('owner' | 'admin' | 'member') the user holds, for
 * the `groupRoles` claim. Group *ids* are deliberately not in the token: no
 * service or front reads them, and callers that need the groups themselves ask
 * group-service directly instead of trusting a claim that goes stale between
 * refreshes.
 */
export const getUserGroupRoles = async (userId: string): Promise<string[]> => {
  let groupRoles: string[] = [];
  try {
    const groupServiceUrl = process.env.GROUP_SERVICE_URL;
    const internalToken = process.env.INTERNAL_SERVICE_TOKEN;

    if (groupServiceUrl && internalToken) {
      const groupResponse = await fetchWithTimeout(
        `${groupServiceUrl}/api/groups/mine/roles?userId=${encodeURIComponent(userId)}`,
        {
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
        }
      );

      if (groupResponse.ok) {
        const groupResult = await groupResponse.json();
        if (groupResult.success) {
          groupRoles = groupResult.data || [];
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to fetch user groups for JWT', { userId, error: (error as Error).message });
  }

  return groupRoles;
};

/**
 * Mints a session for an authenticated user and sets the SSO cookie. Google
 * sign-in, password sign-in, and a password change all go through here, so a
 * session is identical however it was obtained — same claims, same cookie,
 * same group-role refresh.
 *
 * `tokenVersion` is read from the passed document, so a caller that has just
 * bumped it must pass the *updated* user, or the new cookie will be stale on
 * arrival.
 */
export const issueSession = async (
  res: Response,
  dbUser: IUser,
  name: string = displayName(dbUser)
): Promise<{ payload: UserPayload; token: string }> => {
  const groupRoles = await getUserGroupRoles(dbUser._id.toString());

  const payload: UserPayload = {
    id: dbUser._id.toString(),
    email: dbUser.email,
    name,
    groupRoles,
    tokenVersion: dbUser.tokenVersion || 1
  };

  const token = generateJWT(payload);
  res.cookie('access_token', token, ACCESS_TOKEN_COOKIE_OPTIONS);
  return { payload, token };
};
