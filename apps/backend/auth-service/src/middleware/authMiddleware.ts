import { Request, Response, NextFunction } from 'express';
import { verifyJWT, UserPayload } from '../services/jwtService';
import { User } from '../models/User';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ success: false, message: 'Access token required' });
      return;
    }
    const decoded = verifyJWT(token);

    // Check if token version is valid
    const dbUser = await User.findOne({ email: decoded.email.toLowerCase() });
    if (!dbUser) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    // If token version is missing or doesn't match, token is invalid
    if (decoded.tokenVersion == null || decoded.tokenVersion !== dbUser.tokenVersion) {
      res.status(401).json({ success: false, message: 'Token has been invalidated' });
      return;
    }

    req.user = decoded;

    // attach db user (if needed elsewhere)
    (req as any).dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Token verification failed:', (error as Error)?.message);
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = verifyJWT(token);
      req.user = decoded;
      // Upsert but do not block on approval
      await User.findOneAndUpdate(
        { email: decoded.email.toLowerCase() },
        {
          $setOnInsert: { email: decoded.email.toLowerCase(), signupMethod: 'google' },
          $set: { lastLoginAt: new Date() }
        },
        { new: true, upsert: true }
      );
    }
    next();
  } catch {
    next();
  }
};

export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const dbUser = (req as any).dbUser;
    if (!dbUser || !dbUser.roles || !dbUser.roles.includes(role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    next();
  };
};

// Enforce approval after basic authentication for protected areas; allow only specific endpoints before approval
export const requireApproved = (req: Request, res: Response, next: NextFunction): void => {
  const dbUser = (req as any).dbUser;
  if (!dbUser) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return;
  }
  if (!dbUser.isApproved) {
    res.status(403).json({ success: false, message: 'User not approved' });
    return;
  }
  next();
};
