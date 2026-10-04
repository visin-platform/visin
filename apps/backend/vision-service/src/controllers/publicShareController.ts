import type { Request, Response } from 'express';
import { sendSharePage } from '@visin/backend-core';
import { leaderboardSharePage, projectSharePage, projectSitemap } from '../services/shareService';

/** The page a link to a public project unfurls from, which sends people on to the app. */
export const getProjectShare = async (req: Request, res: Response): Promise<void> => {
  sendSharePage(res, await projectSharePage(String(req.params.id)));
};

/** The public projects' addresses, for search engines. */
export const getSitemap = async (_req: Request, res: Response): Promise<void> => {
  res
    .status(200)
    .set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' })
    .send(await projectSitemap());
};

export const getLeaderboardShare = async (req: Request, res: Response): Promise<void> => {
  sendSharePage(res, await leaderboardSharePage(String(req.params.slug), Number(req.params.version)));
};
