import { Request, Response } from 'express';
import { getPublicGroup, lookupPublicGroups, searchPublicGroups } from '../services/groupService';

/** A group's public page, for anyone. */
export const getPublic = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getPublicGroup(req.params.handle as string) });
};

/** Names and handles for the owners of what other services list. Groups without a public page are left out. */
export const lookupPublic = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body as { ids: string[] };
  res.json({ success: true, data: await lookupPublicGroups(ids) });
};

/** Groups with a public page, found by the start of their handle or name. */
export const searchPublic = async (req: Request, res: Response): Promise<void> => {
  const { q, limit } = req.query as unknown as { q: string; limit: number };
  res.json({ success: true, data: await searchPublicGroups(q, limit) });
};
