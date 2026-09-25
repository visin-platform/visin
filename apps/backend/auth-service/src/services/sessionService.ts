import { Request, Response } from 'express';
import { logger, fetchWithTimeout, UnauthorizedError } from '@visin/backend-core';
import { generateJWT, UserPayload } from './jwtService';
import { IUser } from '../models/User';
import { ISession, Session, SignInMethod } from '../models/Session';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A session ends after this long unused. Sliding: every renewal (`/auth/verify`,
 * run on each app load and when a backgrounded app comes back) pushes it on.
 */
export const SESSION_IDLE_TTL_MS = 30 * DAY_MS;

/**
 * However active a session is, it ends this long after sign-in, so a stolen
 * cookie cannot keep itself alive by being used.
 */
export const SESSION_MAX_AGE_MS = 90 * DAY_MS;

/**
 * Renewal writes at most this often per session: a page load in the shell runs
 * several verifies at once, and "last active" needs no finer grain.
 */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  domain: process.env.COOKIE_DOMAIN || 'localhost',
  path: '/'
};

/** The cookie lasts as long as the session's idle expiry; renewal re-sets it. */
export const sessionCookieOptions = (session: Pick<ISession, 'expiresAt'>) => ({
  ...BASE_COOKIE_OPTIONS,
  maxAge: Math.max(0, session.expiresAt.getTime() - Date.now())
});

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie('access_token', { domain: BASE_COOKIE_OPTIONS.domain, path: BASE_COOKIE_OPTIONS.path });
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
        const groupResult = (await groupResponse.json()) as { success?: boolean; data?: string[] };
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

interface SessionIdentity {
  /** The display name carried in the token. */
  name?: string;
  picture?: string;
}

const userAgentOf = (req: Request): string | undefined => {
  const userAgent = req.headers?.['user-agent'];
  return typeof userAgent === 'string' ? userAgent.slice(0, 512) : undefined;
};

/** Signs the token for `session`, with fresh group roles, and sets the cookie. */
async function mintSessionToken(
  res: Response,
  session: ISession,
  user: { id: string; email: string; tokenVersion?: number },
  identity: SessionIdentity
): Promise<{ payload: UserPayload; token: string }> {
  const payload: UserPayload = {
    id: user.id,
    email: user.email,
    name: identity.name ?? '',
    ...(identity.picture ? { picture: identity.picture } : {}),
    groupRoles: await getUserGroupRoles(user.id),
    tokenVersion: user.tokenVersion || 1,
    sid: session._id.toString()
  };
  const token = generateJWT(payload, session.absoluteExpiresAt);
  res.cookie('access_token', token, sessionCookieOptions(session));
  return { payload, token };
}

async function createSession(req: Request, userId: string, method: SignInMethod): Promise<ISession> {
  const now = Date.now();
  return Session.create({
    userId,
    method,
    userAgent: userAgentOf(req),
    lastSeenAt: new Date(now),
    expiresAt: new Date(now + SESSION_IDLE_TTL_MS),
    absoluteExpiresAt: new Date(now + SESSION_MAX_AGE_MS)
  });
}

/**
 * Signs a user in: a new session for this browser, its token, and the SSO
 * cookie. Google sign-in, password sign-in, setup and registration all come
 * through here, so a session is identical however it was obtained. Always a
 * fresh session — never an id the browser already held — so a session fixed
 * on someone before they signed in is never the one they are given.
 */
export const startSession = async (
  req: Request,
  res: Response,
  dbUser: IUser,
  method: SignInMethod,
  identity: SessionIdentity = {}
): Promise<{ payload: UserPayload; token: string }> => {
  const session = await createSession(req, dbUser._id.toString(), method);
  return mintSessionToken(
    res,
    session,
    { id: dbUser._id.toString(), email: dbUser.email, tokenVersion: dbUser.tokenVersion },
    { name: identity.name ?? displayName(dbUser), picture: identity.picture }
  );
};

/**
 * Renews the caller's session (`/auth/verify`, `/auth/refresh`): slides its
 * idle expiry, re-signs the token with fresh group roles, re-sets the cookie.
 */
export const renewSession = async (
  req: Request,
  res: Response
): Promise<{ payload: UserPayload; token: string }> => {
  const user = req.user!;
  if (!req.authSession) throw new UnauthorizedError('Session has ended');
  let session = req.authSession;

  const now = Date.now();
  if (session.lastSeenAt.getTime() <= now - SESSION_TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(Math.min(now + SESSION_IDLE_TTL_MS, session.absoluteExpiresAt.getTime()));
    const touched = await Session.findOneAndUpdate(
      { _id: session._id, userId: session.userId },
      { $set: { lastSeenAt: new Date(now), expiresAt } },
      { returnDocument: 'after' }
    );
    // Revoked between the middleware's check and here: renew nothing.
    if (!touched) throw new UnauthorizedError('Session has ended');
    session = touched;
  }

  return mintSessionToken(res, session, { id: user.id, email: user.email!, tokenVersion: user.tokenVersion },
    { name: user.name, picture: user.picture });
};

/**
 * After the account's `tokenVersion` moved on (password change, Google link):
 * ends every other session and re-signs this one against the updated account,
 * so the user keeps the device they are on and loses the rest. Pass the
 * *updated* user, or the new token is stale on arrival.
 */
export const continueSessionAlone = async (
  req: Request,
  res: Response,
  updatedUser: IUser,
  identity: SessionIdentity = {}
): Promise<{ payload: UserPayload; token: string }> => {
  const current = req.authSession;
  if (!current) throw new UnauthorizedError('Session has ended');
  await revokeOtherSessions(updatedUser._id.toString(), current._id.toString());
  const resolvedIdentity = { name: identity.name ?? req.user?.name ?? displayName(updatedUser), picture: identity.picture ?? req.user?.picture };
  return mintSessionToken(
    res,
    current,
    { id: updatedUser._id.toString(), email: updatedUser.email, tokenVersion: updatedUser.tokenVersion },
    resolvedIdentity
  );
};

/** Ends one of the user's sessions. False when there was no such session of theirs. */
export const revokeSession = async (userId: string, sessionId: string): Promise<boolean> => {
  const { deletedCount } = await Session.deleteOne({ _id: sessionId, userId });
  return deletedCount > 0;
};

/** Ends every session of the user's except `keepSessionId` (all of them when absent). */
export const revokeOtherSessions = async (userId: string, keepSessionId?: string): Promise<number> => {
  const { deletedCount } = await Session.deleteMany({
    userId,
    ...(keepSessionId ? { _id: { $ne: keepSessionId } } : {})
  });
  return deletedCount;
};

/** The user's live sessions, most recently active first. */
export const listSessions = async (userId: string): Promise<ISession[]> =>
  Session.find({ userId, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 });
