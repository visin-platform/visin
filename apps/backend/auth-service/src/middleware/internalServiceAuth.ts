import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const requireInternalServiceToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers['x-internal-token'] as string | undefined;
  const expected = process.env.INTERNAL_SERVICE_TOKEN;

  if (!expected) {
    res.status(500).json({ success: false, message: 'Internal service authentication not configured' });
    return;
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'Internal service token required' });
    return;
  }

  if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    res.status(401).json({ success: false, message: 'Invalid internal service token' });
    return;
  }

  next();
};
