import * as jwt from 'jsonwebtoken';

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
}

/**
 * Signs a session token that expires at `expiresAt` — its session's hard cap.
 * Idle expiry and revocation are the session document's job, checked on every
 * request, so the token's own lifetime is only the outer bound.
 */
export const generateJWT = (user: UserPayload, expiresAt: Date): string => {
  const expiresIn = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return jwt.sign(user, process.env.JWT_SECRET!, { expiresIn });
};

export const verifyJWT = (token: string): UserPayload => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as UserPayload;
  } catch (error) {
    throw new Error('Invalid or expired token', { cause: error });
  }
};

export const decodeJWT = (token: string): UserPayload | null => {
  try {
    return jwt.decode(token) as UserPayload;
  } catch {
    return null;
  }
};
