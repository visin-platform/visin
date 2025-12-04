import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import ApiToken from '../models/ApiToken';
import { AuthRequest } from './authMiddleware';

export const apiTokenMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // If user is already authenticated (e.g. by JWT middleware running before this), skip
  if (req.user) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    // Simple heuristic: JWTs have 2 dots. API tokens (hex) don't.
    if (!token.includes('.')) {
      try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const apiToken = await ApiToken.findOne({ tokenHash, isActive: true });

        if (apiToken) {
          // Check expiration
          if (apiToken.expiresAt && new Date() > apiToken.expiresAt) {
             return res.status(401).json({ message: 'Token expired' });
          }

          // Update last used
          apiToken.lastUsedAt = new Date();
          await apiToken.save();

          // Attach context
          req.user = {
            id: apiToken.createdBy,
            // We can add a flag to indicate this is an API token session
          };
          
          // Attach projectId to request to enforce scope if needed
          // (req as any).projectId = apiToken.projectId;
          
          return next();
        }
      } catch (error) {
        console.error('API Token validation error', error);
      }
    }
  }
  
  next();
};
