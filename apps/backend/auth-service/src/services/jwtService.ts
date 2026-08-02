import * as jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN = '24h';

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  picture?: string;
  roles?: string[];
  isApproved?: boolean;
  /**
   * Distinct group roles ('owner' | 'admin' | 'member') the user holds, from
   * group-service. Group ids are not carried: nothing reads them, and callers
   * needing the groups themselves query group-service directly.
   */
  groupRoles?: string[];
  tokenVersion?: number;
}

export const generateJWT = (user: UserPayload): string => {
  return jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
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
