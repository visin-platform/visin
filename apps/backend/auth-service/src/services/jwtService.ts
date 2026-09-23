import * as jwt from 'jsonwebtoken';
import { UnauthorizedError, SESSION_TOKEN_TYPE } from '@visin/backend-core';

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  picture?: string;
  roles?: string[];
  /**
   * Distinct group roles ('owner' | 'admin' | 'member') the user holds, from
   * group-service. Group ids are not carried: nothing reads them, and callers
   * needing the groups themselves query group-service directly.
   */
  groupRoles?: string[];
  tokenVersion?: number;
  /** The `user_sessions` document this token belongs to. */
  sid?: string;
  /** `SESSION_TOKEN_TYPE`, set by `generateJWT`. */
  typ?: string;
}

/**
 * Signs a session token that expires at `expiresAt` — its session's hard cap.
 * Idle expiry and revocation are the session document's job, checked on every
 * request, so the token's own lifetime is only the outer bound.
 */
export const generateJWT = (user: UserPayload, expiresAt: Date): string => {
  const expiresIn = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return jwt.sign({ ...user, typ: SESSION_TOKEN_TYPE }, process.env.JWT_SECRET!, { expiresIn });
};

export const verifyJWT = (token: string): UserPayload => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as UserPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
};

export const decodeJWT = (token: string): UserPayload | null => {
  try {
    return jwt.decode(token) as UserPayload;
  } catch {
    return null;
  }
};
