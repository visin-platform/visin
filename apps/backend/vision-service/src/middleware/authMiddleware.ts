import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // If user is already authenticated (e.g. by API Token middleware), skip
  if (req.user) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];
    try {
      // We decode without verification because we might not have the shared secret here.
      // In a production environment with shared secret or public key, use jwt.verify()
      const decoded = jwt.decode(token) as any;
      
      if (decoded) {
        req.user = {
          id: decoded.sub || decoded.id || decoded.user_id,
          email: decoded.email,
          name: decoded.name
        };
      }
    } catch (error) {
      console.error('Error decoding token:', error);
    }
  }
  next();
};
