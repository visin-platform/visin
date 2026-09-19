import type { Request, Response } from 'express';
import { UnauthorizedError } from '@visin/backend-core';
import { linkGoogleAccount } from '../services/googleLinkService';
import { continueSessionAlone } from '../services/sessionService';

export async function linkGoogle(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  const user = await linkGoogleAccount(req.user.id, req.user.tokenVersion, req.body.currentPassword, req.body.idToken);
  // Linking bumped tokenVersion: keep this session, end the others.
  await continueSessionAlone(req, res, user);
  res.json({ success: true });
}
