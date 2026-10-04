import { Request, Response } from 'express';
import { appLink, excerpt, NotFoundError, sendSharePage } from '@visin/backend-core';
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

/**
 * The page a link to a group's public page unfurls from, which sends people on to the app. A group whose page is off,
 * that was deleted or never existed, and a deployment with no app address, all answer the same: nothing to share.
 */
export const getShare = async (req: Request, res: Response): Promise<void> => {
  const handle = req.params.handle as string;
  const url = appLink(`/g/${encodeURIComponent(handle)}`);
  if (!url) throw new NotFoundError('Nothing to share here');
  const group = await getPublicGroup(handle).catch((error: unknown) => {
    if (error instanceof NotFoundError) throw new NotFoundError('Nothing to share here');
    throw error;
  });
  sendSharePage(res, {
    url,
    title: group.name,
    description: group.description ? excerpt(group.description) : 'A group on Visin',
    image: appLink('/og-image.jpg')
  });
};
