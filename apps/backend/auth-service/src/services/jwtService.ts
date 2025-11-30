import * as jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN = '24h';

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  picture?: string;
  roles?: string[];
  isApproved?: boolean;
  groups?: string[];
  tokenVersion?: number;
}

export const generateJWT = (user: UserPayload): string => {
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyJWT = (token: string): UserPayload => {
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

export const decodeJWT = (token: string): UserPayload | null => {
  try {
    return jwt.decode(token) as UserPayload;
  } catch (error) {
    return null;
  }
};
