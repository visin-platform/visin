import { Request, Response } from 'express';
import type { LeaderboardPageQuery, LeaderboardQuery } from '../validation/evaluationSchemas';
import * as publicService from '../services/publicLeaderboardService';

// Nothing here reads `req.user`: the public view is the same for everyone.

export const getPublicLeaderboards = async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await publicService.listPublicLeaderboards(req.query as unknown as LeaderboardPageQuery)
  });
};

export const getPublicLeaderboard = async (req: Request, res: Response): Promise<void> => {
  const { slug, version } = req.params as unknown as { slug: string; version: number };
  res.json({
    success: true,
    data: await publicService.getPublicLeaderboard(slug, version, req.query as unknown as LeaderboardQuery)
  });
};

export const getPublicEvaluation = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await publicService.getPublicEvaluation(req.params.id as string) });
};

/** A badge is an image anyone may embed: it carries nothing the public leaderboard page does not. */
export const getPublicBadge = async (req: Request, res: Response): Promise<void> => {
  const { slug, version, checkpointKey } = req.params as unknown as { slug: string; version: number; checkpointKey: string };
  const { project } = req.query as unknown as { project: string };
  const svg = await publicService.getPublicBadge(slug, version, checkpointKey, project);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.send(svg);
};
