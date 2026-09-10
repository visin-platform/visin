import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import ApiToken from '../models/ApiToken';
import { AuthRequest } from './authMiddleware';
import { logger, looksLikeApiKey } from '@visin/backend-core';
import { projectTokenContext } from './projectTokenContext';

// How stale lastUsedAt must be before we bother writing an update — this
// middleware runs on every authenticated request, so writing unconditionally
// turns every read into a write.
const LAST_USED_STALE_MS = 60_000;

export const apiTokenMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // If user is already authenticated (e.g. by JWT middleware running before this), skip
  if (req.user) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    
    // Simple heuristic: JWTs have 2 dots. API tokens (hex) don't.
    //
    // A user API key (`vsn_live_…`, backend-core) has no dot either, so the
    // heuristic alone would send one down this path to be hashed and looked up
    // — a guaranteed miss, and a wasted indexed query on every request an
    // assistant makes. Worse, it would leave the only thing distinguishing two
    // credential types being which lookup happens to fail first. `apiKeyAuth`
    // owns that credential; skip it explicitly.
    if (!token.includes('.') && !looksLikeApiKey(token)) {
      try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const apiToken = await ApiToken.findOne({ tokenHash, isActive: true });

        if (apiToken) {
          // Check expiration
          if (apiToken.expiresAt && new Date() > apiToken.expiresAt) {
             return res.status(401).json({ message: 'Token expired' });
          }

          // Update last used, but only if it's stale — fire-and-forget so it
          // never adds latency to the request it's piggybacking on.
          const now = new Date();
          if (!apiToken.lastUsedAt || now.getTime() - apiToken.lastUsedAt.getTime() > LAST_USED_STALE_MS) {
            ApiToken.updateOne({ _id: apiToken._id }, { lastUsedAt: now }).catch(err =>
              logger.warn('Failed to update API token lastUsedAt', { error: err.message })
            );
          }

          // Attach context
          req.user = {
            id: apiToken.createdBy,
            // We can add a flag to indicate this is an API token session
          };
          
          // Attach projectId to request to enforce scope for API tokens
          req.projectId = apiToken.projectId.toString();
          
          return projectTokenContext.run({ projectId: req.projectId, userId: apiToken.createdBy }, next);
        }
      } catch (error) {
        logger.error('API Token validation error', { error: error instanceof Error ? error.message : error });
      }
    }
  }
  
  next();
};
