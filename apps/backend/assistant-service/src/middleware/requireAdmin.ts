import { ForbiddenError } from '@visin/backend-core';
import { type RequestHandler } from 'express';
import { isPlatformAdmin } from '../services/settings';

export const requireAdmin: RequestHandler = async (req, _res, next) => {
  try {
    if (await isPlatformAdmin(req.user!.id)) next();
    else next(new ForbiddenError('Only an administrator can change the analyst'));
  } catch (error) {
    next(error);
  }
};
