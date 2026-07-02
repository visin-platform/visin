import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  try {
    // Check for internal service token first
    const internalToken = req.headers['x-internal-token'] as string;
    if (internalToken) {
      // Skip user auth for internal service requests - let internal service middleware handle it
      return next();
    }

    const JWT_SECRET = process.env.JWT_SECRET || '';
    const token = (req as any).cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ success: false, message: 'Access token required' });
      return;
    }
    const user = jwt.verify(token, JWT_SECRET) as UserPayload;

    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}
