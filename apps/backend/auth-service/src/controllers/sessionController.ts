import type { Request, Response } from 'express';
import { NotFoundError, UnauthorizedError, logger } from '@visin/backend-core';
import {
  clearSessionCookie,
  listSessions as findSessions,
  revokeOtherSessions as endOtherSessions,
  revokeSession as endSession
} from '../services/sessionService';
import { describeUserAgent } from '../services/userAgent';

/**
 * Where the user is signed in. Always their own sessions: the owner comes from
 * the caller's session and scopes every query, never from the path.
 */
export const listSessions = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const sessions = await findSessions(req.user.id);
  res.json({
    success: true,
    data: sessions.map(session => ({
      id: session._id.toString(),
      device: describeUserAgent(session.userAgent),
      method: session.method,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      current: session._id.toString() === req.user!.sid
    }))
  });
};

/** Signs one device out. Revoking the current one signs this browser out too. */
export const revokeSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { id } = req.params as { id: string };
  if (!await endSession(req.user.id, id)) {
    throw new NotFoundError('Session not found');
  }
  const signedOut = id === req.user.sid;
  if (signedOut) clearSessionCookie(res);
  logger.info('Session revoked', { userId: req.user.id, sessionId: id, current: signedOut });
  res.json({ success: true, signedOut });
};

/** "Sign out everywhere else": every session but the one making the request. */
export const revokeOtherSessions = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  // A pre-sessions token has no session of its own to keep, so this ends all of
  // them; that token itself still expires within a day.
  const revoked = await endOtherSessions(req.user.id, req.user.sid);
  logger.info('Other sessions revoked', { userId: req.user.id, revoked });
  res.json({ success: true, revoked });
};
