import { Request, Response } from 'express';
import { getPublicGroup, lookupPublicGroups } from '../services/groupService';

/** A group's public page, for anyone. */
export const getPublic = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getPublicGroup(req.params.handle as string) });
};

/** Names and handles for the owners of what other services list. Groups without a public page are left out. */
export const lookupPublic = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body as { ids: string[] };
  res.json({ success: true, data: await lookupPublicGroups(ids) });
};
